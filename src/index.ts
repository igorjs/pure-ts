/**
 * @module @igorjs/pure-ts
 *
 * Pure TS: a functional application framework for TypeScript.
 * Zero dependencies. Errors as values. Immutability enforced at runtime.
 *
 * Core:
 *   Result<T, E>  / Option<T>         - monads for errors and optionality
 *   pipe / flow / Match               - composition and pattern matching
 *   Eq<T> / Ord<T> / State<S, A>     - typeclasses and state monad
 *   Lens / Prism / Traversal          - optics for immutable updates
 *
 * Data:
 *   Record / List / NonEmptyList      - immutable data structures
 *   Schema / Codec                    - validation and bidirectional encoding
 *   Type<Name, Base> / ErrType        - nominal types and structured errors
 *   Duration / Cron                   - typed time primitives
 *
 * Async:
 *   Task<T, E> / Stream<T, E>        - lazy async computation, sequences, ReadableStream bridge
 *   Lazy<T> / Env<R, T, E>           - deferred evaluation and dependency injection
 *   Retry / CircuitBreaker            - resilience policies
 *   Semaphore / Mutex / RateLimiter   - concurrency control
 *   Queue<T> / CronRunner             - job queue and cron-scheduled tasks
 *   Cache<K, V> / Channel<T>         - caching and async communication
 *   Pool<T>                           - generic resource pool with idle timeout and health checks
 *   Timer                             - sleep, interval, delay, deadline
 *
 * IO:
 *   Json / File                       - safe parse, read, write returning Result/Task
 *   Crypto / Encoding / Clone         - web standard crypto, encoding, cloning
 *   Compression / Url                 - web standard compression and URL parsing
 *   Client                            - HTTP client on Task with typed errors
 *   WebSocket                         - typed handler routing
 *   Command                           - cross-runtime subprocess execution
 *   Dns / Net                         - cross-runtime DNS resolution and TCP client
 *
 * Runtime:
 *   Server / Program                  - HTTP server with typed middleware
 *   Logger / Config                   - structured logging and env validation
 *   Path / Eol / Platform             - cross-platform IO
 *   Os / Process                      - cross-runtime OS and process info
 *   node / deno / bun / lambda        - runtime adapters
 */

import type { Option, OptionMatcher } from "./core/option.js";
import type { Result, ResultMatcher } from "./core/result.js";

// ── Core ────────────────────────────────────────────────────────────────────

/** Absent variant of Option, representing no value. */
export { None } from "./core/option.js";
/** The None variant type for narrowing. */
export type { NoneVariant } from "./core/option.js";
/** Discriminated union representing a value that may or may not exist. */
export { Option } from "./core/option.js";
/** Pattern-match arms for Option.match. */
export type { OptionMatcher } from "./core/option.js";
/** Present variant constructor: wrap a value in Option. */
export { Some } from "./core/option.js";
/** The Some variant type for narrowing. */
export type { SomeVariant } from "./core/option.js";
/** Create a failed Result wrapping an error value. */
export { Err } from "./core/result.js";
/** Create a successful Result wrapping a value. */
export { Ok } from "./core/result.js";
/** Discriminated union representing success (Ok) or failure (Err). */
export { Result } from "./core/result.js";
/** Pattern-match arms for Result.match. */
export type { ResultMatcher } from "./core/result.js";
/** Execute a function in try/catch, returning Result instead of throwing. */
export { tryCatch } from "./core/result.js";

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
/** Pattern match on an Option, handling Some and None variants. */
export function match<T, U>(value: Option<T>, matcher: OptionMatcher<T, U>): U;
export function match(value: { match(m: object): unknown }, matcher: object): unknown {
  return value.match(matcher);
}

