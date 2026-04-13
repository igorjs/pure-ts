/**
 * @module cron-runner
 *
 * Execute async tasks on cron schedules with start/stop lifecycle.
 *
 * **Why CronRunner?**
 * Scheduled tasks are a common need: cache invalidation, session cleanup,
 * report generation, health checks. CronRunner wraps the {@link Cron}
 * expression parser with a simple start/stop lifecycle, executing an async
 * handler whenever the current time matches the schedule. It checks once
 * per minute (cron has minute granularity), keeping CPU overhead minimal.
 */

import type { CronExpression } from "../types/cron.js";
import { Cron } from "../types/cron.js";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Configuration for creating a {@link CronRunnerInstance}.
 *
 * @example
 * ```ts
 * const runner = CronRunner.create({
 *   schedule: '0 9 * * 1-5',   // 9am weekdays
 *   handler: async () => { await generateReport(); },
 *   onError: (error) => { console.log('Cron failed:', error); },
 *   runImmediately: true,
 * });
 * ```
 */
export interface CronRunnerOptions {
  /** Cron expression string (5-field standard format). */
  readonly schedule: string;
  /** Async function to execute on each cron match. */
  readonly handler: () => Promise<void>;
  /** Optional callback invoked when the handler throws. */
  readonly onError?: ((error: unknown) => void) | undefined;
  /** If true, execute the handler once immediately when start() is called. */
  readonly runImmediately?: boolean | undefined;
}

/**
 * A cron-scheduled task runner with start/stop lifecycle.
 *
 * @example
 * ```ts
 * const runner = CronRunner.create({
 *   schedule: '* /5 * * * *',
 *   handler: async () => { await cleanupExpiredSessions(); },
 * });
 *
 * runner.start();
 * runner.isRunning(); // true
 * runner.nextRun();   // Date
 * runner.stop();
 * ```
 */
export interface CronRunnerInstance {
  /** Start the cron runner. Begins checking the schedule every 60 seconds. */
  readonly start: () => void;
  /** Stop the cron runner. Clears the interval timer. */
  readonly stop: () => void;
  /** Whether the runner is currently active. */
  readonly isRunning: () => boolean;
  /** Calculate the next scheduled execution time, or undefined if stopped. */
  readonly nextRun: () => Date | undefined;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createCronRunner = (options: CronRunnerOptions): CronRunnerInstance => {
  const parseResult = Cron.parse(options.schedule);
  if (parseResult.isErr) {
    throw new TypeError(
      `Invalid cron expression "${options.schedule}": ${parseResult.error.expected} (got ${parseResult.error.received})`,
    );
  }

  const cronExpr: CronExpression = parseResult.value;
  const handler = options.handler;
  const onError = options.onError;
  const runImmediately = options.runImmediately ?? false;

  let running = false;
  let intervalId: ReturnType<typeof setInterval> | undefined;
  // Track the last minute we fired to avoid double-firing within the same minute
  let lastFiredMinute = -1;

  /** Safely execute the handler, routing errors to onError. */
  const executeHandler = (): void => {
    handler().catch((error: unknown) => {
      if (onError !== undefined) {
        onError(error);
      }
    });
  };

  /** Check if the current time matches the cron expression. */
  const tick = (): void => {
    const now = new Date();
    const currentMinute =
      now.getFullYear() * 525960 +
      now.getMonth() * 43800 +
      now.getDate() * 1440 +
      now.getHours() * 60 +
      now.getMinutes();

    // Skip if we already fired for this minute
    if (currentMinute === lastFiredMinute) {
      return;
    }

    if (Cron.matches(cronExpr, now)) {
      lastFiredMinute = currentMinute;
      executeHandler();
    }
  };

  return Object.freeze({
    start: (): void => {
      if (running) {
        return;
      }
      running = true;
      lastFiredMinute = -1;

      if (runImmediately) {
        executeHandler();
      }

      // Check every 30 seconds to avoid missing minute boundaries due to drift
      intervalId = setInterval(tick, 30_000);
    },

    stop: (): void => {
      if (!running) {
        return;
      }
      running = false;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    },

    isRunning: () => running,

    nextRun: (): Date | undefined => {
      if (!running) {
        return undefined;
      }
      const next = Cron.next(cronExpr);
      if (next.isSome) {
        return next.value;
      }
      return undefined;
    },
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create cron-scheduled task runners.
 *
 * Parses the cron expression at creation time. The runner checks every
 * 30 seconds whether the current minute matches the schedule, executing
 * the handler when it does.
 *
 * @example
 * ```ts
 * const runner = CronRunner.create({
 *   schedule: '0 9 * * 1-5',   // 9am weekdays
 *   handler: async () => { await generateReport(); },
 *   runImmediately: true,
 * });
 *
 * runner.start();
 * // ... later
 * runner.stop();
 * ```
 */
export const CronRunner: {
  readonly create: (options: CronRunnerOptions) => CronRunnerInstance;
} = {
  create: createCronRunner,
};
