/**
 * @module retry
 *
 * Composable retry policies for {@link Task}.
 *
 * **Why standalone Retry instead of just Task.retry()?**
 * Task.retry() provides a simple attempts+delay combo. The Retry module
 * adds a builder pattern for full-featured policies: exponential/linear
 * backoff, jitter, max delay caps, and conditional retry predicates.
 * Policies are reusable values that can be applied to any Task via
 * `Retry.apply(policy, task)` or the curried `Retry.withPolicy(policy)`.
 */

import type { Result } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";
import type { TaskLike } from "./task-like.js";

// ── Policy types ────────────────────────────────────────────────────────────

/** @internal The backoff strategy for retry delays. */
export type BackoffStrategy = "fixed" | "exponential" | "linear";

/**
 * An immutable retry policy describing how and when to retry.
 *
 * Construct via `Retry.policy()` builder or `Retry.fixed()`/`Retry.exponential()`.
 */
export interface RetryPolicy {
  /** Maximum number of attempts including the initial try. */
  readonly maxAttempts: number;
  /** Base delay between retries. */
  readonly delay: Duration;
  /** Backoff strategy: fixed, exponential, or linear. */
  readonly backoff: BackoffStrategy;
  /** Whether to add random jitter to the delay. */
  readonly jitter: boolean;
  /** Maximum delay cap regardless of backoff calculation. */
  readonly maxDelay: Duration;
  /** Predicate to decide whether a given error should be retried. */
  readonly shouldRetry: (error: unknown) => boolean;
}

// ── Delay computation ───────────────────────────────────────────────────────

/**
 * Calculate the delay for a given attempt based on the policy.
 * Attempt is 0-indexed (0 = first retry after initial failure).
 */
const computeDelay = (policy: RetryPolicy, attempt: number): number => {
  const baseMs = D.toMilliseconds(policy.delay);
  let delayMs: number;

  if (policy.backoff === "exponential") {
    delayMs = baseMs * 2 ** attempt;
  } else if (policy.backoff === "linear") {
    delayMs = baseMs * (attempt + 1);
  } else {
    delayMs = baseMs;
  }

  const maxMs = D.toMilliseconds(policy.maxDelay);
  if (delayMs > maxMs) delayMs = maxMs;

  if (policy.jitter) {
    delayMs = Math.floor(delayMs * Math.random());
  }

  return delayMs;
};

const sleep = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * @internal Builder for constructing {@link RetryPolicy} instances.
 *
 * Each method returns a new builder (immutable). Call `.build()` to
 * produce the final frozen policy.
 *
 * @example
 * ```ts
 * const policy = Retry.policy()
 *   .maxAttempts(3)
 *   .exponentialBackoff(Duration.seconds(1))
 *   .jitter()
 *   .maxDelay(Duration.seconds(30))
 *   .build();
 * ```
 */
export interface RetryPolicyBuilder {
  /** Set the maximum number of attempts (including the initial try). */
  readonly maxAttempts: (n: number) => RetryPolicyBuilder;
  /** Set the base delay between retries (fixed backoff). */
  readonly delay: (d: Duration) => RetryPolicyBuilder;
  /** Use exponential backoff with the given base delay. */
  readonly exponentialBackoff: (base: Duration) => RetryPolicyBuilder;
  /** Use linear backoff with the given step duration. */
  readonly linearBackoff: (step: Duration) => RetryPolicyBuilder;
  /** Enable or disable random jitter on the delay. */
  readonly jitter: (enabled?: boolean) => RetryPolicyBuilder;
  /** Cap the delay at the given maximum regardless of backoff calculation. */
  readonly maxDelay: (d: Duration) => RetryPolicyBuilder;
  /** Set a predicate to decide whether a given error should be retried. */
  readonly shouldRetry: (predicate: (error: unknown) => boolean) => RetryPolicyBuilder;
  /** Build and freeze the retry policy. */
  readonly build: () => RetryPolicy;
}

interface BuilderConfig {
  readonly maxAttempts: number;
  readonly delay: Duration;
  readonly backoff: BackoffStrategy;
  readonly jitter: boolean;
  readonly maxDelay: Duration;
  readonly shouldRetry: (error: unknown) => boolean;
}

const defaultConfig: BuilderConfig = {
  maxAttempts: 3,
  delay: D.seconds(1),
  backoff: "fixed",
  jitter: false,
  maxDelay: D.minutes(5),
  shouldRetry: () => true,
};

