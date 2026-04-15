/**
 * @module non-empty-list
 *
 * Immutable list variant guaranteed to contain at least one element.
 *
 * **Why NonEmptyList?**
 * Many operations are only safe on non-empty collections: `first()`,
 * `last()`, `reduce` without an initial value. `ImmutableList` returns
 * `Option<T>` for these because it might be empty. `NonEmptyList<T>`
 * eliminates the `Option` wrapper by proving at the type level that
 * the collection is never empty. Operations that preserve non-emptiness
 * (map, sort, concat) return `NonEmptyList`; operations that might
 * produce empty results (filter) return `ImmutableList`.
 *
 * Built on top of the existing List infrastructure using `createListProxy`.
 */

import type { Eq } from "../core/eq.js";
import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import type { Ord } from "../core/ord.js";
import type { DeepReadonly } from "./internals.js";
import { createListProxy, type ImmutableList, type ListBase } from "./list.js";

// ── NonEmptyList methods ────────────���───────────────────────────────────────

/**
 * @internal Methods specific to non-empty lists where the non-empty guarantee
 * enables stronger return types.
 */
export interface NonEmptyListMethods<T> {
  /** First element. Guaranteed to exist (no Option wrapper). */
  readonly head: T;
  /** First element as a function call. Guaranteed to exist. */
  first(): T;
  /** Last element. Guaranteed to exist (no Option wrapper). */
  last(): T;
  /** Fold without an initial value. Safe because the list is non-empty. */
  reduce1(fn: (acc: T, value: T) => T): T;
  /** Apply fn to each element, preserving non-emptiness. */
  map<U>(fn: (value: T, index: number) => U): NonEmptyList<U>;
  /** Return a sorted copy, preserving non-emptiness. */
  sortBy(comparator: (a: T, b: T) => number): NonEmptyList<T>;
  /** Sort using an Ord instance, preserving non-emptiness. */
  sortByOrd(ord: Ord<T>): NonEmptyList<T>;
  /** Deduplicate using an Eq instance, preserving non-emptiness. */
  uniqBy(eq: Eq<T>): NonEmptyList<T>;
  /** Add value at the end, preserving non-emptiness. */
  append(value: T): NonEmptyList<T>;
  /** Add value at the start, preserving non-emptiness. */
  prepend(value: T): NonEmptyList<T>;
  /** Concatenate, preserving non-emptiness. */
  concat(other: ImmutableList<T> | readonly T[]): NonEmptyList<T>;
  /** Filter elements. May produce empty list, so returns ImmutableList. */
  filter(predicate: (value: T, index: number) => boolean): ImmutableList<T>;
  /** Fold elements left-to-right with an initial value. */
  reduce<U>(fn: (acc: U, value: T, index: number) => U, init: U): U;
  /** Map each element to an array and flatten. */
  flatMap<U>(fn: (value: T, index: number) => readonly U[]): ImmutableList<U>;
  /** Safe index access. Returns Option. */
  at(index: number): Option<T>;
  /** Find first matching element. Returns Option. */
  find(predicate: (value: T, index: number) => boolean): Option<T>;
  /** Return a new list with element at index replaced. */
  setAt(index: number, value: T): NonEmptyList<T>;
  /** Return a new list with element at index transformed. */
  updateAt(index: number, fn: (current: T) => T): NonEmptyList<T>;
  /** Return a sub-range as ImmutableList (may be empty). */
  slice(start?: number, end?: number): ImmutableList<T>;
  /** Structural deep equality. */
  equals(other: NonEmptyList<T>): boolean;
  /** Deep mutable clone. */
  toMutable(): T[];
  /** JSON-safe output. */
  toJSON(): unknown;
  /** Convert to a regular ImmutableList. */
  toList(): ImmutableList<T>;
  /** The frozen raw array underlying this list. */
  readonly $raw: ReadonlyArray<DeepReadonly<T>>;
  /** Brand for runtime type checking. */
  readonly $immutable: true;
  /** Non-empty brand. */
  readonly $nonEmpty: true;
}

/**
 * An immutable list guaranteed to contain at least one element.
 *
 * `first()` and `last()` return `T` directly (not `Option<T>`).
 * Operations that preserve non-emptiness return `NonEmptyList`;
 * operations that might empty the list return `ImmutableList`.
 */
export type NonEmptyList<T> = ListBase<T> & NonEmptyListMethods<T>;

// ── Implementation ──────────────────────────────────────────────────────────

