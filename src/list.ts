/**
 * @module list
 *
 * Immutable arrays with functional query and update methods.
 *
 * **Why Proxy here but not for Record?**
 * Arrays need numeric index access (`list[0]`), iteration via `Symbol.iterator`,
 * `.length`, spread, and destructuring. A Proxy is the only way to intercept
 * index reads and wrap nested objects as Records while preserving the full
 * `ReadonlyArray` interface. The read-path cost is acceptable because arrays
 * are typically iterated, not randomly accessed in hot loops.
 *
 * **How it works:**
 * The raw array is frozen and wrapped in a single Proxy per instance.
 * `ListMethods` are built once per array and stored in a WeakMap (keyed by
 * the raw array), so the Proxy handler's `get` trap resolves them by lookup.
 * Nested objects at numeric indices are lazily wrapped as `ImmutableRecord`
 * and cached in a separate WeakMap.
 */

import { deepEqual, type DeepReadonly, isObjectLike } from "./internals.js";
import type { Option } from "./option.js";
import { None, Some } from "./option.js";
import { createRecord } from "./record.js";

/**
 * Methods available on every {@link ImmutableList}.
 *
 * Each mutation method (append, setAt, etc.) returns a new ImmutableList,
 * leaving the original unchanged. Query methods (find, at, first, last)
 * return {@link Option} for null-safe access.
 */
export interface ListMethods<T> {
  /** Return a new list with `value` added at the end. */
  append(value: T): ImmutableList<T>;
  /** Return a new list with `value` added at the start. */
  prepend(value: T): ImmutableList<T>;
  /** Return a new list with the element at `index` replaced. */
  setAt(index: number, value: T): ImmutableList<T>;
  /** Return a new list with the element at `index` transformed. */
  updateAt(index: number, fn: (current: T) => T): ImmutableList<T>;
  /** Return a new list with the element at `index` removed. */
  removeAt(index: number): ImmutableList<T>;
  /** Apply `fn` to each element, returning a new list. */
  map<U>(fn: (value: T, index: number) => U): ImmutableList<U>;
  /** Keep only elements matching `predicate`. */
  filter(predicate: (value: T, index: number) => boolean): ImmutableList<T>;
  /** Fold elements left-to-right. */
  reduce<U>(fn: (acc: U, value: T, index: number) => U, init: U): U;
  /** Find the first element matching `predicate`, returning `Option`. */
  find(predicate: (value: T, index: number) => boolean): Option<T>;
  /** Find the index of the first matching element, returning `Option`. */
  findIndex(predicate: (value: T, index: number) => boolean): Option<number>;
  /** Safe index access (supports negative indices). Returns `Option`. */
  at(index: number): Option<T>;
  /** First element as `Option`. */
  first(): Option<T>;
  /** Last element as `Option`. */
  last(): Option<T>;
  /** Concatenate with another list or array. */
  concat(other: ImmutableList<T> | readonly T[]): ImmutableList<T>;
  /** Return a sub-range as a new list. */
  slice(start?: number, end?: number): ImmutableList<T>;
  /** Return a sorted copy using `comparator`. */
  sortBy(comparator: (a: T, b: T) => number): ImmutableList<T>;
  /** Map each element to an array and flatten. */
  flatMap<U>(fn: (value: T, index: number) => readonly U[]): ImmutableList<U>;
  /** Structural deep equality. */
  equals(other: ImmutableList<T>): boolean;
  /** Deep mutable clone. Escape hatch for interop. */
  toMutable(): T[];
  /** JSON-safe raw array output. */
  toJSON(): unknown;
  /** The frozen raw array underlying this list. */
  readonly $raw: ReadonlyArray<DeepReadonly<T>>;
  /** Brand for runtime type checking via {@link isImmutable}. */
  readonly $immutable: true;
}

/**
 * Base array type with conflicting methods removed.
 *
 * `ReadonlyArray` defines `find`, `map`, `filter`, etc. with signatures that
 * return raw values. `ListMethods` overrides them to return `Option` or
 * `ImmutableList`. We `Omit` the originals so the intersection type does not
 * produce conflicting overloads.
 */
export type ListBase<T> = Omit<
  ReadonlyArray<DeepReadonly<T>>,
  "find" | "findIndex" | "map" | "filter" | "flatMap" | "concat" | "at"
>;

/**
 * An immutable array with functional methods.
 *
 * Created via {@link List}. Combines the full `ReadonlyArray` interface
 * (iteration, spread, destructuring) with functional methods that return
 * new lists instead of mutating.
 */
export type ImmutableList<T> = ListBase<T> & ListMethods<T>;

/**
 * Known method names for the Proxy `get` trap.
 *
 * When the Proxy intercepts a property access, it checks this set first.
 * If the prop is a known method, it returns the pre-built method object
 * from the WeakMap instead of falling through to `Reflect.get`.
 */
const LIST_METHOD_KEYS = new Set([
  "append",
  "prepend",
  "setAt",
  "updateAt",
  "removeAt",
  "map",
  "filter",
  "reduce",
  "find",
  "findIndex",
  "at",
  "first",
  "last",
  "concat",
  "slice",
  "sortBy",
  "flatMap",
  "equals",
  "toMutable",
  "toJSON",
  "$raw",
  "$immutable",
]);

/** Pre-built method objects keyed by raw array. One per list instance. */
const LIST_METHODS = new WeakMap<readonly unknown[], ListMethods<any>>();
/** Cached Record-wrapped children keyed by raw array and index. */
const LIST_CHILD_CACHE = new WeakMap<readonly unknown[], Map<number, object>>();
/** Proxy instances keyed by raw array, preventing double-wrapping. */
const LIST_PROXY_CACHE = new WeakMap<readonly unknown[], object>();

