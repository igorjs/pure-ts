/**
 * @module async
 *
 * Lazy async computation, sequences, resilience, concurrency, and scheduling.
 *
 * Task, Stream, Retry, CircuitBreaker, Semaphore, Mutex, RateLimiter,
 * Cache, Channel, StateMachine, EventEmitter, Pool, Queue, CronRunner.
 *
 * @example
 * ```ts
 * import { Task, Stream, Retry } from '@igorjs/pure-ts/async'
 *
 * const result = await Task.of(42).map(n => n * 2).run();
 * ```
 */
/** In-memory cache namespace with TTL and optional LRU eviction. */
/** A cache instance with get, set, delete, and cache-aside operations. */
/** Configuration options for creating a Cache. */

/** Re-exported so public signatures that reference Eq are visible from this entrypoint. */
export type { Eq } from "../core/eq.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant, Option, OptionMatcher, SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Ord are visible from this entrypoint. */
export type { Ord } from "../core/ord.js";
// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
/** Re-exported so public signatures that reference Ok / Err are visible from this entrypoint. */
export type { Err, Ok, Result, ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference Duration are visible from this entrypoint. */
export type { Duration } from "../types/duration.js";
/** Re-exported so public signatures that reference ErrType / ErrTypeConstructor are visible from this entrypoint. */
export type { ErrType, ErrTypeConstructor } from "../types/error.js";
/** Re-exported so public signatures that reference Type (nominal) are visible from this entrypoint. */
export type { Type } from "../types/nominal.js";
export { Cache, type CacheInstance, type CacheOptions } from "./cache.js";
/** Async communication channel for producer-consumer patterns. */
export { Channel } from "./channel.js";
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
} from "./circuit-breaker.js";
/** Cron-scheduled task runner namespace with start/stop lifecycle. */
/** A running cron job instance with start and stop controls. */
/** Configuration for creating a CronRunner (schedule, handler, options). */
export { CronRunner, type CronRunnerInstance, type CronRunnerOptions } from "./cron-runner.js";
/** Reader-style dependency injection for async computations. */
export { Env } from "./env.js";
/** Type-safe event emitter namespace with typed event maps. */
/** A type-safe event emitter instance with on, off, and emit operations. */
export { EventEmitter, type EventEmitterInstance } from "./event-emitter.js";
/** Deferred evaluation that computes a value at most once. */
export { Lazy } from "./lazy.js";
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
} from "./pool.js";
/** A queued job with id, data, priority, and creation timestamp. */
/** Async job queue namespace with concurrency control. */
/** A queue instance with push, pause, resume, and drain operations. */
/** Configuration for creating a Queue (concurrency, handler, options). */
export { type Job, Queue, type QueueInstance, type QueueOptions } from "./queue.js";
/** Error returned when the rate limit is exceeded. */
/** Token-bucket rate limiter namespace for throttling operations. */
/** A rate limiter instance with tryAcquire and wrap operations. */
/** Token bucket configuration (capacity, refill rate, refill interval). */
export {
  RateLimited,
  RateLimiter,
  type RateLimiterInstance,
  type RateLimiterPolicy,
} from "./rate-limiter.js";
/** Configurable retry policy namespace with backoff strategies. */
/** An immutable retry policy describing how and when to retry. */
export {
  Retry,
  type RetryPolicy,
} from "./retry.js";
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
} from "./semaphore.js";
/** Error returned when a state machine transition is invalid. */
/** Typed finite state machine with validated transitions. */
export { InvalidTransition, StateMachine } from "./state-machine.js";
/** Lazy async sequence with backpressure and ReadableStream bridge. */
export { Stream } from "./stream.js";
/** Lazy, composable async computation that returns Result on run. */
export { Task } from "./task.js";
/** Shared structural interface for Task-shaped values with a `.run()` method. */
/** Create a TaskLike from a run function. */
export { makeTask, type TaskLike } from "./task-like.js";
/** Error returned when a deadline is exceeded. */
/** Timer namespace for sleep, interval, delay, and deadline operations. */
export { TimeoutError, Timer } from "./timer.js";