const createNonEmptyList = <T>(raw: readonly T[]): NonEmptyList<T> => {
  // Delegate to the regular list proxy for base array behavior
  const inner = createListProxy(raw);

  const methods: NonEmptyListMethods<T> = {
    get head(): T {
      return raw[0]!;
    },
    first(): T {
      return raw[0]!;
    },
    last(): T {
      return raw[raw.length - 1]!;
    },
    reduce1(fn: (acc: T, value: T) => T): T {
      let acc: T = raw[0]!;
      for (let i = 1; i < raw.length; i++) {
        acc = fn(acc, raw[i]!);
      }
      return acc;
    },
    map<U>(fn: (value: T, index: number) => U): NonEmptyList<U> {
      return createNonEmptyList(raw.map(fn));
    },
    sortBy(comparator: (a: T, b: T) => number): NonEmptyList<T> {
      return createNonEmptyList((raw.slice() as T[]).sort(comparator));
    },
    sortByOrd(ord: Ord<T>): NonEmptyList<T> {
      return createNonEmptyList((raw.slice() as T[]).sort(ord.compare));
    },
    uniqBy(eq: Eq<T>): NonEmptyList<T> {
      const result: T[] = [raw[0]!];
      for (let i = 1; i < raw.length; i++) {
        const item = raw[i]!;
        let duplicate = false;
        for (const kept of result) {
          if (eq.equals(item, kept)) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate) result.push(item);
      }
      return createNonEmptyList(result);
    },
    append(value: T): NonEmptyList<T> {
      return createNonEmptyList([...raw, value]);
    },
    prepend(value: T): NonEmptyList<T> {
      return createNonEmptyList([value, ...raw]);
    },
    concat(other: ImmutableList<T> | readonly T[]): NonEmptyList<T> {
      const o = "$raw" in other ? other.$raw : other;
      return createNonEmptyList([...raw, ...o] as T[]);
    },
    filter(predicate: (value: T, index: number) => boolean): ImmutableList<T> {
      return createListProxy(raw.filter(predicate));
    },
    reduce<U>(fn: (acc: U, value: T, index: number) => U, init: U): U {
      return raw.reduce(fn, init);
    },
    flatMap<U>(fn: (value: T, index: number) => readonly U[]): ImmutableList<U> {
      return createListProxy(raw.flatMap(fn));
    },
    at(index: number): Option<T> {
      const n = index < 0 ? raw.length + index : index;
      return n >= 0 && n < raw.length ? Some(raw[n]!) : None;
    },
    find(predicate: (value: T, index: number) => boolean): Option<T> {
      const f = raw.find(predicate);
      return f === undefined ? None : Some(f);
    },
    setAt(index: number, value: T): NonEmptyList<T> {
      const c = raw.slice() as T[];
      c[index] = value;
      return createNonEmptyList(c);
    },
    updateAt(index: number, fn: (current: T) => T): NonEmptyList<T> {
      const c = raw.slice() as T[];
      c[index] = fn(raw[index]!);
      return createNonEmptyList(c);
    },
    slice(start?: number, end?: number): ImmutableList<T> {
      return createListProxy(raw.slice(start, end));
    },
    equals(other: NonEmptyList<T>): boolean {
      // Why: NonEmptyList wraps ImmutableList. The inner equals() expects
      // ImmutableList, but other is NonEmptyList (a supertype via Proxy).
      return inner.equals(other as unknown as ImmutableList<T>);
    },
    toMutable(): T[] {
      return structuredClone(raw) as T[];
    },
    toJSON() {
      return raw;
    },
    toList(): ImmutableList<T> {
      return inner;
    },
    get $raw(): ReadonlyArray<DeepReadonly<T>> {
      return raw as ReadonlyArray<DeepReadonly<T>>;
    },
    $immutable: true as const,
    $nonEmpty: true as const,
  };

  // Proxy the inner list, intercepting method access to use NonEmptyList methods
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in methods) {
        // Why: Proxy get trap receives string props. methods is a typed interface,
        // but we already checked prop is a key via `in`. TS can't narrow an
        // interface to Record<string, unknown> without this cast.
        return (methods as unknown as Record<string, unknown>)[prop];
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (typeof prop === "string" && prop in methods) return true;
      return Reflect.has(target, prop);
    },
    // Why: The Proxy wraps ImmutableList with overridden methods.
    // The resulting object satisfies NonEmptyList<T> structurally,
    // but TS can't prove Proxy<ImmutableList> equals NonEmptyList.
  }) as unknown as NonEmptyList<T>;
};

// ── Public factory (const/type merge) ──────────────────���────────────────────

/**
 * Create a non-empty immutable list.
 *
 * @example
 * ```ts
 * // From a tuple (compile-time guarantee)
 * const nel = NonEmptyList([1, 2, 3]);
 * nel.first(); // 1 (not Option<number>)
 *
 * // From an unknown array (runtime check)
 * const maybe = NonEmptyList.from([1, 2, 3]); // Option<NonEmptyList<number>>
 *
 * // Variadic constructor
 * const nel2 = NonEmptyList.of(1, 2, 3);
 * ```
 */
export const NonEmptyList: {
  /** Create a NonEmptyList from a tuple with at least one element. */
  <T>(items: readonly [T, ...T[]]): NonEmptyList<T>;
  /** Attempt to create a NonEmptyList from an array. Returns None if empty. */
  readonly from: <T>(items: readonly T[]) => Option<NonEmptyList<T>>;
  /** Create a NonEmptyList from a head element and optional rest. */
  readonly of: <T>(head: T, ...rest: readonly T[]) => NonEmptyList<T>;
  /** Type guard: returns true if value is a NonEmptyList. */
  readonly is: (value: unknown) => value is NonEmptyList<unknown>;
} = Object.assign(<T>(items: readonly [T, ...T[]]): NonEmptyList<T> => createNonEmptyList(items), {
  from: <T>(items: readonly T[]): Option<NonEmptyList<T>> =>
    items.length > 0 ? Some(createNonEmptyList(items)) : None,

  of: <T>(head: T, ...rest: readonly T[]): NonEmptyList<T> => createNonEmptyList([head, ...rest]),

  is: (value: unknown): value is NonEmptyList<unknown> =>
    value !== null &&
    typeof value === "object" &&
    "$nonEmpty" in value &&
    (value as Record<string, unknown>)["$nonEmpty"] === true,
});
