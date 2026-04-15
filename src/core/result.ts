/**
 * @module result
 *
 * Railway-oriented error handling: every fallible operation returns
 * `Result<T, E>` instead of throwing. This eliminates invisible control
 * flow (try/catch) and makes error paths explicit in the type system.
 *
 * Two public interfaces (`Ok`, `Err`) define the contract. Module-private
 * classes (`OkImpl`, `ErrImpl`) provide the implementation. Methods live
 * on prototypes so instances carry only their payload, keeping GC pressure
 * low.
 *
 * The `Result` const/type merge lets callers use `Result.tryCatch()` in
 * value position and `Result<T, E>` in type position, mirroring Rust.
 */

import type { Option } from "./option.js";
import { None, Some } from "./option.js";

/** Pattern-match arms for {@link Result.match}. */
export interface ResultMatcher<T, E, U> {
  /** Handler for the Ok variant. */
  readonly Ok: (value: T) => U;
  /** Handler for the Err variant. */
  readonly Err: (error: E) => U;
}

// ── Public interfaces ────────────────────────────────────────────────────────

/**
 * The success variant of {@link Result}.
 *
 * Wraps a value of type `T` and provides monadic chaining (`map`, `flatMap`),
 * safe extraction (`unwrap`, `unwrapOr`), and pattern matching (`match`).
 *
 * Construct via the {@link Ok} factory: `Ok(42)`.
 */
export interface Ok<T, E> {
  /** Discriminant tag for pattern matching. */
  readonly tag: "Ok";
  /** Whether this is an Ok variant. Always `true`. */
  readonly isOk: true;
  /** Whether this is an Err variant. Always `false`. */
  readonly isErr: false;
  /** The wrapped success value. */
  readonly value: T;

  /** Apply `fn` to the success value, returning a new `Ok`. */
  map<U>(fn: (value: T) => U): Result<U, E>;
  /** No-op on `Ok`: the error channel is empty. */
  mapErr<F>(fn: (error: E) => F): Result<T, F>;
  /** Chain into a dependent computation that may fail. */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  /** Run a side-effect on the success value without altering the Result. */
  tap(fn: (value: T) => void): Result<T, E>;
  /** No-op on `Ok`: no error to tap. */
  tapErr(fn: (error: E) => void): Result<T, E>;
  /** Extract the success value. */
  unwrap(): T;
  /** Return the success value, ignoring the fallback. */
  unwrapOr(fallback: T): T;
  /** Return the success value, ignoring the recovery function. */
  unwrapOrElse(fn: (error: E) => T): T;
  /** Throws: there is no error to extract from `Ok`. */
  unwrapErr(): never;
  /** Exhaustively handle both variants. */
  match<U>(m: ResultMatcher<T, E, U>): U;
  /** Convert to `Some(value)`. */
  toOption(): Option<T>;
  /** Combine two `Ok` values into a tuple, short-circuiting on `Err`. */
  zip<U>(other: Result<U, E>): Result<[T, U], E>;
  /**
   * Applicative apply: apply a wrapped function to this value.
   *
   * If `fnResult` is `Ok(fn)`, returns `Ok(fn(this.value))`.
   * If `fnResult` is `Err`, propagates the error.
   */
  ap<U>(fnResult: Result<(value: T) => U, E>): Result<U, E>;
  /** Serialize as `{ tag: 'Ok', value: T }`. */
  toJSON(): { tag: "Ok"; value: T };
  /** Human-readable string representation. */
  toString(): string;
}

/**
 * The failure variant of {@link Result}.
 *
 * Wraps an error of type `E`. All value-channel operations (`map`, `flatMap`,
 * `unwrap`) short-circuit, preserving the error.
 *
 * Construct via the {@link Err} factory: `Err('not found')`.
 */
export interface Err<T, E> {
  /** Discriminant tag for pattern matching. */
  readonly tag: "Err";
  /** Whether this is an Ok variant. Always `false`. */
  readonly isOk: false;
  /** Whether this is an Err variant. Always `true`. */
  readonly isErr: true;
  /** The wrapped error value. */
  readonly error: E;

