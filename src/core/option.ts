/**
 * @module option
 *
 * Explicit optionality: `Option<T>` replaces nullable values (`T | null | undefined`)
 * with a chainable monad. This forces callers to handle absence rather than
 * silently propagating `undefined` through pipelines.
 *
 * Two concrete classes (`SomeImpl`, `NoneImpl`) implement `OptionMethods`.
 * `None` is a singleton to avoid unnecessary allocations.
 *
 * The `Option` const/type merge provides `Option.fromNullable()` in value
 * position and `Option<T>` in type position, paralleling `Result`.
 */

import type { Result } from "./result.js";
import { Err, Ok } from "./result.js";

/**
 * A discriminated union representing a value that may or may not exist.
 *
 * `Some<T>` wraps a present value; `None` signals absence. Use this instead
 * of `null` / `undefined` to make optionality explicit and chainable.
 *
 * @example
 * ```ts
 * const name: Option<string> = fromNullable(input);
 * const upper = name.map(s => s.toUpperCase()).unwrapOr('ANON');
 * ```
 */
export type Option<T> = SomeImpl<T> | NoneImpl<T>;

/** Pattern-match arms for {@link Option.match}. */
export interface OptionMatcher<T, U> {
  readonly Some: (value: T) => U;
  readonly None: () => U;
}

/**
 * Shared contract for both `Some` and `None` variants.
 *
 * Ensures both classes expose identical method signatures so callers can
 * chain operations without narrowing first. `None` methods are no-ops
 * that propagate absence.
 */
interface OptionMethods<T> {
  map<U>(fn: (value: T) => U): Option<U>;
  flatMap<U>(fn: (value: T) => Option<U>): Option<U>;
  filter(predicate: (value: T) => boolean): Option<T>;
  tap(fn: (value: T) => void): Option<T>;
  unwrap(): T;
  unwrapOr(_fallback: T): T;
  unwrapOrElse(_fn: () => T): T;
  match<U>(m: OptionMatcher<T, U>): U;
  toResult<E>(_error: E): Result<T, E>;
  zip<U>(other: Option<U>): Option<[T, U]>;
  ap<U>(fnOption: Option<(value: T) => U>): Option<U>;
  or(_other: Option<T>): Option<T>;
  toJSON(): { tag: "Some"; value: T } | { tag: "None" };
  toString(): string;
}

/**
 * The present variant of {@link Option}.
 *
 * Wraps a value of type `T`. Provides monadic chaining (`map`, `flatMap`),
 * safe extraction (`unwrap`, `unwrapOr`), and pattern matching (`match`).
 *
 * Construct via the {@link Some} factory rather than `new SomeImpl(...)`.
 */
export class SomeImpl<T> implements OptionMethods<T> {
  readonly tag = "Some" as const;
  constructor(readonly value: T) {}

  get isSome(): true {
    return true;
  }
  get isNone(): false {
    return false;
  }

  /** Apply `fn` to the value, returning a new `Some`. */
  map<U>(fn: (value: T) => U): Option<U> {
    return new SomeImpl(fn(this.value));
  }
  /** Chain into a dependent computation that may produce `None`. */
  flatMap<U>(fn: (value: T) => Option<U>): Option<U> {
    return fn(this.value);
  }
  /** Keep the value only if `predicate` holds, otherwise return `None`. */
  filter(predicate: (value: T) => boolean): Option<T> {
    return predicate(this.value) ? this : None;
  }
  /** Run a side-effect on the value without altering the Option. */
  tap(fn: (value: T) => void): Option<T> {
    fn(this.value);
    return this;
  }
  /** Extract the value. */
  unwrap(): T {
    return this.value;
  }
  /** Return the value, ignoring the fallback. */
  unwrapOr(_fallback: T): T {
    return this.value;
  }
  /** Return the value, ignoring the recovery function. */
  unwrapOrElse(_fn: () => T): T {
    return this.value;
  }
  /** Exhaustively handle both variants. */
  match<U>(m: OptionMatcher<T, U>): U {
    return m.Some(this.value);
  }
  /** Convert to `Ok(value)`. */
  toResult<E>(_error: E): Result<T, E> {
    return Ok(this.value);
  }
  /** Combine two `Some` values into a tuple, short-circuiting on `None`. */
  zip<U>(other: Option<U>): Option<[T, U]> {
    return other.isSome ? new SomeImpl([this.value, other.value]) : None;
  }
  /**
   * Applicative apply: apply a wrapped function to this value.
   *
   * If `fnOption` is `Some(fn)`, returns `Some(fn(this.value))`.
   * If `fnOption` is `None`, returns `None`.
   */
  ap<U>(fnOption: Option<(value: T) => U>): Option<U> {
    return fnOption.isSome ? new SomeImpl(fnOption.value(this.value)) : None;
  }
  /** Return this `Some`, ignoring the alternative. */
  or(_other: Option<T>): Option<T> {
    return this;
  }
  /** Serialise as `{ tag: 'Some', value: T }`. */
  toJSON(): { tag: "Some"; value: T } {
    return { tag: "Some", value: this.value };
  }
  toString(): string {
    return `Some(${String(this.value)})`;
  }
}

/**
 * The absent variant of {@link Option}.
 *
 * All value-channel operations (`map`, `flatMap`, `unwrap`) short-circuit,
 * preserving the `None`.
 *
 * Use the singleton {@link None} constant rather than `new NoneImpl()`.
 */