/** Typed equality comparison typeclass. */
export { Eq } from "./core/eq.js";
/** Lossless bidirectional transformation between two types. */
export { Iso } from "./core/lens.js";
/** Total optic for reading and updating a value that always exists in the source. */
export { Lens } from "./core/lens.js";
/** Partial optic for reading and updating a value that may not exist in the source. */
export { LensOptional } from "./core/lens.js";
/** Optic focusing on a variant of a sum type via getOption and reverseGet. */
export { Prism } from "./core/lens.js";
/** Optic focusing on multiple targets within a data structure. */
export { Traversal } from "./core/lens.js";
/** Exhaustive pattern matching builder with compile-time coverage checking. */
export { Match } from "./core/match.js";
/** Typed ordering and comparison typeclass. */
export { Ord } from "./core/ord.js";
/** Compose functions left-to-right into a new function (point-free). */
export { flow } from "./core/pipe.js";
/** Pass a value through a sequence of unary functions left-to-right. */
export { pipe } from "./core/pipe.js";
/** Pure state monad for threading state through a sequence of computations. */
export { State } from "./core/state.js";

// ── Data ────────────────────────────────────────────────────────────────────

/** Algebraic data type constructor with exhaustive matching. */
export { ADT } from "./data/adt.js";
/** Bidirectional codec namespace for encoding and decoding values. */
export { Codec } from "./data/codec.js";
/** Interface describing a bidirectional codec that can decode and encode. */
export type { CodecType } from "./data/codec.js";
/** Check whether a value is an ImmutableRecord or ImmutableList. */
export { isImmutable } from "./data/constructors.js";
/** Create an immutable list from an array of items. */
export { List } from "./data/constructors.js";
/** Create an immutable record from a plain object. */
export { Record } from "./data/constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./data/internals.js";
/** An immutable array with functional query and update methods. */
export type { ImmutableList } from "./data/list.js";
/** Methods available on every ImmutableList instance. */
export type { ListMethods } from "./data/list.js";
/** Non-empty list guaranteeing at least one element at the type level. */
export { NonEmptyList } from "./data/non-empty-list.js";
/** An immutable object with type-safe structural update methods. */
export type { ImmutableRecord } from "./data/record.js";
/** Methods available on every ImmutableRecord instance. */
export type { RecordMethods } from "./data/record.js";
/** Runtime data validation namespace with composable schemas. */
export { Schema } from "./data/schema.js";
/** Describes a validation error at a specific path. */
export type { SchemaError } from "./data/schema.js";
/** Interface for a composable validation schema that parses unknown into T. */
export type { SchemaType } from "./data/schema.js";
/** Dense, index-stable collection with O(1) insert, remove, and access. */
export { StableVec } from "./data/stable-vec.js";
/** Opaque reference to an element in a StableVec. */
export type { Handle } from "./data/stable-vec.js";

// ── Async ───────────────────────────────────────────────────────────────────

