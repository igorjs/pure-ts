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
/** Total optic for reading and updating a value that always exists in the source. */
/** Partial optic for reading and updating a value that may not exist in the source. */
/** Optic focusing on a variant of a sum type via getOption and reverseGet. */
/** Optic focusing on multiple targets within a data structure. */
export { Iso, Lens, LensOptional, Prism, Traversal } from "./lens.js";
/** Exhaustive pattern matching builder with compile-time coverage checking. */
export { Match } from "./match.js";
/** Absent variant of Option, representing no value. */
/** Discriminated union representing a value that may or may not exist. */
/** Pattern-match arms for Option.match. */
/** Present variant constructor: wrap a value in Option. */
export {
  None,
  type NoneVariant,
  Option,
  type OptionMatcher,
  Some,
  type SomeVariant,
} from "./option.js";
/** Typed ordering and comparison typeclass. */
export { Ord } from "./ord.js";
/** Compose functions left-to-right into a new function (point-free). */
/** Pass a value through a sequence of unary functions left-to-right. */
export { flow, pipe } from "./pipe.js";
/** Create a failed Result wrapping an error value. */
/** Create a successful Result wrapping a value. */
/** Discriminated union representing success (Ok) or failure (Err). */
/** Pattern-match arms for Result.match. */
/** Execute a function in try/catch, returning Result instead of throwing. */
export { Err, Ok, Result, type ResultMatcher, tryCatch } from "./result.js";
/** Pure state monad for threading state through a sequence of computations. */
export { State } from "./state.js";
