// ═══════════════════════════════════════════════════════════════════════════════
// Result<T, E>
// ═══════════════════════════════════════════════════════════════════════════════

import type { Option } from './option.js';
import { None, Some } from './option.js';

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
export type Result<T, E> = OkImpl<T, E> | ErrImpl<T, E>;

/** Pattern-match arms for {@link Result.match}. */
export interface ResultMatcher<T, E, U> {
  readonly Ok: (value: T) => U;
  readonly Err: (error: E) => U;
}

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
  toJSON(): { tag: 'Ok'; value: T } | { tag: 'Err'; error: E };
  toString(): string;
}

/**
 * The success variant of {@link Result}.
 *
 * Wraps a value of type `T` and provides monadic chaining (`map`, `flatMap`),
 * safe extraction (`unwrap`, `unwrapOr`), and pattern matching (`match`).
 *
 * Construct via the {@link Ok} factory rather than `new OkImpl(...)`.
 */
export class OkImpl<T, E> implements ResultMethods<T, E> {
  readonly tag = 'Ok' as const;
  constructor(readonly value: T) {}

  get isOk(): true {
    return true;
  }
  get isErr(): false {
    return false;
  }

  /** Apply `fn` to the success value, returning a new `Ok`. */
  map<U>(fn: (value: T) => U): Result<U, E> {
    return new OkImpl(fn(this.value));
  }
  /** No-op on `Ok`: the error channel is empty. */
  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return this as unknown as Result<T, F>;
  }
  /** Chain into a dependent computation that may fail. */
  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value);
  }
  /** Run a side-effect on the success value without altering the Result. */
  tap(fn: (value: T) => void): Result<T, E> {
    fn(this.value);
    return this;
  }
  /** No-op on `Ok`: no error to tap. */
  tapErr(_fn: (error: E) => void): Result<T, E> {
    return this;
  }
  /** Extract the success value. */
  unwrap(): T {
    return this.value;
  }
  /** Return the success value, ignoring the fallback. */
  unwrapOr(_fallback: T): T {
    return this.value;
  }
  /** Return the success value, ignoring the recovery function. */
  unwrapOrElse(_fn: (error: E) => T): T {
    return this.value;
  }
  /** Throws: there is no error to extract from `Ok`. */
  unwrapErr(): never {
    throw new TypeError(`unwrapErr called on Ok(${String(this.value)})`);
  }
  /** Exhaustively handle both variants. */
  match<U>(m: ResultMatcher<T, E, U>): U {
    return m.Ok(this.value);
  }
  /** Convert to `Some(value)`. */
  toOption(): Option<T> {
    return Some(this.value);
  }

  /** Combine two `Ok` values into a tuple, short-circuiting on `Err`. */
  zip<U>(other: Result<U, E>): Result<[T, U], E> {
    return other.isOk
      ? new OkImpl([this.value, (other as OkImpl<U, E>).value])
      : (other as unknown as Result<[T, U], E>);
  }

  /**
   * Applicative apply: apply a wrapped function to this value.
   *
   * If `fnResult` is `Ok(fn)`, returns `Ok(fn(this.value))`.
   * If `fnResult` is `Err`, propagates the error.
   */
  ap<U>(fnResult: Result<(value: T) => U, E>): Result<U, E> {
    return fnResult.isOk
      ? new OkImpl((fnResult as OkImpl<(value: T) => U, E>).value(this.value))
      : (fnResult as unknown as Result<U, E>);
  }

  /** Serialise as `{ tag: 'Ok', value: T }`. */
  toJSON(): { tag: 'Ok'; value: T } {
    return { tag: 'Ok', value: this.value };
  }
  toString(): string {
    return `Ok(${String(this.value)})`;
  }
}

/**
 * The failure variant of {@link Result}.
 *
 * Wraps an error of type `E`. All value-channel operations (`map`, `flatMap`,
 * `unwrap`) short-circuit, preserving the error.
 *
 * Construct via the {@link Err} factory rather than `new ErrImpl(...)`.
 */
export class ErrImpl<T, E> implements ResultMethods<T, E> {
  readonly tag = 'Err' as const;
  constructor(readonly error: E) {}

  get isOk(): false {
    return false;
  }
  get isErr(): true {
    return true;
  }

  /** No-op on `Err`: the value channel is empty. */
  map<U>(_fn: (value: T) => U): Result<U, E> {
    return this as unknown as Result<U, E>;
  }
  /** Apply `fn` to the error, returning a new `Err`. */
  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new ErrImpl(fn(this.error));
  }
  /** Short-circuit: propagate this `Err` without calling `fn`. */
  flatMap<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }
  /** No-op on `Err`: no value to tap. */
  tap(_fn: (value: T) => void): Result<T, E> {
    return this;
  }
  /** Run a side-effect on the error without altering the Result. */
  tapErr(fn: (error: E) => void): Result<T, E> {
    fn(this.error);
    return this;
  }
  /** Throws: there is no success value to extract from `Err`. */
  unwrap(): never {
    throw new TypeError(`unwrap called on Err(${String(this.error)})`);
  }
  /** Return the fallback since this is an `Err`. */
  unwrapOr(fallback: T): T {
    return fallback;
  }
  /** Recover from the error by calling `fn`. */
  unwrapOrElse(fn: (error: E) => T): T {
    return fn(this.error);
  }
  /** Extract the error value. */
  unwrapErr(): E {
    return this.error;
  }
  /** Exhaustively handle both variants. */
  match<U>(m: ResultMatcher<T, E, U>): U {
    return m.Err(this.error);
  }
  /** Convert to `None` (the success value is absent). */
  toOption(): Option<T> {
    return None;
  }
  /** Short-circuit: propagate this `Err`. */
  zip<U>(_other: Result<U, E>): Result<[T, U], E> {
    return this as unknown as Result<[T, U], E>;
  }
  /** Short-circuit: propagate this `Err`. */
  ap<U>(_fnResult: Result<(value: T) => U, E>): Result<U, E> {
    return this as unknown as Result<U, E>;
  }
  /** Serialise as `{ tag: 'Err', error: E }`. */
  toJSON(): { tag: 'Err'; error: E } {
    return { tag: 'Err', error: this.error };
  }
  toString(): string {
    return `Err(${String(this.error)})`;
  }
}

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
    if (r.isErr) return r as unknown as Result<readonly T[], E>;
    values.push((r as OkImpl<T, E>).value);
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
export const Result: {
  readonly Ok: <T>(value: T) => Result<T, never>;
  readonly Err: <E>(error: E) => Result<never, E>;
  readonly tryCatch: <T, E = unknown>(fn: () => T, onError?: (e: unknown) => E) => Result<T, E>;
  readonly collect: <T, E>(results: readonly Result<T, E>[]) => Result<readonly T[], E>;
  readonly match: <T, E, U>(result: Result<T, E>, matcher: ResultMatcher<T, E, U>) => U;
  readonly is: (value: unknown) => value is Result<unknown, unknown>;
} = {
  Ok,
  Err,
  tryCatch,
  collect: collectResults,
  match: <T, E, U>(result: Result<T, E>, matcher: ResultMatcher<T, E, U>): U =>
    result.match(matcher),
  is: (value): value is Result<unknown, unknown> =>
    value instanceof OkImpl || value instanceof ErrImpl,
};