/** In-memory cache namespace with TTL and optional LRU eviction. */
export { Cache } from "./async/cache.js";
/** A cache instance with get, set, delete, and cache-aside operations. */
export type { CacheInstance } from "./async/cache.js";
/** Configuration options for creating a Cache. */
export type { CacheOptions } from "./async/cache.js";
/** Async communication channel for producer-consumer patterns. */
export { Channel } from "./async/channel.js";
/** Circuit breaker namespace for protecting Tasks against cascading failures. */
export { CircuitBreaker } from "./async/circuit-breaker.js";
/** A circuit breaker instance with protect, state, and reset operations. */
export type { CircuitBreakerInstance } from "./async/circuit-breaker.js";
/** Configuration for a circuit breaker (thresholds and timeout). */
export type { CircuitBreakerPolicy } from "./async/circuit-breaker.js";
/** Error returned when the circuit is open and requests are rejected. */
export { CircuitOpen } from "./async/circuit-breaker.js";
/** The three states of a circuit breaker: closed, open, or half-open. */
export type { CircuitState } from "./async/circuit-breaker.js";
/** Cron-scheduled task runner namespace with start/stop lifecycle. */
export { CronRunner } from "./async/cron-runner.js";
/** A running cron job instance with start and stop controls. */
export type { CronRunnerInstance } from "./async/cron-runner.js";
/** Configuration for creating a CronRunner (schedule, handler, options). */
export type { CronRunnerOptions } from "./async/cron-runner.js";
/** Reader-style dependency injection for async computations. */
export { Env } from "./async/env.js";
/** Type-safe event emitter namespace with typed event maps. */
export { EventEmitter } from "./async/event-emitter.js";
/** A type-safe event emitter instance with on, off, and emit operations. */
export type { EventEmitterInstance } from "./async/event-emitter.js";
/** Deferred evaluation that computes a value at most once. */
export { Lazy } from "./async/lazy.js";
/** Generic resource pool namespace with idle timeout and health checks. */
export { Pool } from "./async/pool.js";
/** Error returned when a pool operation fails. */
export { PoolError } from "./async/pool.js";
/** A resource checked out from the pool with value and release handle. */
export type { PooledResource } from "./async/pool.js";
/** A resource pool instance with acquire, release, use, and drain operations. */
export type { PoolInstance } from "./async/pool.js";
/** Configuration for creating a resource pool (factory, size, timeout). */
export type { PoolOptions } from "./async/pool.js";
/** A queued job with id, data, priority, and creation timestamp. */
export type { Job } from "./async/queue.js";
/** Async job queue namespace with concurrency control. */
export { Queue } from "./async/queue.js";
/** A queue instance with push, pause, resume, and drain operations. */
export type { QueueInstance } from "./async/queue.js";
/** Configuration for creating a Queue (concurrency, handler, options). */
export type { QueueOptions } from "./async/queue.js";
/** Error returned when the rate limit is exceeded. */
export { RateLimited } from "./async/rate-limiter.js";
/** Token-bucket rate limiter namespace for throttling operations. */
export { RateLimiter } from "./async/rate-limiter.js";
/** A rate limiter instance with tryAcquire and wrap operations. */
export type { RateLimiterInstance } from "./async/rate-limiter.js";
/** Token bucket configuration (capacity, refill rate, refill interval). */
export type { RateLimiterPolicy } from "./async/rate-limiter.js";
/** Configurable retry policy namespace with backoff strategies. */
export { Retry } from "./async/retry.js";
/** An immutable retry policy describing how and when to retry. */
export type { RetryPolicy } from "./async/retry.js";
/** Mutual exclusion lock allowing only one task at a time. */
export { Mutex } from "./async/semaphore.js";
/** A mutex instance with acquire and wrap operations. */
export type { MutexInstance } from "./async/semaphore.js";
/** A release function returned after acquiring a semaphore permit. */
export type { Release } from "./async/semaphore.js";
/** Counting semaphore namespace for concurrency control. */
export { Semaphore } from "./async/semaphore.js";
/** A semaphore instance with acquire, wrap, available, and pending operations. */
export type { SemaphoreInstance } from "./async/semaphore.js";
/** Error returned when a state machine transition is invalid. */
export { InvalidTransition } from "./async/state-machine.js";
/** Typed finite state machine with validated transitions. */
export { StateMachine } from "./async/state-machine.js";
/** Lazy async sequence with backpressure and ReadableStream bridge. */
export { Stream } from "./async/stream.js";
/** Lazy, composable async computation that returns Result on run. */
export { Task } from "./async/task.js";
/** Create a TaskLike from a run function. */
export { makeTask } from "./async/task-like.js";
/** Shared structural interface for Task-shaped values with a `.run()` method. */
export type { TaskLike } from "./async/task-like.js";
/** Error returned when a deadline is exceeded. */
export { TimeoutError } from "./async/timer.js";
/** Timer namespace for sleep, interval, delay, and deadline operations. */
export { Timer } from "./async/timer.js";

// ── IO ──────────────────────────────────────────────────────────────────────

