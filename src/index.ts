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
 *   ErrType('NotFound')                      - structured error constructors
 *
 * Everything returns immutable values. Errors are values, never thrown.
 * Zero dependencies. Methods live on prototypes. GC-friendly.
 */

import type { Option, OptionMatcher } from "./core/option.js";
import type { Result, ResultMatcher } from "./core/result.js";

export { None, Option, type OptionMatcher, Some } from "./core/option.js";
export { Err, Ok, Result, type ResultMatcher, tryCatch } from "./core/result.js";

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
export {
  CircuitBreaker,
  CircuitOpen,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  type CircuitState,
} from "./async/circuit-breaker.js";
export { Lazy } from "./async/lazy.js";
export { Retry, type RetryPolicy } from "./async/retry.js";
export { Task } from "./async/task.js";
export { Eq } from "./core/eq.js";
export { Lens, LensOptional } from "./core/lens.js";
export { Match } from "./core/match.js";
export { Ord } from "./core/ord.js";
export { flow, pipe } from "./core/pipe.js";
export { isImmutable, List, Record } from "./data/constructors.js";
export type { DeepReadonly } from "./data/internals.js";
export { Codec, type CodecType } from "./data/codec.js";
export type { ImmutableList, ListMethods } from "./data/list.js";
export { NonEmptyList } from "./data/non-empty-list.js";
export type { ImmutableRecord, RecordMethods } from "./data/record.js";
export { Schema, type SchemaError, type SchemaType } from "./data/schema.js";
export { Program } from "./program.js";
export {
  BodyReadError,
  type Context,
  compose,
  type ExtractParams,
  type Handler,
  HandlerError,
  type HttpMethod,
  html,
  json,
  type ListenOptions,
  MethodNotAllowed,
  type Middleware,
  type Params,
  type RouteDefinition,
  RouteNotFound,
  redirect,
  Server,
  type ServerAdapter,
  type ServerBuilder,
  type ServerError,
  text,
} from "./server.js";
export { Cron, type CronExpression } from "./types/cron.js";
export { Duration } from "./types/duration.js";
export { ErrType, type ErrTypeConstructor } from "./types/error.js";
export type { Type } from "./types/nominal.js";
