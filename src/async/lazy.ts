/**
 * @module lazy
 *
 * Deferred computation with memoisation and deterministic cleanup.
 *
 * **Why Lazy instead of a plain closure?**
 * A closure evaluates every time it's called. `Lazy` evaluates once, caches
 * the result, and drops the closure reference so the captured scope can be
 * garbage collected. This matters for expensive initialisations (config
 * parsing, large dataset loading) that should compute at most once.
 *
 * **How disposal works:**
 * `Lazy` implements `Disposable` (ES2024) so `using` declarations
 * automatically release both the cached value and the thunk when the
 * scope exits. Derived lazies (via `.map` / `.flatMap`) propagate
 * disposal because they reference the parent's `.value` getter.
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";

/**
 * Deferred and cached computation. Evaluates the thunk at most once on first access.
 *
 * After evaluation, the thunk reference is dropped so the closure can be
 * garbage collected. All subsequent reads return the cached value.
 *
 * @example
 * ```ts
 * const config = Lazy(() => loadExpensiveConfig());
 *
 * config.isEvaluated;     // false
 * config.value;            // computes and caches
 * config.value;            // returns cached result
 * config.map(c => c.port); // new Lazy, still deferred
 * ```
 */
class LazyImpl<T> implements Disposable {
  private _value: T | undefined;
  private _thunk: (() => T) | null;
  private _evaluated = false;
  private _disposed = false;

  constructor(thunk: () => T) {
    this._thunk = thunk;
  }

  /** Access the value, evaluating the thunk on first call. Throws if disposed. */
  get value(): T {
    if (this._disposed) throw new TypeError("Cannot access disposed Lazy");
    if (!this._evaluated) {
      if (this._thunk === null) throw new TypeError("Lazy thunk released before evaluation");
      this._value = this._thunk();
      this._thunk = null; // Release closure for GC
      this._evaluated = true;
    }
    // After evaluation, _value is always set. The undefined case only
    // occurs if T itself is undefined, which is a valid value.
    return this._value as T;
  }

  /** Whether the lazy value has been computed. */
  get isEvaluated(): boolean {
    return this._evaluated;
  }

  /** Whether this Lazy has been disposed. */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /** Transform the lazy value. Returns a new Lazy (still deferred). */
  map<U>(fn: (value: T) => U): Lazy<U> {
    return new LazyImpl(() => fn(this.value));
  }

  /** Chain into another lazy computation. */
  flatMap<U>(fn: (value: T) => Lazy<U>): Lazy<U> {
    return new LazyImpl(() => fn(this.value).value);
  }

  /** Get the value, or a fallback if the thunk throws. */
  unwrapOr(fallback: T): T {
    try {
      return this.value;
    } catch {
      return fallback;
    }
  }

  /** Convert to Option: `Some` if evaluates successfully, `None` if the thunk throws. */
  toOption(): Option<T> {
    try {
      return Some(this.value);
    } catch {
      return None;
    }
  }

  /** Convert to Result: `Ok` if evaluates successfully, `Err` if the thunk throws. */
  toResult<E>(onError: (e: unknown) => E): Result<T, E> {
    try {
      return Ok(this.value);
    } catch (e) {
      return Err(onError(e));
    }
  }

  /**
   * Release the cached value and thunk for GC. After disposal,
   * `.value` throws and derived Lazy instances will also fail.
   *
   * Enables `using` declarations for scoped expensive computations:
   * ```ts
   * {
   *   using data = Lazy(() => parseHugeDataset());
   *   transform(data.value);
   * } // data disposed, memory released
   * ```
   */
  [Symbol.dispose](): void {
    this._value = undefined;
    this._thunk = null;
    this._disposed = true;
  }

  /** String representation showing evaluation state. */
  toString(): string {
    if (this._disposed) return "Lazy(<disposed>)";
    return this._evaluated ? `Lazy(${String(this._value)})` : "Lazy(<pending>)";
  }
}

// ── Public type + callable factory (const/type merge) ────────────────────────

/**
 * Public type alias so consumers write `Lazy<T>` without seeing
 * the internal class name.
 */
export type Lazy<T> = LazyImpl<T>;

/**
 * Create or inspect `Lazy` values.
 *
 * Callable as a factory (`Lazy(thunk)`) and as a namespace for
 * the `is` type guard.
 *
 * @example
 * ```ts
 * const config = Lazy(() => loadExpensiveConfig());
 * config.value; // evaluates once, caches
 * ```
 */
export const Lazy: {
  <T>(thunk: () => T): Lazy<T>;
  readonly is: (value: unknown) => value is Lazy<unknown>;
} = Object.assign(<T>(thunk: () => T): Lazy<T> => new LazyImpl(thunk), {
  /** Type guard: returns true if `value` is a Lazy instance. */
  is: (value: unknown): value is Lazy<unknown> => value instanceof LazyImpl,
});
