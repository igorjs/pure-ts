/**
 * @module @igorjs/pure-ts
 *
 * Pure TS: immutability micro-framework for TypeScript.
 *
 *   Record({ name: 'John Doe', age: 21 })  - immutable objects
 *   List([1, 2, 3])                        - immutable arrays
 *   Ok(value) / Err(error)                 - Result monad
 *   Some(value) / None                     - Option monad
 *   Schema.object({ ... })                 - boundary validation → immutable
 *   pipe(value, fn1, fn2)                  - left-to-right data transformation
 *   flow(fn1, fn2, fn3)                    - point-free function composition
 *   Lazy(() => expensive())                - deferred & cached computation
 *   Task(async () => ...)                  - composable async Result
 *   Type<'UserId', string>                 - nominal typing (zero runtime)
 *   TaggedError('NotFound', 'NOT_FOUND')     - structured error constructors
 *
 * Everything returns immutable values. Errors are values, never thrown.
 * Zero dependencies. Methods live on prototypes. GC-friendly.
 */

import type { Result, ResultMatcher } from './result.js';
import type { Option, OptionMatcher } from './option.js';

export { Result, type ResultMatcher, Ok, Err, tryCatch } from './result.js';
export { Option, type OptionMatcher, Some, None } from './option.js';

/**
 * Universal pattern match for {@link Result} and {@link Option}.
 *
 * Standalone alias so callers who prefer bare imports over namespace access
 * can write `match(value, arms)` instead of `Result.match(value, arms)`.
 *
 * @example
 * ```ts
 * match(Ok(42), { Ok: v => v * 2, Err: () => 0 })   // 84
 * match(Some('hi'), { Some: s => s.length, None: () => 0 })  // 2
 * ```
 */
export function match<T, E, U>(value: Result<T, E>, matcher: ResultMatcher<T, E, U>): U;
export function match<T, U>(value: Option<T>, matcher: OptionMatcher<T, U>): U;
export function match(value: { match(m: object): unknown }, matcher: object): unknown {
  return value.match(matcher);
}
export { pipe, flow } from './pipe.js';
export { Lazy } from './lazy.js';
export { Task } from './task.js';
export { type Type } from './nominal.js';
export { type DeepReadonly } from './internals.js';
export { type RecordMethods, type ImmutableRecord } from './record.js';
export { type ListMethods, type ImmutableList } from './list.js';
export { Record, List, isImmutable } from './constructors.js';
export { type SchemaError, type SchemaType, Schema } from './schema.js';
export { type TaggedErrorInstance, type TaggedErrorConstructor, TaggedError, isTaggedError } from './error.js';
