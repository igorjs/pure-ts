/**
 * @module record
 *
 * Immutable objects with type-safe structural updates.
 *
 * **Why class-per-shape instead of Proxy?**
 * A Proxy on every record would intercept every property read at runtime,
 * defeating V8's inline caches. Instead, we generate one class per unique
 * set of keys (shape). Each class has:
 *   - A getter per data key (wraps nested objects lazily)
 *   - A throwing setter per data key (enforces immutability)
 *   - Shared `RecordMethods` on the prototype (zero per-instance cost)
 *
 * V8 sees one hidden class per shape, enabling monomorphic inline caches.
 * Property reads compile to the same fast path as plain object access.
 * This is why shallow reads benchmark at ~0.86x native speed.
 *
 * **How structural sharing works:**
 * Update methods (`set`, `update`, `produce`) copy only the path from
 * root to the changed leaf. Everything else is shared with the original.
 * The fresh copy is re-frozen and wrapped in a new class instance.
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import {
  applyMutations,
  createDraft,
  type DeepReadonly,
  type Draft,
  deepEqual,
  deepFreezeRaw,
  getByPath,
  isObjectLike,
  type Mutation,
  type Primitive,
  recordPath,
  setByPath,
} from "./internals.js";

/**
 * Methods available on every {@link ImmutableRecord}.
 *
 * These methods use structural sharing: only the path from root to the
 * changed leaf is copied. Everything else is shared with the original.
 */
export interface RecordMethods<T> {
  /** Replace a nested value. Path resolved from an accessor lambda. */
  set<R>(accessor: (obj: T) => R, value: R): ImmutableRecord<T>;
  /** Transform a nested value in place. */
  update<R>(accessor: (obj: T) => R, fn: (current: R) => R): ImmutableRecord<T>;
  /** Batch mutations via a mutable-looking draft (Immer-style). */
  produce(recipe: (draft: Draft<T>) => void): ImmutableRecord<T>;
  /** Shallow merge top-level fields. */
  merge(partial: Partial<T>): ImmutableRecord<T>;
  /** Safe deep access returning an Option. */
  at<R>(accessor: (obj: T) => R): Option<R>;
  /** Structural deep equality. */
  equals(other: ImmutableRecord<T>): boolean;
  /** Deep mutable clone. Escape hatch for interop. */
  toMutable(): T;
  /** JSON-safe plain-object output. */
  toJSON(): unknown;
  /** The frozen raw data underlying this record. */
  readonly $raw: DeepReadonly<T>;
  /** Brand for runtime type checking via {@link isImmutable}. */
  readonly $immutable: true;
}

/**
 * Recursively types nested properties:
 *   - Primitives stay as-is
 *   - Arrays become ReadonlyArray of recursed elements
 *   - Plain objects become ImmutableRecord (with methods)
 *   - Functions, Maps, Sets pass through
 *
 * This is what makes `user.address` return an ImmutableRecord with
 * .set(), .update(), .produce(), not just a plain readonly object.
 *
 * Exported because {@link ImmutableRecord} references it in its mapped
 * type definition. TypeScript's declaration emit requires referenced types
 * to be exported for `.d.ts` generation (JSR slow-types constraint).
 * Not re-exported from `index.ts`: consumers should not use this directly.
 */
export type RecordProp<T> = T extends Primitive
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<RecordProp<U>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<RecordProp<K>, RecordProp<V>>
      : T extends ReadonlySet<infer U>
        ? ReadonlySet<RecordProp<U>>
        : T extends (...args: any[]) => any
          ? T
          : ImmutableRecord<T>;

/**
 * An immutable object with type-safe update methods.
 *
 * Created via {@link Record} or schema `.parse()`. Properties are deeply
 * frozen and accessed via generated getters. Nested objects are lazily
 * wrapped as their own ImmutableRecords.
 */
export type ImmutableRecord<T> = { readonly [K in keyof T]: RecordProp<T[K]> } & RecordMethods<T>;

/**
 * Child Record cache: `parent raw object -> key -> wrapped child`.
 *
 * When a getter reads a nested object, we lazily wrap it as an ImmutableRecord
 * and cache it here. This ensures `record.address === record.address` (identity
 * stability) and avoids re-wrapping on every property access.
 */
const CHILD_CACHE = new WeakMap<object, Map<string, object>>();

/** Retrieve or create a cached child Record for a nested object. */
const getCachedChild = (parentRaw: object, key: string, childRaw: object): ImmutableRecord<any> => {
  let keyMap = CHILD_CACHE.get(parentRaw);
  if (keyMap === undefined) {
    keyMap = new Map();
    CHILD_CACHE.set(parentRaw, keyMap);
  }
  let cached = keyMap.get(key);
  if (cached === undefined) {
    cached = createRecord(childRaw);
    keyMap.set(key, cached);
  }
  return cached as ImmutableRecord<any>;
};

