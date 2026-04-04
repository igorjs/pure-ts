/**
 * @module @igorjs/pure-ts
 *
 * Pure TS: a functional application framework for TypeScript.
 * Zero dependencies. Errors as values. Immutability enforced at runtime.
 *
 * Core:
 *   Result<T, E>  / Option<T>         - monads for errors and optionality
 *   pipe / flow / Match               - composition and pattern matching
 *   Eq<T> / Ord<T>                    - composable equality and ordering
 *   Lens / Prism / Traversal          - optics for immutable updates
 *
 * Data:
 *   Record / List / NonEmptyList      - immutable data structures
 *   Schema / Codec                    - validation and bidirectional encoding
 *   Type<Name, Base> / ErrType        - nominal types and structured errors
 *   Duration / Cron                   - typed time primitives
 *
 * Async:
 *   Task<T, E> / Stream<T, E>        - lazy async computation and sequences
 *   Lazy<T>                           - deferred and cached evaluation
 *   Retry / CircuitBreaker            - resilience policies
 *
 * Runtime:
 *   Server / Program                  - HTTP server with typed middleware
 *   node / deno / bun / lambda        - runtime adapters
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
export { Cache, type CacheInstance, type CacheOptions } from "./async/cache.js";
export { Channel } from "./async/channel.js";
export {
  CircuitBreaker,
  CircuitOpen,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  type CircuitState,
} from "./async/circuit-breaker.js";
export { Env } from "./async/env.js";
export { Lazy } from "./async/lazy.js";
export {
  RateLimiter,
  RateLimited,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./async/rate-limiter.js";
export { Retry, type RetryPolicy } from "./async/retry.js";
export { Semaphore, Mutex, type SemaphoreInstance, type MutexInstance } from "./async/semaphore.js";
export { Stream } from "./async/stream.js";
export { Task } from "./async/task.js";
export {
  Client,
  type ClientInstance,
  type ClientOptions,
  type ClientResponse,
  type ClientError,
  HttpError,
  NetworkError,
  ParseError,
} from "./client.js";
export { Eq } from "./core/eq.js";
export { Lens, LensOptional, Prism, Traversal } from "./core/lens.js";
export { Match } from "./core/match.js";
export { Ord } from "./core/ord.js";
export { flow, pipe } from "./core/pipe.js";
export { State } from "./core/state.js";
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
  type TypedMiddleware,
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
export { Config } from "./runtime/config.js";
export { Logger } from "./runtime/logger.js";
export {
  WebSocket,
  type WebSocketConnection,
  type WebSocketHandler,
  type WebSocketRouter,
} from "./ws.js";