  /** No-op on `Err`: the value channel is empty. */
  map<U>(fn: (value: T) => U): Result<U, E>;
  /** Apply `fn` to the error, returning a new `Err`. */
  mapErr<F>(fn: (error: E) => F): Result<T, F>;
  /** Short-circuit: propagate this `Err` without calling `fn`. */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  /** No-op on `Err`: no value to tap. */
  tap(fn: (value: T) => void): Result<T, E>;
  /** Run a side-effect on the error without altering the Result. */
  tapErr(fn: (error: E) => void): Result<T, E>;
  /** Throws: there is no success value to extract from `Err`. */
  unwrap(): never;
  /** Return the fallback since this is an `Err`. */
  unwrapOr(fallback: T): T;
  /** Recover from the error by calling `fn`. */
  unwrapOrElse(fn: (error: E) => T): T;
  /** Extract the error value. */
  unwrapErr(): E;
  /** Exhaustively handle both variants. */
  match<U>(m: ResultMatcher<T, E, U>): U;
  /** Convert to `None` (the success value is absent). */
  toOption(): Option<T>;
  /** Short-circuit: propagate this `Err`. */
  zip<U>(other: Result<U, E>): Result<[T, U], E>;
  /** Short-circuit: propagate this `Err`. */
  ap<U>(fnResult: Result<(value: T) => U, E>): Result<U, E>;
  /** Serialize as `{ tag: 'Err', error: E }`. */
  toJSON(): { tag: "Err"; error: E };
  /** Human-readable string representation. */
  toString(): string;
}

/**
 * A discriminated union representing either success (`Ok<T>`) or failure (`Err<E>`).
 *
 * Result is the primary error-handling primitive in pure-ts: errors are values,
 * never thrown. Use `.isOk` / `.isErr` to narrow, or `.match()` for exhaustive
 * pattern matching.
 *
 * @example
 * ```ts
 * const parsed: Result<number, string> = parseAge(input);
 * const age = parsed.unwrapOr(0);
 * ```
 */
export type Result<T, E> = Ok<T, E> | Err<T, E>;

// ── Private implementation ───────────────────────────────────────────────────

/**
 * Shared contract for both `Ok` and `Err` variants.
 *
 * This interface exists so `OkImpl` and `ErrImpl` are guaranteed to expose
 * the same set of methods, enabling exhaustive pattern matching and safe
 * narrowing via `.isOk` / `.isErr` without casting.
 */
interface ResultMethods<T, E> {
  map<U>(fn: (value: T) => U): Result<U, E>;
  mapErr<F>(_fn: (error: E) => F): Result<T, F>;
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E>;
  tap(fn: (value: T) => void): Result<T, E>;
  tapErr(_fn: (error: E) => void): Result<T, E>;
  unwrap(): T;
  unwrapOr(_fallback: T): T;
  unwrapOrElse(_fn: (error: E) => T): T;
  unwrapErr(): never | E;
  match<U>(m: ResultMatcher<T, E, U>): U;
  toOption(): Option<T>;
  zip<U>(other: Result<U, E>): Result<[T, U], E>;
  ap<U>(fnResult: Result<(value: T) => U, E>): Result<U, E>;
  toJSON(): { tag: "Ok"; value: T } | { tag: "Err"; error: E };
  toString(): string;
}

class OkImpl<T, E> implements Ok<T, E>, ResultMethods<T, E> {
  readonly tag = "Ok" as const;
  constructor(readonly value: T) {}

  get isOk(): true {
    return true;
  }
  get isErr(): false {
    return false;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    return new OkImpl(fn(this.value));
  }
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return castOk(this);
  }
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
  tap(fn: (value: T) => void): Result<T, E> {
    fn(this.value);
    return this;
  }
  tapErr(_fn: (error: E) => void): Result<T, E> {
    return this;
  }
  unwrap(): T {
    return this.value;
  }
  unwrapOr(_fallback: T): T {
    return this.value;
  }
  unwrapOrElse(_fn: (error: E) => T): T {
    return this.value;
  }
  unwrapErr(): never {
    throw new TypeError(`unwrapErr called on Ok(${String(this.value)})`);
  }
  match<U>(m: ResultMatcher<T, E, U>): U {
    return m.Ok(this.value);
  }
  toOption(): Option<T> {
    return Some(this.value);
  }
  zip<U>(other: Result<U, E>): Result<[T, U], E> {
    return other.isOk ? new OkImpl([this.value, other.value]) : castErr(other);
  }
  ap<U>(fnResult: Result<(value: T) => U, E>): Result<U, E> {
    return fnResult.isOk ? new OkImpl(fnResult.value(this.value)) : castErr(fnResult);
  }
  toJSON(): { tag: "Ok"; value: T } {
    return { tag: "Ok", value: this.value };
  }
  toString(): string {
    return `Ok(${String(this.value)})`;
  }
}