const createPolicyBuilder = (config: BuilderConfig): RetryPolicyBuilder =>
  Object.freeze({
    maxAttempts: (n: number) => createPolicyBuilder({ ...config, maxAttempts: n }),
    delay: (d: Duration) => createPolicyBuilder({ ...config, delay: d }),
    exponentialBackoff: (base: Duration) =>
      createPolicyBuilder({ ...config, delay: base, backoff: "exponential" }),
    linearBackoff: (step: Duration) =>
      createPolicyBuilder({ ...config, delay: step, backoff: "linear" }),
    jitter: (enabled = true) => createPolicyBuilder({ ...config, jitter: enabled }),
    maxDelay: (d: Duration) => createPolicyBuilder({ ...config, maxDelay: d }),
    shouldRetry: (predicate: (error: unknown) => boolean) =>
      createPolicyBuilder({ ...config, shouldRetry: predicate }),
    build: (): RetryPolicy => Object.freeze({ ...config }),
  });

// ── Task integration ────────────────────────────────────────────────────────

/** @internal A factory function that creates a TaskLike from a run function. */
export type TaskFactory = <T, E>(run: () => Promise<Result<T, E>>) => TaskLike<T, E>;

/** Apply a retry policy to a task-like computation. */
const applyRetry = <T, E>(
  policy: RetryPolicy,
  taskRun: () => Promise<Result<T, E>>,
  taskFactory: TaskFactory,
): TaskLike<T, E> =>
  taskFactory(async () => {
    let last: Result<T, E> = await taskRun();

    for (let attempt = 0; attempt < policy.maxAttempts - 1 && last.isErr; attempt++) {
      if (!policy.shouldRetry(last.isErr ? (last as { readonly error: E }).error : undefined)) {
        break;
      }

      const delayMs = computeDelay(policy, attempt);
      if (delayMs > 0) await sleep(delayMs);

      last = await taskRun();
    }

    return last;
  });

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Composable retry policies for Task operations.
 *
 * @example
 * ```ts
 * const policy = Retry.policy()
 *   .maxAttempts(3)
 *   .exponentialBackoff(Duration.seconds(1))
 *   .jitter()
 *   .build();
 *
 * // Apply to a task
 * const reliable = Retry.apply(policy, unreliableTask);
 * const result = await reliable.run();
 *
 * // Curried for pipe
 * pipe(unreliableTask, Retry.withPolicy(policy));
 * ```
 */
export const Retry: {
  /** Start building a retry policy with the fluent builder API. */
  readonly policy: () => RetryPolicyBuilder;
  /** Apply a retry policy to a task. Returns a new task that retries on failure. */
  readonly apply: <T, E>(
    policy: RetryPolicy,
    task: TaskLike<T, E>,
    factory?: TaskFactory,
  ) => TaskLike<T, E>;
  /** Curried version of apply, suitable for use with pipe. */
  readonly withPolicy: <T, E>(
    policy: RetryPolicy,
    factory?: TaskFactory,
  ) => (task: TaskLike<T, E>) => TaskLike<T, E>;
  /** Create a fixed-delay retry policy. */
  readonly fixed: (attempts: number, delay: Duration) => RetryPolicy;
  /** Create an exponential-backoff retry policy. */
  readonly exponential: (attempts: number, baseDelay: Duration) => RetryPolicy;
} = {
  policy: () => createPolicyBuilder(defaultConfig),

  apply: <T, E>(
    policy: RetryPolicy,
    task: TaskLike<T, E>,
    factory?: TaskFactory,
  ): TaskLike<T, E> => {
    const f: TaskFactory = factory ?? defaultTaskFactory;
    return applyRetry(policy, () => task.run(), f);
  },

  withPolicy:
    <T, E>(policy: RetryPolicy, factory?: TaskFactory) =>
    (task: TaskLike<T, E>): TaskLike<T, E> => {
      const f: TaskFactory = factory ?? defaultTaskFactory;
      return applyRetry(policy, () => task.run(), f);
    },

  fixed: (attempts: number, delay: Duration): RetryPolicy =>
    Object.freeze({
      maxAttempts: attempts,
      delay,
      backoff: "fixed" as BackoffStrategy,
      jitter: false,
      maxDelay: D.minutes(5),
      shouldRetry: () => true,
    }),

  exponential: (attempts: number, baseDelay: Duration): RetryPolicy =>
    Object.freeze({
      maxAttempts: attempts,
      delay: baseDelay,
      backoff: "exponential" as BackoffStrategy,
      jitter: false,
      maxDelay: D.minutes(5),
      shouldRetry: () => true,
    }),
};

/**
 * Default task factory that wraps a run function in a minimal Task-like object.
 * This avoids importing Task directly which could cause circular dependencies.
 */
const defaultTaskFactory: TaskFactory = <T, E>(
  run: () => Promise<Result<T, E>>,
): TaskLike<T, E> => ({ run });
