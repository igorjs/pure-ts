/**
 * @module io/json
 *
 * Type-safe JSON operations that return Result instead of throwing.
 *
 * **Why wrap JSON.parse / JSON.stringify?**
 * Both throw on invalid input (malformed JSON, circular references).
 * Wrapping them in Result makes every failure path visible in the type
 * signature, eliminating invisible try/catch blocks in calling code.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** JSON parse or stringify failed. */
export const JsonError: ErrTypeConstructor<"JsonError", string> = ErrType("JsonError");

// ── JSON ────────────────────────────────────────────────────────────────────

/**
 * Type-safe JSON operations that return Result instead of throwing.
 *
 * @example
 * ```ts
 * Json.parse('{"name":"Alice"}');  // Ok({ name: 'Alice' })
 * Json.parse('not json');          // Err(JsonError('...'))
 *
 * Json.stringify({ name: 'Alice' }); // Ok('{"name":"Alice"}')
 * Json.stringify(circular);          // Err(JsonError('...'))
 * ```
 */
export const Json: {
  /** Parse a JSON string. Returns Result instead of throwing. */
  readonly parse: <T = unknown>(input: string) => Result<T, ErrType<"JsonError">>;
  /** Stringify a value. Returns Result instead of throwing on circular refs. */
  readonly stringify: (
    value: unknown,
    replacer?: (key: string, value: unknown) => unknown,
    space?: number,
  ) => Result<string, ErrType<"JsonError">>;
} = {
  parse: <T = unknown>(input: string): Result<T, ErrType<"JsonError">> => {
    try {
      return Ok(JSON.parse(input) as T);
    } catch (e) {
      return Err(JsonError(e instanceof Error ? e.message : String(e)));
    }
  },
  stringify: (
    value: unknown,
    replacer?: (key: string, value: unknown) => unknown,
    space?: number,
  ): Result<string, ErrType<"JsonError">> => {
    try {
      return Ok(JSON.stringify(value, replacer, space));
    } catch (e) {
      return Err(JsonError(e instanceof Error ? e.message : String(e)));
    }
  },
};
