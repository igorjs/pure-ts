/**
 * @module circuit-breaker
 *
 * Circuit breaker pattern for protecting Tasks against cascading failures.
 *
 * **Why CircuitBreaker?**
 * When a downstream service is failing, retrying every request wastes
 * resources and delays recovery. A circuit breaker tracks failures and
 * "opens" after a threshold, immediately rejecting requests for a cooldown
 * period. After the cooldown it enters "half-open" state, allowing one
 * probe request to test recovery. This is a standard resilience pattern
 * that complements Retry.
 *
 * **State machine:**
 * - CLOSED: requests pass through normally, failures are counted
 * - OPEN: requests are immediately rejected with CircuitOpen error
 * - HALF_OPEN: one probe request is allowed; success closes, failure reopens
 */

import type { Result } from "../core/result.js";
import { Err } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Error returned when the circuit is open and requests are rejected. */
export const CircuitOpen: ErrTypeConstructor<"CircuitOpen", string> = ErrType("CircuitOpen");

/** The three states of a circuit breaker. */
export type CircuitState = "closed" | "open" | "half-open";

// ── Policy ──────────────────────────────────────────────────────────────────

/**
 * Configuration for a circuit breaker instance.
 *
 * @example
 * ```ts
 * const breaker = CircuitBreaker.create({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   timeout: Duration.seconds(30),
 * });
 * ```
 */
export interface CircuitBreakerPolicy {
  /** Number of consecutive failures before opening the circuit. */
  readonly failureThreshold: number;
  /** Number of consecutive successes in half-open to close the circuit. */
  readonly successThreshold: number;
  /** Duration the circuit stays open before transitioning to half-open. */
  readonly timeout: Duration;
}

// ── Instance ────────────────────────────────────────────────────────────────

/** Task-like interface to avoid direct Task import. */
type TaskLike<T, E> = {
  readonly run: () => Promise<Result<T, E>>;
};

/**
 * A stateful circuit breaker instance.
 *
 * Call `.protect(task)` to wrap a Task with circuit breaker protection.
 * The breaker tracks failures across all protected tasks.
 */
export interface CircuitBreakerInstance {
  /** Wrap a task with circuit breaker protection. */
  readonly protect: <T, E>(task: TaskLike<T, E>) => TaskLike<T, E | ErrType<"CircuitOpen">>;
  /** Query the current state. */
  readonly state: () => CircuitState;
  /** Manually reset to closed state. */
  readonly reset: () => void;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createInstance = (policy: CircuitBreakerPolicy): CircuitBreakerInstance => {
  let currentState: CircuitState = "closed";
  let failureCount = 0;
  let successCount = 0;
  let openedAt = 0;

  const timeoutMs = D.toMilliseconds(policy.timeout);

  const shouldTransitionToHalfOpen = (): boolean =>
    currentState === "open" && Date.now() - openedAt >= timeoutMs;

  const transitionToOpen = (): void => {
    currentState = "open";
    failureCount = 0;
    successCount = 0;
    openedAt = Date.now();
  };

  const transitionToClosed = (): void => {
    currentState = "closed";
    failureCount = 0;
    successCount = 0;
  };

  const onSuccess = (): void => {
    if (currentState === "half-open") {
      successCount++;
      if (successCount >= policy.successThreshold) {
        transitionToClosed();
      }
    } else if (currentState === "closed") {
      failureCount = 0;
    }
  };

  const onFailure = (): void => {
    if (currentState === "half-open") {
      transitionToOpen();
    } else if (currentState === "closed") {
      failureCount++;
      if (failureCount >= policy.failureThreshold) {
        transitionToOpen();
      }
    }
  };

  return {
    protect: <T, E>(task: TaskLike<T, E>): TaskLike<T, E | ErrType<"CircuitOpen">> => ({
      run: async (): Promise<Result<T, E | ErrType<"CircuitOpen">>> => {
        if (shouldTransitionToHalfOpen()) {
          currentState = "half-open";
          successCount = 0;
        }

        if (currentState === "open") {
          return Err(CircuitOpen("Circuit breaker is open"));
        }

        const result = await task.run();

        if (result.isOk) {
          onSuccess();
        } else {
          onFailure();
        }

        return result;
      },
    }),

    state: () => {
      if (shouldTransitionToHalfOpen()) return "half-open";
      return currentState;
    },

    reset: () => {
      transitionToClosed();
    },
  };
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create circuit breaker instances for protecting against cascading failures.
 *
 * @example
 * ```ts
 * const breaker = CircuitBreaker.create({
 *   failureThreshold: 5,
 *   successThreshold: 2,
 *   timeout: Duration.seconds(30),
 * });
 *
 * const protected = breaker.protect(unreliableTask);
 * const result = await protected.run();
 * // result may be Err(CircuitOpen) if circuit is open
 *
 * breaker.state(); // 'closed' | 'open' | 'half-open'
 * ```
 */
export const CircuitBreaker: {
  readonly create: (policy: CircuitBreakerPolicy) => CircuitBreakerInstance;
} = {
  create: createInstance,
};