class ErrImpl<T, E> implements Err<T, E>, ResultMethods<T, E> {
  readonly tag = "Err" as const;
  constructor(readonly error: E) {}

  get isOk(): false {
    return false;
  }
  get isErr(): true {
    return true;
  }

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return castErr(this);
  }
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new ErrImpl(fn(this.error));
  }
  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return castErr(this);
  }
  tap(_fn: (value: T) => void): Result<T, E> {
    return this;
  }
  tapErr(fn: (error: E) => void): Result<T, E> {
    fn(this.error);
    return this;
  }
  unwrap(): never {
    throw new TypeError(`unwrap called on Err(${String(this.error)})`);
  }
  unwrapOr(fallback: T): T {
    return fallback;
  }
  unwrapOrElse(fn: (error: E) => T): T {
    return fn(this.error);
  }
  unwrapErr(): E {
    return this.error;
  }
  match<U>(m: ResultMatcher<T, E, U>): U {
    return m.Err(this.error);
  }
  toOption(): Option<T> {
    return None;
  }
  zip<U>(_other: Result<U, E>): Result<[T, U], E> {
    return castErr(this);
  }
  ap<U>(_fnResult: Result<(value: T) => U, E>): Result<U, E> {
    return castErr(this);
  }
  toJSON(): { tag: "Err"; error: E } {
    return { tag: "Err", error: this.error };
  }
  toString(): string {
    return `Err(${String(this.error)})`;
  }
}

// ── Variance helpers ─────────────────────────────────────────────────────────
//
// Result<T, E> is invariant in both T and E because Ok and Err carry
// both type parameters in their method signatures. When propagating an Err
// through a map/flatMap that changes T, or an Ok through a mapErr that changes
// E, we need to widen the unused parameter.
//
// These two helpers centralise the cast so it appears exactly once, with a
// documented rationale, instead of being scattered across every operator.
//
// Safety: Err carries no value of type T; Ok carries no error of type E.
// Widening the unused parameter is a type-level operation only.
// Result<never, E> is assignable to Result<U, E> via bivariant method compat.

/** Widen the value-type of an Err result. Returns Result<never, E>. */
export const castErr = <T, E>(r: Err<T, E>): Result<never, E> => r as unknown as Result<never, E>;

/** Widen the error-type of an Ok result. Returns Result<T, never>. */
export const castOk = <T, E>(r: Ok<T, E>): Result<T, never> => r as unknown as Result<T, never>;

/**
 * Create a successful {@link Result} wrapping `value`.
 *
 * @example
 * ```ts
 * const result = Ok(42);   // Result<number, never>
 * result.unwrap();          // 42
 * ```
 */
export const Ok = <T>(value: T): Result<T, never> => new OkImpl(value);

/**
 * Create a failed {@link Result} wrapping `error`.
 *
 * @example
 * ```ts
 * const result = Err('not found');  // Result<never, string>
 * result.unwrapErr();                // 'not found'
 * ```
 */
export const Err = <E>(error: E): Result<never, E> => new ErrImpl(error);

/**
 * Collect an array of Results into a single Result of an array.
 *
 * Short-circuits on the first `Err`, returning that error.
 * If all are `Ok`, returns `Ok` with the collected values.
 *
 * @example
 * ```ts
 * collectResults([Ok(1), Ok(2)]).unwrap();  // [1, 2]
 * collectResults([Ok(1), Err('x')]).isErr;  // true
 * ```
 */
export const collectResults = <T, E>(results: readonly Result<T, E>[]): Result<readonly T[], E> => {
  const values: T[] = [];
  for (const r of results) {
    if (r.isErr) return castErr(r);
    values.push(r.value);
  }
  return Ok(values);
};

/**
 * Execute `fn` in a try/catch, converting exceptions to `Err`.
 *
 * Provide `onError` to map the caught exception to a typed error.
 * Without `onError`, the raw exception is captured as `E`.
 *
 * @example
 * ```ts
 * tryCatch(() => JSON.parse(raw), e => String(e));
 * ```
 */
