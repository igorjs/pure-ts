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

// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Eq are visible from this entrypoint. */
export type { Eq } from "../core/eq.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { Option } from "../core/option.js";
/** Re-exported so public signatures that reference OptionMatcher are visible from this entrypoint. */
export type { OptionMatcher } from "../core/option.js";
/** Re-exported so public signatures that reference SomeVariant are visible from this entrypoint. */
export type { SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Ord are visible from this entrypoint. */
export type { Ord } from "../core/ord.js";
/** Re-exported so public signatures that reference Err are visible from this entrypoint. */
export type { Err } from "../core/result.js";
/** Re-exported so public signatures that reference Ok are visible from this entrypoint. */
export type { Ok } from "../core/result.js";
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
export type { Result } from "../core/result.js";
/** Re-exported so public signatures that reference ResultMatcher are visible from this entrypoint. */
export type { ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference Duration are visible from this entrypoint. */
export type { Duration } from "../types/duration.js";
/** Re-exported so public signatures that reference ErrType are visible from this entrypoint. */
export type { ErrType } from "../types/error.js";
/** Re-exported so public signatures that reference ErrTypeConstructor are visible from this entrypoint. */
export type { ErrTypeConstructor } from "../types/error.js";
/** Re-exported so public signatures that reference Type (nominal) are visible from this entrypoint. */
export type { Type } from "../types/nominal.js";

/** In-memory cache namespace with TTL and optional LRU eviction. */
export { Cache } from "./cache.js";
/** A cache instance with get, set, delete, and cache-aside operations. */
export type { CacheInstance } from "./cache.js";
/** Configuration options for creating a Cache. */
export type { CacheOptions } from "./cache.js";
/** Async communication channel for producer-consumer patterns. */
export { Channel } from "./channel.js";
/** Circuit breaker namespace for protecting Tasks against cascading failures. */
export { CircuitBreaker } from "./circuit-breaker.js";
/** A circuit breaker instance with protect, state, and reset operations. */
export type { CircuitBreakerInstance } from "./circuit-breaker.js";
/** Configuration for a circuit breaker (thresholds and timeout). */
export type { CircuitBreakerPolicy } from "./circuit-breaker.js";
/** Error returned when the circuit is open and requests are rejected. */
export { CircuitOpen } from "./circuit-breaker.js";
/** The three states of a circuit breaker: closed, open, or half-open. */
export type { CircuitState } from "./circuit-breaker.js";
/** Cron-scheduled task runner namespace with start/stop lifecycle. */
export { CronRunner } from "./cron-runner.js";
/** A running cron job instance with start and stop controls. */
export type { CronRunnerInstance } from "./cron-runner.js";
/** Configuration for creating a CronRunner (schedule, handler, options). */
export type { CronRunnerOptions } from "./cron-runner.js";
/** Reader-style dependency injection for async computations. */
export { Env } from "./env.js";
/** Type-safe event emitter namespace with typed event maps. */
export { EventEmitter } from "./event-emitter.js";
/** A type-safe event emitter instance with on, off, and emit operations. */
export type { EventEmitterInstance } from "./event-emitter.js";
/** Deferred evaluation that computes a value at most once. */
export { Lazy } from "./lazy.js";
/** Generic resource pool namespace with idle timeout and health checks. */
export { Pool } from "./pool.js";
/** Error returned when a pool operation fails. */
export { PoolError } from "./pool.js";
/** A resource checked out from the pool with value and release handle. */
export type { PooledResource } from "./pool.js";
/** A resource pool instance with acquire, release, use, and drain operations. */
export type { PoolInstance } from "./pool.js";
/** Configuration for creating a resource pool (factory, size, timeout). */
export type { PoolOptions } from "./pool.js";
/** A queued job with id, data, priority, and creation timestamp. */
export type { Job } from "./queue.js";
/** Async job queue namespace with concurrency control. */
export { Queue } from "./queue.js";
/** A queue instance with push, pause, resume, and drain operations. */
export type { QueueInstance } from "./queue.js";
/** Configuration for creating a Queue (concurrency, handler, options). */
export type { QueueOptions } from "./queue.js";
/** Error returned when the rate limit is exceeded. */
export { RateLimited } from "./rate-limiter.js";
/** Token-bucket rate limiter namespace for throttling operations. */
export { RateLimiter } from "./rate-limiter.js";
/** A rate limiter instance with tryAcquire and wrap operations. */
export type { RateLimiterInstance } from "./rate-limiter.js";
/** Token bucket configuration (capacity, refill rate, refill interval). */
export type { RateLimiterPolicy } from "./rate-limiter.js";
/** Configurable retry policy namespace with backoff strategies. */
export { Retry } from "./retry.js";
/** An immutable retry policy describing how and when to retry. */
export type { RetryPolicy } from "./retry.js";
/** Mutual exclusion lock allowing only one task at a time. */
export { Mutex } from "./semaphore.js";
/** A mutex instance with acquire and wrap operations. */
export type { MutexInstance } from "./semaphore.js";
/** A release function returned after acquiring a semaphore permit. */
export type { Release } from "./semaphore.js";
/** Counting semaphore namespace for concurrency control. */
export { Semaphore } from "./semaphore.js";
/** A semaphore instance with acquire, wrap, available, and pending operations. */
export type { SemaphoreInstance } from "./semaphore.js";
/** Error returned when a state machine transition is invalid. */
export { InvalidTransition } from "./state-machine.js";
/** Typed finite state machine with validated transitions. */
export { StateMachine } from "./state-machine.js";
/** Lazy async sequence with backpressure and ReadableStream bridge. */
export { Stream } from "./stream.js";
/** Lazy, composable async computation that returns Result on run. */
export { Task } from "./task.js";
/** Create a TaskLike from a run function. */
export { makeTask } from "./task-like.js";
/** Shared structural interface for Task-shaped values with a `.run()` method. */
export type { TaskLike } from "./task-like.js";
/** Error returned when a deadline is exceeded. */
export { TimeoutError } from "./timer.js";
/** Timer namespace for sleep, interval, delay, and deadline operations. */
export { Timer } from "./timer.js";
