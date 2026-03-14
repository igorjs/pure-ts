// ═══════════════════════════════════════════════════════════════════════════════
// Lazy<T>
// ═══════════════════════════════════════════════════════════════════════════════

import type { Option } from './option.js';
import { None, Some } from './option.js';
import type { Result } from './result.js';
import { Err, Ok } from './result.js';

/**
 * Deferred and cached computation. Evaluates the thunk at most once on first access.
 *
 * After evaluation, the thunk reference is dropped so the closure can be
 * garbage collected. All subsequent reads return the cached value.
 *
 * @example
 * ```ts
 * const config = new Lazy(() => loadExpensiveConfig());
 *
 * config.isEvaluated;     // false
 * config.value;            // computes and caches
 * config.value;            // returns cached result
 * config.map(c => c.port); // new Lazy, still deferred
 * ```
 */
export class Lazy<T> {
  private _value: T | undefined;
  private _thunk: (() => T) | null;
  private _evaluated = false;

  constructor(thunk: () => T) {
    this._thunk = thunk;
  }

  /** Access the value, evaluating the thunk on first call. */
  get value(): T {
    if (!this._evaluated) {
      this._value = this._thunk!();
      this._thunk = null; // Release closure for GC
      this._evaluated = true;
    }
    return this._value!;
  }

  /** Whether the lazy value has been computed. */
  get isEvaluated(): boolean {
    return this._evaluated;
  }

  /** Transform the lazy value. Returns a new Lazy (still deferred). */
  map<U>(fn: (value: T) => U): Lazy<U> {
    return new Lazy(() => fn(this.value));
  }

  /** Chain into another lazy computation. */
  flatMap<U>(fn: (value: T) => Lazy<U>): Lazy<U> {
    return new Lazy(() => fn(this.value).value);
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

  /** String representation showing evaluation state. */
  toString(): string {
    return this._evaluated ? `Lazy(${String(this._value)})` : 'Lazy(<pending>)';
  }
}