/**
 * Shape class cache.
 *
 * Key: property keys sorted and joined with NUL byte. Objects with
 * the same keys (regardless of insertion order) share a class.
 *
 * Value: a constructor whose prototype has getters/setters for data
 * keys and all RecordMethods.
 */
const SHAPE_CACHE = new Map<string, new (raw: object) => any>();

/**
 * Generate (or retrieve from cache) a class for the given set of property keys.
 *
 * The class prototype has one getter and one throwing setter per key, plus all
 * `RecordMethods`. Objects with the same keys share a class, so V8 assigns
 * them the same hidden class for optimal inline cache performance.
 */
const buildShapeClass = (keys: readonly string[]): (new (raw: object) => any) => {
  const sorted = keys.slice().sort();
  const shapeKey = sorted.join("\0");

  const existing = SHAPE_CACHE.get(shapeKey);
  if (existing !== undefined) return existing;

  const proto = Object.create(null);

  // ── RecordMethods on prototype (shared across all instances of this shape) ──

  proto.set = function <R>(this: any, accessor: (obj: any) => R, value: R) {
    return createRecord(setByPath(this._raw, recordPath(accessor), value));
  };

  proto.update = function <R>(this: any, accessor: (obj: any) => R, fn: (current: R) => R) {
    const path = recordPath(accessor);
    return createRecord(setByPath(this._raw, path, fn(getByPath(this._raw, path) as R)));
  };

  proto.produce = function (this: any, recipe: (draft: any) => void) {
    const mutations: Mutation[] = [];
    recipe(createDraft(this._raw, mutations));
    return createRecord(applyMutations(this._raw, mutations));
  };

  proto.merge = function (this: any, partial: Record<string, unknown>) {
    return createRecord({ ...this._raw, ...partial });
  };

  proto.at = function <R>(this: any, accessor: (obj: any) => R): Option<R> {
    const val = getByPath(this._raw, recordPath(accessor));
    return val === undefined || val === null ? None : Some(val as R);
  };

  proto.equals = function (this: any, other: any): boolean {
    const otherRaw = other && typeof other === "object" && "_raw" in other ? other._raw : other;
    return this._raw === otherRaw || deepEqual(this._raw, otherRaw);
  };

  proto.toMutable = function (this: any) {
    return structuredClone(this._raw);
  };
  proto.toJSON = function (this: any) {
    return this._raw;
  };

  Object.defineProperty(proto, "$raw", {
    get(this: any) {
      return this._raw;
    },
    enumerable: false,
  });

  Object.defineProperty(proto, "$immutable", {
    value: true,
    enumerable: false,
  });

  // ── Data getters + throwing setters on prototype ──
  // Getters on prototype → V8 creates one hidden class for the shape,
  // all instances share it → monomorphic inline caches after warmup.

  for (const key of sorted) {
    Object.defineProperty(proto, key, {
      get(this: { _raw: Record<string, unknown> }) {
        const val = this._raw[key];
        if (isObjectLike(val)) return getCachedChild(this._raw, key, val as object);
        return val;
      },
      set() {
        throw new TypeError(`Cannot set '${key}' on immutable record`);
      },
      enumerable: true,
      configurable: true,
    });
  }

  // ── Constructor ──
  const cls = function RecordInstance(this: any, raw: object) {
    this._raw = raw;
    // Why: RecordInstance is a plain function used as a constructor.
    // TS can't type a function-as-constructor without class syntax.
    // The prototype is set manually below for class-per-shape optimisation.
  } as unknown as new (
    raw: object,
  ) => any;

  (cls as any).prototype = proto;

  SHAPE_CACHE.set(shapeKey, cls);
  return cls;
};

/**
 * Instance cache: `raw frozen object -> Record instance`.
 *
 * Prevents re-wrapping the same raw data. Also ensures identity stability:
 * calling `Record(obj)` twice with the same frozen `obj` returns the same instance.
 */
const RECORD_CACHE = new WeakMap<object, object>();

/**
 * Create an ImmutableRecord from a plain object.
 *
 * Deep-freezes `raw`, generates or reuses a shape class, and caches the instance.
 * This is the internal factory; prefer the public {@link Record} constructor.
 */
export const createRecord = <T extends object>(raw: T): ImmutableRecord<T> => {
  const cached = RECORD_CACHE.get(raw);
  if (cached) return cached as ImmutableRecord<T>;

  deepFreezeRaw(raw);
  const keys = Object.keys(raw);
  const Cls = buildShapeClass(keys);
  const instance = new Cls(raw);

  RECORD_CACHE.set(raw, instance);
  return instance as ImmutableRecord<T>;
};