export const tryCatch = <T, E = unknown>(
  fn: () => T,
  onError?: (e: unknown) => E,
): Result<T, E> => {
  try {
    return Ok(fn());
  } catch (e) {
    return Err(onError ? onError(e) : (e as E));
  }
};

/**
 * Namespace object providing static utilities on {@link Result}.
 *
 * TypeScript merges the `type Result<T, E>` (type position) with this
 * `const Result` (value position), giving a Rust/Java-style `Result.tryCatch()`
 * experience.
 *
 * @example
 * ```ts
 * Result.tryCatch(() => JSON.parse(raw), String)
 * Result.collect([Ok(1), Ok(2)])
 * Result.is(someValue)
 * ```
 */
/**
 * Map each element through a fallible function, collecting successes.
 * Short-circuits on the first Err.
 *
 * @example
 * ```ts
 * Result.traverse([1, 2, 3], n => n > 0 ? Ok(n * 2) : Err('negative'));
 * // Ok([2, 4, 6])
 * ```
 */
const traverseResults = <A, T, E>(
  items: readonly A[],
  fn: (item: A) => Result<T, E>,
): Result<readonly T[], E> => {
  const values: T[] = [];
  for (const item of items) {
    const r = fn(item);
    if (r.isErr) return castErr(r);
    values.push(r.value);
  }
  return Ok(values);
};

/**
 * Convert a nullable value to a Result.
 *
 * Returns Ok(value) for non-null/undefined, Err(onNull()) otherwise.
 * Falsy values like 0, '', and false produce Ok.
 */
const fromNullable = <T, E>(value: T | null | undefined, onNull: () => E): Result<T, E> =>
  value === null || value === undefined ? Err(onNull()) : Ok(value);

/**
 * Separate an array of Results into Ok values and Err values.
 *
 * Unlike collect/sequence which short-circuit on the first Err,
 * partition processes every element and returns both groups.
 */
const partitionResults = <T, E>(
  results: readonly Result<T, E>[],
): { readonly ok: readonly T[]; readonly err: readonly E[] } => {
  const ok: T[] = [];
  const err: E[] = [];
  for (const r of results) {
    if (r.isOk) {
      ok.push(r.value);
    } else {
      err.push(r.error);
    }
  }
  return { ok, err };
};

/** Result namespace with constructors and collection utilities. */
export const Result: {
  /** Wrap a value in Ok. */
  readonly Ok: <T>(value: T) => Result<T, never>;
  /** Wrap an error in Err. */
  readonly Err: <E>(error: E) => Result<never, E>;
  /** Run a function, catching thrown errors into Err. */
  readonly tryCatch: <T, E = unknown>(fn: () => T, onError?: (e: unknown) => E) => Result<T, E>;
  /** Convert a nullable value to a Result. */
  readonly fromNullable: <T, E>(value: T | null | undefined, onNull: () => E) => Result<T, E>;
  /** Collect an array of Results into a Result of array. Short-circuits on first Err. */
  readonly collect: <T, E>(results: readonly Result<T, E>[]) => Result<readonly T[], E>;
  /** Alias for collect. */
  readonly sequence: <T, E>(results: readonly Result<T, E>[]) => Result<readonly T[], E>;
  /** Map each item through a fallible function, collecting results. */
  readonly traverse: <A, T, E>(
    items: readonly A[],
    fn: (item: A) => Result<T, E>,
  ) => Result<readonly T[], E>;
  /** Split results into ok values and err values. */
  readonly partition: <T, E>(
    results: readonly Result<T, E>[],
  ) => { readonly ok: readonly T[]; readonly err: readonly E[] };
  /** Pattern match on a Result value. */
  readonly match: <T, E, U>(result: Result<T, E>, matcher: ResultMatcher<T, E, U>) => U;
  /** Type guard for Result values. */
  readonly is: (value: unknown) => value is Result<unknown, unknown>;
} = {
  Ok,
  Err,
  tryCatch,
  fromNullable,
  collect: collectResults,
  sequence: collectResults,
  traverse: traverseResults,
  partition: partitionResults,
  match: <T, E, U>(result: Result<T, E>, matcher: ResultMatcher<T, E, U>): U =>
    result.match(matcher),
  is: (value): value is Result<unknown, unknown> =>
    value instanceof OkImpl || value instanceof ErrImpl,
};
