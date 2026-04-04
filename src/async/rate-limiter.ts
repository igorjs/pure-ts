/**
 * @module rate-limiter
 *
 * Token bucket rate limiter for controlling throughput.
 *
 * **Why RateLimiter alongside Retry and CircuitBreaker?**
 * Retry handles individual failures. CircuitBreaker prevents cascading
 * failures. RateLimiter prevents you from CAUSING failures by staying
 * within the allowed throughput. Together they form a complete
 * resilience stack: limit outgoing rate, retry transient failures,
 * and break the circuit when the remote is down.
 */

import type { Result } from "../core/result.js";
import { Err } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error type ──────────────────────────────────────────────────────────────

/** Error returned when the rate limit is exceeded. */
export const RateLimited: ErrTypeConstructor<"RateLimited", string> = ErrType("RateLimited");

// ── Types ───────────────────────────────────────────────────────────────────

/** Task-like interface. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

/**
 * Token bucket rate limiter configuration.
 *
 * @example
 * ```ts
 * const limiter = RateLimiter.create({
 *   capacity: 10,                    // max tokens
 *   refillRate: 5,                   // tokens added per interval
 *   refillInterval: Duration.seconds(1), // refill every second
 * });
 * ```
 */
export interface RateLimiterPolicy {
  /** Maximum number of tokens the bucket can hold. */
  readonly capacity: number;
  /** Number of tokens added per refill interval. */
  readonly refillRate: number;
  /** Duration between refills. */
  readonly refillInterval: Duration;
}

/**
 * A rate limiter instance.
 */
export interface RateLimiterInstance {
  /** Try to consume a token. Returns true if allowed, false if rate limited. */
  readonly tryAcquire: () => boolean;
  /** Wrap a task: runs if a token is available, returns RateLimited error if not. */
  readonly wrap: <T, E>(task: TaskLike<T, E>) => TaskLike<T, E | ErrType<"RateLimited">>;
  /** Current number of available tokens. */
  readonly tokens: () => number;
  /** Reset to full capacity. */
  readonly reset: () => void;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createRateLimiter = (policy: RateLimiterPolicy): RateLimiterInstance => {
  let tokens = policy.capacity;
  let lastRefill = Date.now();
  const intervalMs = D.toMilliseconds(policy.refillInterval);

  /** Add tokens based on elapsed time since last refill. */
  const refill = (): void => {
    const now = Date.now();
    const elapsed = now - lastRefill;
    if (elapsed >= intervalMs) {
      const intervals = Math.floor(elapsed / intervalMs);
      tokens = Math.min(policy.capacity, tokens + intervals * policy.refillRate);
      lastRefill = lastRefill + intervals * intervalMs;
    }
  };

  return Object.freeze({
    tryAcquire: (): boolean => {
      refill();
      if (tokens > 0) {
        tokens--;
        return true;
      }
      return false;
    },

    wrap: <T, E>(task: TaskLike<T, E>): TaskLike<T, E | ErrType<"RateLimited">> => ({
      run: async (): Promise<Result<T, E | ErrType<"RateLimited">>> => {
        refill();
        if (tokens > 0) {
          tokens--;
          return task.run();
        }
        return Err(RateLimited("Rate limit exceeded"));
      },
    }),

    tokens: (): number => {
      refill();
      return tokens;
    },

    reset: (): void => {
      tokens = policy.capacity;
      lastRefill = Date.now();
    },
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create token bucket rate limiters.
 *
 * @example
 * ```ts
 * const limiter = RateLimiter.create({
 *   capacity: 100,
 *   refillRate: 10,
 *   refillInterval: Duration.seconds(1),
 * });
 *
 * const limited = limiter.wrap(apiCallTask);
 * // Returns Err(RateLimited) if bucket is empty
 * ```
 */
export const RateLimiter: {
  readonly create: (policy: RateLimiterPolicy) => RateLimiterInstance;
} = {
  create: createRateLimiter,
};
