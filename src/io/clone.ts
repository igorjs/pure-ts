/**
 * @module io/clone
 *
 * Type-safe deep cloning via structuredClone.
 *
 * **Why wrap structuredClone?**
 * `structuredClone` throws DataCloneError on values that cannot be
 * serialized (functions, symbols, DOM nodes, WeakMap/WeakSet). Wrapping
 * in Result makes this failure path explicit in the type system instead
 * of requiring try/catch at every call site.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Deep clone operation failed (value contains non-cloneable types). */
export const CloneError: ErrTypeConstructor<"CloneError", string> = ErrType("CloneError");

// ── Clone ───────────────────────────────────────────────────────────────────

/**
 * Type-safe deep cloning using the web standard structuredClone API.
 *
 * @example
 * ```ts
 * const original = { nested: { value: 42 } };
 * const cloned = Clone.deep(original);
 * // Ok({ nested: { value: 42 } })
 *
 * Clone.deep({ fn: () => {} });
 * // Err(CloneError('... could not be cloned'))
 * ```
 */
export const Clone: {
  /** Deep clone a value. Returns Err for non-cloneable types (functions, symbols, etc.). */
  readonly deep: <T>(value: T) => Result<T, ErrType<"CloneError">>;
} = {
  deep: <T>(value: T): Result<T, ErrType<"CloneError">> => {
    try {
      return Ok(structuredClone(value));
    } catch (e) {
      return Err(CloneError(e instanceof Error ? e.message : String(e)));
    }
  },
};