/**
 * Build the `ListMethods` object for a given raw array.
 *
 * Each method creates a new raw array and wraps it via `createListProxy`,
 * ensuring every returned list is itself immutable.
 */
const buildListMethods = <T>(raw: readonly T[]): ListMethods<T> => ({
  append(value: T) {
    return createListProxy([...raw, value]);
  },
  prepend(value: T) {
    return createListProxy([value, ...raw]);
  },
  setAt(index: number, value: T) {
    const c = raw.slice() as T[];
    c[index] = value;
    return createListProxy(c);
  },
  updateAt(index: number, fn: (current: T) => T) {
    const c = raw.slice() as T[];
    c[index] = fn(raw[index]!);
    return createListProxy(c);
  },
  removeAt(index: number) {
    const c: T[] = [];
    for (let i = 0; i < raw.length; i++) {
      if (i !== index) c.push(raw[i]!);
    }
    return createListProxy(c);
  },
  map<U>(fn: (value: T, index: number) => U): ImmutableList<U> {
    return createListProxy(raw.map(fn));
  },
  filter(predicate: (value: T, index: number) => boolean) {
    return createListProxy(raw.filter(predicate));
  },
  reduce<U>(fn: (acc: U, value: T, index: number) => U, init: U): U {
    return raw.reduce(fn, init);
  },
  find(predicate: (value: T, index: number) => boolean): Option<T> {
    const f = raw.find(predicate);
    return f === undefined ? None : Some(f);
  },
  findIndex(predicate: (value: T, index: number) => boolean): Option<number> {
    const i = raw.findIndex(predicate);
    return i === -1 ? None : Some(i);
  },
  at(index: number): Option<T> {
    const n = index < 0 ? raw.length + index : index;
    return n >= 0 && n < raw.length ? Some(raw[n]!) : None;
  },
  first(): Option<T> {
    return raw.length > 0 ? Some(raw[0]!) : None;
  },
  last(): Option<T> {
    return raw.length > 0 ? Some(raw[raw.length - 1]!) : None;
  },
  concat(other: ImmutableList<T> | readonly T[]) {
    const o = "$raw" in other ? other.$raw : other;
    return createListProxy([...raw, ...o] as T[]);
  },
  slice(start?: number, end?: number) {
    return createListProxy(raw.slice(start, end));
  },
  sortBy(comparator: (a: T, b: T) => number) {
    return createListProxy((raw.slice() as T[]).sort(comparator));
  },
  flatMap<U>(fn: (value: T, index: number) => readonly U[]): ImmutableList<U> {
    return createListProxy(raw.flatMap(fn));
  },
  equals(other: ImmutableList<T>): boolean {
    const otherRaw = other && typeof other === "object" && "$raw" in other ? other.$raw : other;
    return raw === otherRaw || deepEqual(raw, otherRaw);
  },
  toMutable(): T[] {
    return structuredClone(raw) as T[];
  },
  toJSON() {
    return raw;
  },
  get $raw() {
    return raw as ReadonlyArray<DeepReadonly<T>>;
  },
  $immutable: true as const,
});

/**
 * Shared Proxy handler for all ImmutableList instances.
 *
 * A single handler object is reused across all lists. The `get` trap
 * resolves methods from the WeakMap, wraps nested objects at numeric
 * indices, and delegates everything else to `Reflect.get`. The `set`,
 * `deleteProperty`, and `defineProperty` traps throw to enforce immutability.
 */
const LIST_HANDLER: ProxyHandler<readonly unknown[]> = {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: hot-path proxy handler, inlined for performance
  get(target, prop, receiver) {
    if (typeof prop === "string" && LIST_METHOD_KEYS.has(prop)) {
      return (LIST_METHODS.get(target) as any)?.[prop];
    }
    if (
      typeof prop === "string"
      && prop.length > 0
      && prop.charCodeAt(0) >= 48
      && prop.charCodeAt(0) <= 57
    ) {
      const idx = Number(prop);
      if (Number.isInteger(idx) && idx >= 0 && idx < target.length) {
        const val = target[idx];
        if (isObjectLike(val)) {
          let idxMap = LIST_CHILD_CACHE.get(target);
          if (idxMap === undefined) {
            idxMap = new Map();
            LIST_CHILD_CACHE.set(target, idxMap);
          }
          let cached = idxMap.get(idx);
          if (cached === undefined) {
            cached = createRecord(val as object);
            idxMap.set(idx, cached);
          }
          return cached;
        }
        return val;
      }
    }
    return Reflect.get(target, prop, receiver);
  },
  set(_, prop) {
    throw new TypeError(`Cannot set '${String(prop)}' on immutable list`);
  },
  deleteProperty(_, prop) {
    throw new TypeError(`Cannot delete '${String(prop)}' on immutable list`);
  },
  defineProperty(_, prop) {
    throw new TypeError(`Cannot define '${String(prop)}' on immutable list`);
  },
};

/**
 * Create an ImmutableList from a raw array.
 *
 * The array is wrapped in a Proxy that enforces immutability and
 * intercepts index access to wrap nested objects as records.
 * This is the internal factory; prefer the public {@link List} constructor.
 */
export const createListProxy = <T>(raw: readonly T[]): ImmutableList<T> => {
  const cached = LIST_PROXY_CACHE.get(raw);
  if (cached) return cached as ImmutableList<T>;
  // Proxy traps enforce immutability - no Object.freeze needed
  LIST_METHODS.set(raw, buildListMethods(raw));
  const proxy = new Proxy(
    raw,
    LIST_HANDLER as ProxyHandler<readonly T[]>,
  ) as unknown as ImmutableList<T>;
  LIST_PROXY_CACHE.set(raw, proxy);
  return proxy;
};