export class NoneImpl<T> implements OptionMethods<T> {
  readonly tag = "None" as const;

  get isSome(): false {
    return false;
  }
  get isNone(): true {
    return true;
  }

  /** No-op on `None`. */
  map<U>(_fn: (value: T) => U): Option<U> {
    return None;
  }
  /** No-op on `None`. */
  flatMap<U>(_fn: (value: T) => Option<U>): Option<U> {
    return None;
  }
  /** No-op on `None`. */
  filter(_predicate: (value: T) => boolean): Option<T> {
    return None;
  }
  /** No-op on `None`. */
  tap(_fn: (value: T) => void): Option<T> {
    return None;
  }
  /** Throws: there is no value to extract from `None`. */
  unwrap(): never {
    throw new TypeError("unwrap called on None");
  }
  /** Return the fallback since this is `None`. */
  unwrapOr(fallback: T): T {
    return fallback;
  }
  /** Compute and return the fallback since this is `None`. */
  unwrapOrElse(fn: () => T): T {
    return fn();
  }
  /** Exhaustively handle both variants. */
  match<U>(m: OptionMatcher<T, U>): U {
    return m.None();
  }
  /** Convert to `Err(error)` since the value is absent. */
  toResult<E>(error: E): Result<T, E> {
    return Err(error);
  }
  /** Short-circuit: return `None`. */
  zip<U>(_other: Option<U>): Option<[T, U]> {
    return None;
  }
  /** Short-circuit: return `None`. */
  ap<U>(_fnOption: Option<(value: T) => U>): Option<U> {
    return None;
  }
  /** Return the alternative since this is `None`. */
  or(other: Option<T>): Option<T> {
    return other;
  }
  /** Serialise as `{ tag: 'None' }`. */
  toJSON(): { tag: "None" } {
    return { tag: "None" };
  }
  toString(): string {
    return "None";
  }
}

/**
 * Wrap a value in `Some`.
 *
 * @example
 * ```ts
 * const opt = Some(42);  // Option<number>
 * opt.unwrap();           // 42
 * ```
 */
export const Some = <T>(value: T): Option<T> => new SomeImpl(value);

/** Singleton `None` value representing absence. */
export const None: Option<never> = new NoneImpl();

/**
 * Convert a nullable value to an {@link Option}.
 *
 * Returns `None` for `null` and `undefined`, `Some(value)` otherwise.
 * Falsy values like `0`, `''`, and `false` produce `Some`.
 *
 * @example
 * ```ts
 * fromNullable('hello').unwrap();   // 'hello'
 * fromNullable(null).isNone;        // true
 * fromNullable(0).unwrap();         // 0
 * ```
 */
export const fromNullable = <T>(value: T | null | undefined): Option<T> =>
  value === null || value === undefined ? None : Some(value);

/**
 * Collect an array of Options into a single Option of an array.
 *
 * Short-circuits on the first `None`, returning `None`.
 * If all are `Some`, returns `Some` with the collected values.
 *
 * @example
 * ```ts
 * collectOptions([Some(1), Some(2)]).unwrap();   // [1, 2]
 * collectOptions([Some(1), None]).isNone;         // true
 * ```
 */
export const collectOptions = <T>(options: readonly Option<T>[]): Option<readonly T[]> => {
  const values: T[] = [];
  for (const o of options) {
    if (o.isNone) return None;
    values.push(o.value);
  }
  return Some(values);
};

/**
 * Namespace object providing static utilities on {@link Option}.
 *
 * TypeScript merges the `type Option<T>` (type position) with this
 * `const Option` (value position), giving a Rust/Java-style `Option.fromNullable()`
 * experience.
 *
 * @example
 * ```ts
 * Option.fromNullable(input)
 * Option.collect([Some(1), Some(2)])
 * Option.is(someValue)
 * ```
 */
/**
 * Map each element through an optional function, collecting present values.
 * Short-circuits on the first None.
 */
const traverseOptions = <A, T>(
  items: readonly A[],
  fn: (item: A) => Option<T>,
): Option<readonly T[]> => {
  const values: T[] = [];
  for (const item of items) {
    const o = fn(item);
    if (o.isNone) return None;
    values.push(o.value);
  }
  return Some(values);
};

export const Option: {
  readonly Some: <T>(value: T) => Option<T>;
  readonly None: Option<never>;
  readonly fromNullable: <T>(value: T | null | undefined) => Option<T>;
  readonly collect: <T>(options: readonly Option<T>[]) => Option<readonly T[]>;
  readonly sequence: <T>(options: readonly Option<T>[]) => Option<readonly T[]>;
  readonly traverse: <A, T>(
    items: readonly A[],
    fn: (item: A) => Option<T>,
  ) => Option<readonly T[]>;
  readonly match: <T, U>(option: Option<T>, matcher: OptionMatcher<T, U>) => U;
  readonly is: (value: unknown) => value is Option<unknown>;
} = {
  Some,
  None,
  fromNullable,
  collect: collectOptions,
  sequence: collectOptions,
  traverse: traverseOptions,
  match: <T, U>(option: Option<T>, matcher: OptionMatcher<T, U>): U => option.match(matcher),
  is: (value): value is Option<unknown> => value instanceof SomeImpl || value instanceof NoneImpl,
};
