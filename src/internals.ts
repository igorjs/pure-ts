/**
 * @module internals
 *
 * Shared low-level utilities used by Record, List, and Schema.
 *
 * This module is internal: nothing here is re-exported from the public API.
 * It contains:
 *   - **Type utilities** (`DeepReadonly`, `Draft`, `Primitive`) used across modules
 *   - **Deep freeze** (`deepFreezeRaw`) for in-place `Object.freeze` recursion
 *   - **Path recording** (`recordPath`) to resolve accessor lambdas like
 *     `u => u.address.city` into `['address', 'city']`
 *   - **Structural operations** (`getByPath`, `setByPath`) for immutable deep updates
 *   - **Draft proxy** (`createDraft`, `applyMutations`) powering `Record.produce()`
 *   - **Deep equality** (`deepEqual`) for `Record.equals()` / `List.equals()`
 */

/** JavaScript primitive types (non-object, non-function). */
export type Primitive = string | number | boolean | bigint | symbol | undefined | null;

/**
 * Recursively marks all properties as `readonly`.
 *
 * Handles arrays, Maps, Sets, and plain objects. Functions are left as-is
 * since they are inherently referentially transparent in this context.
 */
export type DeepReadonly<T> = T extends Primitive ? T
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepReadonly<U>>
  : T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
  : T extends ReadonlySet<infer U> ? ReadonlySet<DeepReadonly<U>>
  : T extends (...args: infer A) => infer R ? (...args: A) => R
  : { readonly [K in keyof T]: DeepReadonly<T[K]> };

/**
 * Draft type for `produce()` recipes.
 *
 * Properties are writable (for reassignment) but arrays become
 * `ReadonlyArray` so mutating methods like `.push()` are blocked
 * at the type level. The runtime proxy enforces the same constraint.
 */
export type Draft<T> = T extends Primitive ? T
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<Draft<U>>
  : T extends ReadonlyMap<infer K, infer V> ? ReadonlyMap<Draft<K>, Draft<V>>
  : T extends ReadonlySet<infer U> ? ReadonlySet<Draft<U>>
  : T extends (...args: infer A) => infer R ? (...args: A) => R
  : { -readonly [K in keyof T]: Draft<T[K]> };

/** Check whether `val` is a non-null object (excluding typed arrays). */
export const isObjectLike = (val: unknown): val is Record<string | symbol, unknown> =>
  val !== null && typeof val === "object" && !ArrayBuffer.isView(val);

/**
 * Recursively freeze an object and all nested properties.
 *
 * Skips already-frozen objects to avoid redundant work.
 * Handles both string-keyed and symbol-keyed properties.
 */
export const deepFreezeRaw = (obj: unknown): void => {
  if (!isObjectLike(obj) || Object.isFrozen(obj)) return;
  Object.freeze(obj);
  const keys = Object.keys(obj);
  // biome-ignore lint/style/useForOf: recursive hot-path during Record creation
  for (let i = 0; i < keys.length; i++) deepFreezeRaw((obj as Record<string, unknown>)[keys[i]!]);
  const syms = Object.getOwnPropertySymbols(obj);
  // biome-ignore lint/style/useForOf: recursive hot-path during Record creation
  for (let i = 0; i < syms.length; i++) deepFreezeRaw((obj as Record<symbol, unknown>)[syms[i]!]);
};

/**
 * Pooled path recorder for `recordPath()`.
 *
 * A single proxy + buffer is reused across all non-reentrant calls to avoid
 * allocating a new proxy and array for each `.set()` / `.update()` call.
 * If reentrance is detected (e.g. nested accessor), `recordPathSlow` is
 * used as a fallback with its own isolated proxy.
 */
let _pathBuf: string[] = [];
let _pathRecording = false;
const _pathHandler: ProxyHandler<object> = {
  get(_, prop) {
    if (typeof prop === "string") {
      _pathBuf.push(prop);
      return _pathSentinel;
    }
    return undefined;
  },
};
const _pathSentinel = new Proxy(Object.create(null), _pathHandler);

/**
 * Record the property path accessed by `accessor` on a proxy.
 *
 * Used internally by Record.set / Record.update to resolve type-safe
 * accessor lambdas like `u => u.address.city` into `['address', 'city']`.
 */
export const recordPath = <T>(accessor: (obj: T) => unknown): string[] => {
  if (_pathRecording) return recordPathSlow(accessor);
  _pathRecording = true;
  _pathBuf = [];
  accessor(_pathSentinel as T);
  const result = _pathBuf;
  _pathBuf = [];
  _pathRecording = false;
  return result;
};

/** Reentrant fallback for `recordPath`. Allocates a fresh proxy per call. */
const recordPathSlow = <T>(accessor: (obj: T) => unknown): string[] => {
  const path: string[] = [];
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (typeof prop === "string") {
        path.push(prop);
        return new Proxy({}, handler);
      }
      return undefined;
    },
  };
  accessor(new Proxy({}, handler) as T);
  return path;
};

/** Traverse `obj` along `path`, returning the leaf value or `undefined`. */
export const getByPath = (obj: unknown, path: readonly string[]): unknown => {
  let current = obj;
  // biome-ignore lint/style/useForOf: hot-path for record .at() and .update()
  for (let i = 0; i < path.length; i++) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[path[i]!];
  }
  return current;
};