/** HTTP client namespace built on Task with typed error variants. */
export { Client } from "./client.js";
/** Union of all client error types (NetworkError, HttpError, ParseError). */
export type { ClientError } from "./client.js";
/** An HTTP client instance with get, post, put, patch, delete, and request methods. */
export type { ClientInstance } from "./client.js";
/** Configuration for creating a Client (baseUrl, headers, fetch). */
export type { ClientOptions } from "./client.js";
/** Request options for the HTTP client (headers, body, signal). */
export type { ClientRequestOptions } from "./client.js";
/** A typed HTTP response wrapper with status, headers, json, and text. */
export type { ClientResponse } from "./client.js";
/** Server returned a non-2xx status code. */
export { HttpError } from "./client.js";
/** Network-level failure (DNS, timeout, connection refused). */
export { NetworkError } from "./client.js";
/** Response body could not be parsed (JSON, text, etc.). */
export { ParseError } from "./client.js";
/** Structured cloning namespace using the web standard algorithm. */
export { Clone } from "./io/clone.js";
/** Error returned when a deep clone operation fails. */
export { CloneError } from "./io/clone.js";
/** Web standard compression and decompression namespace. */
export { Compression } from "./io/compression.js";
/** Error returned when compression or decompression fails. */
export { CompressionError } from "./io/compression.js";
/** Web standard cryptographic hashing, encryption, and random bytes namespace. */
export { Crypto } from "./io/crypto.js";
/** Error returned when a cryptographic operation fails. */
export { CryptoError } from "./io/crypto.js";
/** Cross-runtime DNS resolution namespace returning Task. */
export { Dns } from "./io/dns.js";
/** Error returned when DNS resolution fails. */
export { DnsError } from "./io/dns.js";
/** A resolved DNS address with IP family. */
export type { DnsRecord } from "./io/dns.js";
/** DNS record type for resolution queries. */
export type { DnsType } from "./io/dns.js";
/** Base64, hex, and UTF-8 encoding and decoding namespace. */
export { Encoding } from "./io/encoding.js";
/** Error returned when an encoding or decoding operation fails. */
export { EncodingError } from "./io/encoding.js";
/** Cross-runtime file read, write, append, stat, and remove namespace. */
export { File } from "./io/file.js";
/** Error returned when a file system operation fails. */
export { FileError } from "./io/file.js";
/** Metadata returned by File.stat (isFile, isDirectory, size, mtime). */
export type { FileStat } from "./io/file.js";
/** Safe JSON parse and stringify namespace returning Result. */
export { Json } from "./io/json.js";
/** Error returned when JSON parse or stringify fails. */
export { JsonError } from "./io/json.js";
/** Cross-runtime TCP client namespace. */
export { Net } from "./io/net.js";
/** Error returned when a TCP connection or communication fails. */
export { NetError } from "./io/net.js";
/** A connected TCP socket with send, receive, and close operations. */
export type { TcpConnection } from "./io/net.js";
/** Cross-runtime subprocess execution namespace. */
export { Command } from "./io/subprocess.js";
/** Error returned when subprocess execution fails. */
export { CommandError } from "./io/subprocess.js";
/** Options for subprocess execution (cwd, env, timeout, stdin). */
export type { CommandOptions } from "./io/subprocess.js";
/** Output of a subprocess execution (exitCode, stdout, stderr). */
export type { CommandResult } from "./io/subprocess.js";
/** URL parsing and manipulation namespace returning Result. */
export { Url } from "./io/url.js";
/** Error returned when URL parsing or construction fails. */
export { UrlError } from "./io/url.js";

// ── Runtime ─────────────────────────────────────────────────────────────────

