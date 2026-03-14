// ═══════════════════════════════════════════════════════════════════════════════
// ImmutableRecord<T> - Class-per-shape implementation
//
// Instead of a Proxy per Record, we generate a class per unique shape (set
// of keys). The class prototype has:
//   - A getter for each data key (returns raw[key], wrapping nested objects)
//   - A throwing setter for each data key
//   - All RecordMethods (set, update, produce, etc.)
//
// V8 optimisation:
//   - One hidden class per shape → monomorphic inline caches
//   - Getter access compiles to the same fast path as plain property reads
//   - No Proxy handler dispatch on reads
//   - Prototype methods are shared (zero per-instance method allocation)
// ═══════════════════════════════════════════════════════════════════════════════

import {
  applyMutations,
  createDraft,
  type DeepReadonly,
  deepEqual,
  deepFreezeRaw,
  getByPath,
  isObjectLike,
  type Mutation,
  type Primitive,
  recordPath,
  setByPath,
} from './internals.js';
import type { Option } from './option.js';
import { None, Some } from './option.js';

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
  produce(recipe: (draft: T) => void): ImmutableRecord<T>;
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
 */
export type _RecordProp<T> = T extends Primitive
  ? T
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<_RecordProp<U>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<_RecordProp<K>, _RecordProp<V>>
      : T extends ReadonlySet<infer U>
        ? ReadonlySet<_RecordProp<U>>
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
export type ImmutableRecord<T> = { readonly [K in keyof T]: _RecordProp<T[K]> } & RecordMethods<T>;

// Child proxy cache: parent raw → key → wrapped child
const CHILD_CACHE = new WeakMap<object, Map<string, object>>();

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

const buildShapeClass = (keys: readonly string[]): (new (raw: object) => any) => {
  const sorted = keys.slice().sort();
  const shapeKey = sorted.join('\0');

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
    const otherRaw = other && typeof other === 'object' && '_raw' in other ? other._raw : other;
    return this._raw === otherRaw || deepEqual(this._raw, otherRaw);
  };

  proto.toMutable = function (this: any) {
    return structuredClone(this._raw);
  };
  proto.toJSON = function (this: any) {
    return this._raw;
  };

  Object.defineProperty(proto, '$raw', {
    get(this: any) {
      return this._raw;
    },
    enumerable: false,
  });

  Object.defineProperty(proto, '$immutable', {
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
  } as unknown as new (
    raw: object,
  ) => any;

  (cls as any).prototype = proto;

  SHAPE_CACHE.set(shapeKey, cls);
  return cls;
};

// Instance cache: raw → record instance (prevents re-wrapping same data)
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
