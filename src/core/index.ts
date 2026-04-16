/**
 * @module core
 *
 * Foundational types and composition utilities.
 *
 * Result, Option, pipe, flow, Match, Eq, Ord, State, and optics (Lens, Iso, Prism, Traversal).
 *
 * @example
 * ```ts
 * import { Ok, Err, pipe, Match } from '@igorjs/pure-ts/core'
 *
 * const result = pipe(Ok(42), r => r.map(n => n * 2));
 * ```
 */

/** Typed equality comparison typeclass. */
export { Eq } from "./eq.js";
/** Lossless bidirectional transformation between two types. */
export { Iso } from "./lens.js";
/** Total optic for reading and updating a value that always exists in the source. */
export { Lens } from "./lens.js";
/** Partial optic for reading and updating a value that may not exist in the source. */
export { LensOptional } from "./lens.js";
/** Optic focusing on a variant of a sum type via getOption and reverseGet. */
export { Prism } from "./lens.js";
/** Optic focusing on multiple targets within a data structure. */
export { Traversal } from "./lens.js";
/** Exhaustive pattern matching builder with compile-time coverage checking. */
export { Match } from "./match.js";
/** Absent variant of Option, representing no value. */
export { None } from "./option.js";
/** The None variant type for narrowing. */
export type { NoneVariant } from "./option.js";
/** Discriminated union representing a value that may or may not exist. */
export { Option } from "./option.js";
/** Pattern-match arms for Option.match. */
export type { OptionMatcher } from "./option.js";
/** Present variant constructor: wrap a value in Option. */
export { Some } from "./option.js";
/** The Some variant type for narrowing. */
export type { SomeVariant } from "./option.js";
/** Typed ordering and comparison typeclass. */
export { Ord } from "./ord.js";
/** Compose functions left-to-right into a new function (point-free). */
export { flow } from "./pipe.js";
/** Pass a value through a sequence of unary functions left-to-right. */
export { pipe } from "./pipe.js";
/** Create a failed Result wrapping an error value. */
export { Err } from "./result.js";
/** Create a successful Result wrapping a value. */
export { Ok } from "./result.js";
/** Discriminated union representing success (Ok) or failure (Err). */
export { Result } from "./result.js";
/** Pattern-match arms for Result.match. */
export type { ResultMatcher } from "./result.js";
/** Execute a function in try/catch, returning Result instead of throwing. */
export { tryCatch } from "./result.js";
/** Pure state monad for threading state through a sequence of computations. */
export { State } from "./state.js";