/** Application lifecycle with graceful shutdown and error boundary. */
export { Program } from "./program.js";
/** Configuration options for Program (teardown timeout). */
export type { ProgramOptions } from "./program.js";
/** Typed environment variable validation and access. */
export { Config } from "./runtime/config.js";
/** Structured logger with configurable levels and formatters. */
export { Logger } from "./runtime/logger.js";
/** Configuration options for creating a Logger. */
export type { LoggerOptions } from "./runtime/logger.js";
/** Log severity levels, ordered from least to most severe. */
export type { LogLevel } from "./runtime/logger.js";
/** A structured log record passed to log sinks. */
export type { LogRecord } from "./runtime/logger.js";
/** A log sink function that receives formatted log entries. */
export type { LogSink } from "./runtime/logger.js";
/** Cross-runtime OS information (hostname, arch, memory). */
export { Os } from "./runtime/os.js";
/** Line ending constants and normalization. */
export { Eol } from "./runtime/platform.js";
/** OS-aware path manipulation without node:path dependency. */
export { Path } from "./runtime/platform.js";
/** Parsed path components (root, dir, base, ext, name). */
export type { PathParts } from "./runtime/platform.js";
/** Runtime platform detection (isWindows, isPosix). */
export { Platform } from "./runtime/platform.js";
/** Heap and RSS memory usage information. */
export type { MemoryUsage } from "./runtime/process.js";
/** Cross-runtime process info, cwd, env, args, and exit namespace. */
export { Process } from "./runtime/process.js";
/** Error returned when a process operation fails. */
export { ProcessError } from "./runtime/process.js";

// ── Server ──────────────────────────────────────────────────────────────────

/** Failed to read the request body. */
export { BodyReadError } from "./server.js";
/** Request context passed to route handlers with req, url, and params. */
export type { Context } from "./server.js";
/** Compose multiple middleware functions into a single middleware. */
export { compose } from "./server.js";
/** Extract parameter names from a route pattern literal type. */
export type { ExtractParams } from "./server.js";
/** A route handler that receives Context and returns Response or Task. */
export type { Handler } from "./server.js";
/** Handler threw or returned a failed Task. */
export { HandlerError } from "./server.js";
/** Supported HTTP methods for route registration. */
export type { HttpMethod } from "./server.js";
/** Create an HTML response with text/html content-type. */
export { html } from "./server.js";
/** Create a JSON response with application/json content-type. */
export { json } from "./server.js";
/** Options for starting the server (port, hostname, teardown timeout). */
export type { ListenOptions } from "./server.js";
/** Route path matched but method is not registered for it. */
export { MethodNotAllowed } from "./server.js";
/** Middleware wrapping the next handler for cross-cutting concerns. */
export type { Middleware } from "./server.js";
/** Mapped object type with a key for each extracted route parameter. */
export type { Params } from "./server.js";
/** A single route definition with method, pattern, and handler. */
export type { RouteDefinition } from "./server.js";
/** No route matched the request path. */
export { RouteNotFound } from "./server.js";
/** Create a redirect response (default 302). */
export { redirect } from "./server.js";
/** HTTP server builder with typed routing, middleware, and runtime adapters. */
export { Server } from "./server.js";
/** Adapter interface for plugging in different HTTP server runtimes. */
export type { ServerAdapter } from "./server.js";
/** Immutable builder for composing routes, middleware, and context derivers. */
export type { ServerBuilder } from "./server.js";
/** Union of all server-related error types. */
export type { ServerError } from "./server.js";
/** Typed middleware that can extend the request context. */
export type { TypedMiddleware } from "./server.js";
/** Create a plain text response with text/plain content-type. */
export { text } from "./server.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Cron expression parser and validator namespace. */
export { Cron } from "./types/cron.js";
/** A validated cron expression string (5-field standard format). */
export type { CronExpression } from "./types/cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./types/duration.js";
/** Structured error type constructor with tag-based discrimination. */
export { ErrType } from "./types/error.js";
/** Callable constructor that creates tagged, immutable error instances. */
export type { ErrTypeConstructor } from "./types/error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./types/nominal.js";

// ── WebSocket ───────────────────────────────────────────────────────────────

/** WebSocket routing and handler definitions namespace. */
export { WebSocket } from "./ws.js";
/** A WebSocket connection with typed send and close operations. */
export type { WebSocketConnection } from "./ws.js";
/** Event handlers for a WebSocket route (onOpen, onMessage, onClose, onError). */
export type { WebSocketHandler } from "./ws.js";
/** A WebSocket route definition mapping a URL pattern to a handler. */
export type { WebSocketRoute } from "./ws.js";
/** A WebSocket router that holds route definitions with pattern matching. */
export type { WebSocketRouter } from "./ws.js";