/** Immutably set a value at a deep path, returning a structurally-shared copy. */
export const setByPath = <T>(obj: T, path: readonly string[], value: unknown, depth = 0): T => {
  if (depth === path.length) return value as T;
  const key = path[depth]!;
  const current = obj as Record<string, unknown>;
  const child = current[key];
  if (Array.isArray(child) && depth + 1 < path.length) {
    const idx = Number(path[depth + 1]);
    if (!Number.isNaN(idx)) {
      const copy = child.slice();
      copy[idx] = depth + 2 === path.length ? value : setByPath(copy[idx], path, value, depth + 2);
      return { ...current, [key]: copy } as T;
    }
  }
  return { ...current, [key]: setByPath(child, path, value, depth + 1) } as T;
};

// ── Draft proxy ─────────────────────────────────────────────────────────────
// `produce()` uses a Proxy-based draft that records mutations as data.
// The draft never mutates the original: all writes are captured as
// `{ path, value }` entries, then replayed via `setByPath` to build
// a structurally-shared copy of the original.

/** A single mutation captured during a `produce()` draft session. */
export interface Mutation {
  readonly path: readonly string[];
  readonly value: unknown;
}

/** Sentinel value for draft reads: distinguishes "no mutation recorded" from `undefined`. */
const DRAFT_UNSET: unique symbol = Symbol("unset");

/** Array methods that mutate in-place. These corrupt produce() because setByPath cannot replay them. */
const MUTATING_ARRAY_METHODS: ReadonlySet<string> = new Set([
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "fill",
  "copyWithin",
]);

/** Search mutations in reverse for the most recent write to [...currentPath, prop]. */
const findMutationValue = (
  mutations: readonly Mutation[],
  currentPath: readonly string[],
  prop: string,
): unknown => {
  const depth = currentPath.length;
  for (let i = mutations.length - 1; i >= 0; i--) {
    const m = mutations[i]!;
    if (m.path.length !== depth + 1 || m.path[depth] !== prop) continue;
    let match = true;
    for (let j = 0; j < depth; j++) {
      if (m.path[j] !== currentPath[j]) {
        match = false;
        break;
      }
    }
    if (match) return m.value;
  }
  return DRAFT_UNSET;
};

/** Build a new path array by appending `prop` to `currentPath`. */
const appendPath = (currentPath: readonly string[], prop: string): string[] => {
  const depth = currentPath.length;
  const path = new Array<string>(depth + 1);
  for (let j = 0; j < depth; j++) path[j] = currentPath[j]!;
  path[depth] = prop;
  return path;
};

/**
 * Create a mutable draft proxy that records mutations as data.
 *
 * Property reads recurse into nested drafts. Property writes and
 * deletes are captured as {@link Mutation} entries. No actual
 * mutation happens to `base`.
 */
export const createDraft = <T extends object>(
  base: T,
  mutations: Mutation[],
  currentPath: string[] = [],
): T => {
  const target = Object.isFrozen(base)
    ? Array.isArray(base)
      ? ([...base] as unknown as T)
      : { ...base }
    : base;
  return new Proxy(target as T, {
    get(tgt, prop, receiver) {
      if (typeof prop !== "string") return Reflect.get(tgt, prop, receiver);

      if (Array.isArray(tgt) && MUTATING_ARRAY_METHODS.has(prop)) {
        throw new TypeError(
          `Cannot call '${prop}()' on array inside produce(). Use reassignment instead: draft.prop = [...draft.prop, value]`,
        );
      }

      const mutated = findMutationValue(mutations, currentPath, prop);
      if (mutated !== DRAFT_UNSET) return mutated;

      const val = Reflect.get(tgt, prop, receiver);
      if (isObjectLike(val)) {
        return createDraft(val as object, mutations, appendPath(currentPath, prop));
      }
      return val;
    },
    set(_, prop, value) {
      if (typeof prop === "string") mutations.push({ path: appendPath(currentPath, prop), value });
      return true;
    },
    deleteProperty(_, prop) {
      if (typeof prop === "string") {
        mutations.push({ path: appendPath(currentPath, prop), value: undefined });
      }
      return true;
    },
  }) as T;
};

/** Apply a list of recorded mutations to `base`, producing a new value via structural sharing. */
export const applyMutations = <T>(base: T, mutations: readonly Mutation[]): T => {
  let result = base;
  for (const m of mutations) {
    result = setByPath(result, m.path, m.value);
  }
  return result;
};

/** Array-specific deep equality. Extracted to keep `deepEqual` focused on dispatch. */
const deepEqualArrays = (a: readonly unknown[], b: readonly unknown[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!deepEqual(a[i], b[i])) return false;
  }
  return true;
};

/**
 * Structural deep equality for plain objects and arrays.
 *
 * Uses `Object.is` for primitives, recursive comparison for nested
 * structures, and `hasOwnProperty` checks to correctly detect objects
 * with different keys of the same count.
 */
export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a)) return Array.isArray(b) && deepEqualArrays(a, b);
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  if (aKeys.length !== Object.keys(bObj).length) return false;
  for (const k of aKeys) {
    if (!Object.hasOwn(bObj, k) || !deepEqual(aObj[k], bObj[k])) return false;
  }
  return true;
};
