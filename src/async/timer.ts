/**
 * @module async/timer
 *
 * Type-safe time-based operations built on web standard APIs.
 *
 * **Why Timer instead of raw setTimeout?**
 * `setTimeout` is fire-and-forget with no composability. Timer wraps
 * time-based operations in Task and Stream, making them lazy, typed,
 * and composable with the rest of pure-ts. Duration branding prevents
 * unit-mismatch bugs. `performance.now()` provides high-resolution
 * timing without importing node:perf_hooks.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";
import type { Stream } from "./stream.js";
import { Stream as S } from "./stream.js";
import { makeTask, type TaskLike } from "./task-like.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** A deadline was exceeded before the task completed. */
export const TimeoutError: ErrTypeConstructor<"TimeoutError", string> = ErrType("TimeoutError");

// ── Structural type for performance API ─────────────────────────────────────
// Why: tsconfig uses "lib": ["es2024"] without DOM types. Access
// performance.now() structurally to avoid requiring DOM lib.

interface PerformanceLike {
  now(): number;
}

const getPerformance = (): PerformanceLike =>
  (globalThis as unknown as { performance: PerformanceLike }).performance;

// ── Internal helpers ────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));

// ── Timer ───────────────────────────────────────────────────────────────────

/**
 * Type-safe time-based operations using web standard APIs.
 *
 * @example
 * ```ts
 * // Sleep for 1 second
 * await Timer.sleep(Duration.seconds(1)).run();
 *
 * // Tick every 500ms, take 5 ticks
 * const ticks = Timer.interval(Duration.milliseconds(500)).take(5);
 *
 * // Run a task with a 5-second deadline
 * const result = await Timer.deadline(Duration.seconds(5), myTask).run();
 * // Result<T, E | ErrType<'TimeoutError'>>
 *
 * // High-resolution timestamp
 * const start = Timer.now();
 * ```
 */
export const Timer: {
  /** Sleep for the given duration. Returns a Task that resolves after the delay. */
  readonly sleep: (duration: Duration) => TaskLike<void, never>;
  /** Emit ascending tick counts at a fixed interval. */
  readonly interval: (period: Duration) => Stream<number, never>;
  /** Wait for the given duration, then run the task. */
  readonly delay: <T, E>(duration: Duration, task: TaskLike<T, E>) => TaskLike<T, E>;
  /** Race a task against a deadline. Returns TimeoutError if the deadline is exceeded. */
  readonly deadline: <T, E>(
    duration: Duration,
    task: TaskLike<T, E>,
  ) => TaskLike<T, E | ErrType<"TimeoutError">>;
  /** High-resolution timestamp in milliseconds via performance.now(). */
  readonly now: () => number;
} = {
  sleep: (duration: Duration) =>
    makeTask(async () => {
      await sleep(D.toMilliseconds(duration));
      return Ok(undefined);
    }),

  interval: (period: Duration): Stream<number, never> => S.interval(period),

  delay: <T, E>(duration: Duration, task: TaskLike<T, E>) =>
    makeTask(async () => {
      await sleep(D.toMilliseconds(duration));
      return task.run();
    }),

  deadline: <T, E>(duration: Duration, task: TaskLike<T, E>) =>
    makeTask(() => {
      const ms = D.toMilliseconds(duration);
      const timeoutPromise = new Promise<Result<T, E | ErrType<"TimeoutError">>>(resolve => {
        setTimeout(
          () => resolve(Err(TimeoutError(`Deadline of ${D.format(duration)} exceeded`))),
          ms,
        );
      });
      // Why cast: task.run() returns Promise<Result<T, E>> but we need
      // Promise<Result<T, E | ErrType<'TimeoutError'>>>. The E channel
      // widens safely since Result is a discriminated union on .tag.
      const taskPromise = task.run() as Promise<Result<T, E | ErrType<"TimeoutError">>>;
      return Promise.race([taskPromise, timeoutPromise]);
    }),

  now: (): number => getPerformance().now(),
};
