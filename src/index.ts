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
} from "./core/option.js";
/** Create a failed Result wrapping an error value. */
/** Create a successful Result wrapping a value. */
/** Discriminated union representing success (Ok) or failure (Err). */
/** Pattern-match arms for Result.match. */
/** Execute a function in try/catch, returning Result instead of throwing. */
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
/** Pattern match on a Result or Option, handling each variant. */
export function match<T, E, U>(value: Result<T, E>, matcher: ResultMatcher<T, E, U>): U;
/** Pattern match on an Option, handling Some and None variants. */
export function match<T, U>(value: Option<T>, matcher: OptionMatcher<T, U>): U;
export function match(value: { match(m: object): unknown }, matcher: object): unknown {
  return value.match(matcher);
}
/** In-memory cache namespace with TTL and optional LRU eviction. */
/** A cache instance with get, set, delete, and cache-aside operations. */
/** Configuration options for creating a Cache. */
export { Cache, type CacheInstance, type CacheOptions } from "./async/cache.js";
/** Async communication channel for producer-consumer patterns. */
export { Channel } from "./async/channel.js";
/** Circuit breaker namespace for protecting Tasks against cascading failures. */
/** A circuit breaker instance with protect, state, and reset operations. */
/** Configuration for a circuit breaker (thresholds and timeout). */
/** Error returned when the circuit is open and requests are rejected. */
/** The three states of a circuit breaker: closed, open, or half-open. */
export {
  CircuitBreaker,
  type CircuitBreakerInstance,
  type CircuitBreakerPolicy,
  CircuitOpen,
  type CircuitState,
} from "./async/circuit-breaker.js";
/** Cron-scheduled task runner namespace with start/stop lifecycle. */
/** A running cron job instance with start and stop controls. */
/** Configuration for creating a CronRunner (schedule, handler, options). */
export {
  CronRunner,
  type CronRunnerInstance,
  type CronRunnerOptions,
} from "./async/cron-runner.js";
/** Reader-style dependency injection for async computations. */
export { Env } from "./async/env.js";
/** Type-safe event emitter namespace with typed event maps. */
/** A type-safe event emitter instance with on, off, and emit operations. */
export { EventEmitter, type EventEmitterInstance } from "./async/event-emitter.js";
/** Deferred evaluation that computes a value at most once. */
export { Lazy } from "./async/lazy.js";
/** Generic resource pool namespace with idle timeout and health checks. */
/** Error returned when a pool operation fails. */
/** A resource checked out from the pool with value and release handle. */
/** A resource pool instance with acquire, release, use, and drain operations. */
/** Configuration for creating a resource pool (factory, size, timeout). */
export {
  Pool,
  PoolError,
  type PooledResource,
  type PoolInstance,
  type PoolOptions,
} from "./async/pool.js";
/** A queued job with id, data, priority, and creation timestamp. */
/** Async job queue namespace with concurrency control. */
/** A queue instance with push, pause, resume, and drain operations. */
/** Configuration for creating a Queue (concurrency, handler, options). */
export { type Job, Queue, type QueueInstance, type QueueOptions } from "./async/queue.js";
/** Error returned when the rate limit is exceeded. */
/** Token-bucket rate limiter namespace for throttling operations. */
/** A rate limiter instance with tryAcquire and wrap operations. */
/** Token bucket configuration (capacity, refill rate, refill interval). */
export {
  RateLimited,
  RateLimiter,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./async/rate-limiter.js";
/** Configurable retry policy namespace with backoff strategies. */
/** An immutable retry policy describing how and when to retry. */
export {
  Retry,
  type RetryPolicy,
} from "./async/retry.js";
/** Mutual exclusion lock allowing only one task at a time. */
/** A mutex instance with acquire and wrap operations. */
/** Counting semaphore namespace for concurrency control. */
/** A semaphore instance with acquire, wrap, available, and pending operations. */
/** A release function returned after acquiring a semaphore permit. */
export {
  Mutex,
  type MutexInstance,
  type Release,
  Semaphore,
  type SemaphoreInstance,
} from "./async/semaphore.js";
/** Error returned when a state machine transition is invalid. */
/** Typed finite state machine with validated transitions. */
export { InvalidTransition, StateMachine } from "./async/state-machine.js";
/** Lazy async sequence with backpressure and ReadableStream bridge. */
export { Stream } from "./async/stream.js";
/** Lazy, composable async computation that returns Result on run. */
export { Task } from "./async/task.js";
/** Shared structural interface for Task-shaped values with a `.run()` method. */
/** Create a TaskLike from a run function. */
export { makeTask, type TaskLike } from "./async/task-like.js";
/** Error returned when a deadline is exceeded. */
/** Timer namespace for sleep, interval, delay, and deadline operations. */
export { TimeoutError, Timer } from "./async/timer.js";
/** HTTP client namespace built on Task with typed error variants. */
/** Union of all client error types (NetworkError, HttpError, ParseError). */
/** An HTTP client instance with get, post, put, patch, delete, and request methods. */
/** Configuration for creating a Client (baseUrl, headers, fetch). */
/** A typed HTTP response wrapper with status, headers, json, and text. */
/** Server returned a non-2xx status code. */
/** Network-level failure (DNS, timeout, connection refused). */
/** Response body could not be parsed (JSON, text, etc.). */
/** Request options for the HTTP client (headers, body, signal). */
export {
  Client,
  type ClientError,
  type ClientInstance,
  type ClientOptions,
  type ClientRequestOptions,
  type ClientResponse,
  HttpError,
  NetworkError,
  ParseError,
} from "./client.js";
/** Typed equality comparison typeclass. */
export { Eq } from "./core/eq.js";
/** Lossless bidirectional transformation between two types. */
/** Total optic for reading and updating a value that always exists in the source. */
/** Partial optic for reading and updating a value that may not exist in the source. */
/** Optic focusing on a variant of a sum type via getOption and reverseGet. */
/** Optic focusing on multiple targets within a data structure. */
export { Iso, Lens, LensOptional, Prism, Traversal } from "./core/lens.js";
/** Exhaustive pattern matching builder with compile-time coverage checking. */
export { Match } from "./core/match.js";
/** Typed ordering and comparison typeclass. */
export { Ord } from "./core/ord.js";
/** Compose functions left-to-right into a new function (point-free). */
/** Pass a value through a sequence of unary functions left-to-right. */
export { flow, pipe } from "./core/pipe.js";
/** Pure state monad for threading state through a sequence of computations. */
export { State } from "./core/state.js";
/** Algebraic data type constructor with exhaustive matching. */
export { ADT } from "./data/adt.js";
/** Bidirectional codec namespace for encoding and decoding values. */
/** Interface describing a bidirectional codec that can decode and encode. */
export { Codec, type CodecType } from "./data/codec.js";
/** Check whether a value is an ImmutableRecord or ImmutableList. */
/** Create an immutable list from an array of items. */
/** Create an immutable record from a plain object. */
export { isImmutable, List, Record } from "./data/constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./data/internals.js";
/** An immutable array with functional query and update methods. */
/** Methods available on every ImmutableList instance. */
export type { ImmutableList, ListMethods } from "./data/list.js";
/** Non-empty list guaranteeing at least one element at the type level. */
export { NonEmptyList } from "./data/non-empty-list.js";
/** An immutable object with type-safe structural update methods. */
/** Methods available on every ImmutableRecord instance. */
export type { ImmutableRecord, RecordMethods } from "./data/record.js";
/** Runtime data validation namespace with composable schemas. */
/** Describes a validation error at a specific path. */
/** Interface for a composable validation schema that parses unknown into T. */
export { Schema, type SchemaError, type SchemaType } from "./data/schema.js";
/** Dense, index-stable collection with O(1) insert, remove, and access. */
/** Opaque reference to an element in a StableVec. */
export { type Handle, StableVec } from "./data/stable-vec.js";
/** Structured cloning namespace using the web standard algorithm. */
/** Error returned when a deep clone operation fails. */
export { Clone, CloneError } from "./io/clone.js";
/** Web standard compression and decompression namespace. */
/** Error returned when compression or decompression fails. */
export { Compression, CompressionError } from "./io/compression.js";
/** Web standard cryptographic hashing, encryption, and random bytes namespace. */
/** Error returned when a cryptographic operation fails. */
export { Crypto, CryptoError } from "./io/crypto.js";
/** Cross-runtime DNS resolution namespace returning Task. */
/** Error returned when DNS resolution fails. */
/** A resolved DNS address with IP family. */
/** DNS record type for resolution queries. */
export { Dns, DnsError, type DnsRecord, type DnsType } from "./io/dns.js";
/** Base64, hex, and UTF-8 encoding and decoding namespace. */
/** Error returned when an encoding or decoding operation fails. */
export { Encoding, EncodingError } from "./io/encoding.js";
/** Cross-runtime file read, write, append, stat, and remove namespace. */
/** Error returned when a file system operation fails. */
/** Metadata returned by File.stat (isFile, isDirectory, size, mtime). */
export { File, FileError, type FileStat } from "./io/file.js";
/** Safe JSON parse and stringify namespace returning Result. */
/** Error returned when JSON parse or stringify fails. */
export { Json, JsonError } from "./io/json.js";
/** Cross-runtime TCP client namespace. */
/** Error returned when a TCP connection or communication fails. */
/** A connected TCP socket with send, receive, and close operations. */
export { Net, NetError, type TcpConnection } from "./io/net.js";
/** Cross-runtime subprocess execution namespace. */
/** Error returned when subprocess execution fails. */
/** Options for subprocess execution (cwd, env, timeout, stdin). */
/** Output of a subprocess execution (exitCode, stdout, stderr). */
export { Command, CommandError, type CommandOptions, type CommandResult } from "./io/subprocess.js";
/** URL parsing and manipulation namespace returning Result. */
/** Error returned when URL parsing or construction fails. */
export { Url, UrlError } from "./io/url.js";
/** Application lifecycle with graceful shutdown and error boundary. */
/** Configuration options for Program (teardown timeout). */
export { Program, type ProgramOptions } from "./program.js";
/** Typed environment variable validation and access. */
export { Config } from "./runtime/config.js";
/** Structured logger with configurable levels and formatters. */
/** Configuration options for creating a Logger. */
/** Log severity levels, ordered from least to most severe. */
/** A structured log record passed to log sinks. */
/** A log sink function that receives formatted log entries. */
export {
  Logger,
  type LoggerOptions,
  type LogLevel,
  type LogRecord,
  type LogSink,
} from "./runtime/logger.js";
/** Cross-runtime OS information (hostname, arch, memory). */
export { Os } from "./runtime/os.js";
/** Line ending constants and normalization. */
/** OS-aware path manipulation without node:path dependency. */
/** Parsed path components (root, dir, base, ext, name). */
/** Runtime platform detection (isWindows, isPosix). */
export { Eol, Path, type PathParts, Platform } from "./runtime/platform.js";
/** Cross-runtime process info, cwd, env, args, and exit namespace. */
/** Error returned when a process operation fails. */
/** Memory usage statistics returned by Process.memoryUsage. */
export { type MemoryUsage, Process, ProcessError } from "./runtime/process.js";
/** Failed to read the request body. */
/** Request context passed to route handlers with req, url, and params. */
/** Compose multiple middleware functions into a single middleware. */
/** Extract parameter names from a route pattern literal type. */
/** A route handler that receives Context and returns Response or Task. */
/** Handler threw or returned a failed Task. */
/** Supported HTTP methods for route registration. */
/** Create an HTML response with text/html content-type. */
/** Create a JSON response with application/json content-type. */
/** Options for starting the server (port, hostname, teardown timeout). */
/** Route path matched but method is not registered for it. */
/** Middleware wrapping the next handler for cross-cutting concerns. */
/** Mapped object type with a key for each extracted route parameter. */
/** A single route definition with method, pattern, and handler. */
/** No route matched the request path. */
/** Create a redirect response (default 302). */
/** HTTP server builder with typed routing, middleware, and runtime adapters. */
/** Adapter interface for plugging in different HTTP server runtimes. */
/** Immutable builder for composing routes, middleware, and context derivers. */
/** Union of all server-related error types. */
/** Typed middleware that can extend the request context. */
/** Create a plain text response with text/plain content-type. */
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
  type TypedMiddleware,
  text,
} from "./server.js";
/** Cron expression parser and validator namespace. */
/** A validated cron expression string (5-field standard format). */
export { Cron, type CronExpression } from "./types/cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./types/duration.js";
/** Structured error type constructor with tag-based discrimination. */
/** Callable constructor that creates tagged, immutable error instances. */
export { ErrType, type ErrTypeConstructor } from "./types/error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./types/nominal.js";
/** WebSocket routing and handler definitions namespace. */
/** A WebSocket connection with typed send and close operations. */
/** Event handlers for a WebSocket route (onOpen, onMessage, onClose, onError). */
/** A WebSocket route definition mapping a URL pattern to a handler. */
/** A WebSocket router that holds route definitions with pattern matching. */
export {
  WebSocket,
  type WebSocketConnection,
  type WebSocketHandler,
  type WebSocketRoute,
  type WebSocketRouter,
} from "./ws.js";
