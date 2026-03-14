// ═══════════════════════════════════════════════════════════════════════════════
// Program
// ═══════════════════════════════════════════════════════════════════════════════

import type { Result } from './result.js';
import type { Task } from './task.js';

// ── Error formatting ────────────────────────────────────────────────────────

/** Format an error value for stderr. Prefers toString() over String(). */
const formatError = (error: unknown): string => {
  if (error !== null && typeof error === 'object') {
    const s = String(error);
    if (s !== '[object Object]') return s;
    try {
      return JSON.stringify(error);
    } catch {
      return s;
    }
  }
  return String(error);
};

/** ISO timestamp for log lines. */
const ts = (): string => new Date().toISOString();

// ── Public interface ────────────────────────────────────────────────────────

/**
 * A runnable program built on {@link Task}.
 *
 * Use `.run()` for production (handles signals, exit codes, stderr).
 * Use `.execute()` for testing (returns `Result`, no process lifecycle).
 */
export interface Program<T, E> {
  /**
   * Run with full process lifecycle management.
   *
   * Logs program start and errors automatically.
   *
   * - SIGINT / SIGTERM fire the `AbortSignal` passed to the effect
   * - Second signal force-exits (code 130)
   * - `Ok` -> `process.exit(0)`
   * - `Err` -> stderr + `process.exit(1)`
   * - Interrupted -> `process.exit(130)`
   */
  run(): Promise<void>;

  /**
   * Execute without process lifecycle. Returns the raw {@link Result}.
   * No logging, no signals, no exit. Use for testing.
   *
   * Accepts an optional `AbortSignal` for cancellation in tests.
   */
  execute(signal?: AbortSignal): Promise<Result<T, E>>;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a named {@link Program} from a {@link Task} or an effect function.
 *
 * When given a function, it receives an `AbortSignal` wired to
 * SIGINT/SIGTERM so the effect can respond to graceful shutdown.
 *
 * `.run()` automatically logs program start, errors, and interrupts.
 *
 * @example
 * ```ts
 * const main = Program('my-service', (signal) =>
 *   pipe(
 *     loadConfig(),
 *     Task.flatMap(cfg => startServer(cfg, { signal })),
 *   )
 * );
 * main.run();
 * // [2026-03-16T10:00:00.000Z] [my-service] started
 * // ... on error:
 * // [2026-03-16T10:00:01.234Z] [my-service] error: NotFound(NOT_FOUND): User not found
 * ```
 */
export function Program<T, E>(
  name: string,
  effect: Task<T, E> | ((signal: AbortSignal) => Task<T, E>),
): Program<T, E> {
  const toTask: (signal: AbortSignal) => Task<T, E> =
    typeof effect === 'function' ? effect : () => effect;

  const tag = `[${name}]`;

  return {
    async run(): Promise<void> {
      const ac = new AbortController();
      let interrupted = false;

      const onSignal = (): void => {
        if (interrupted) process.exit(130);
        interrupted = true;
        console.error(`${ts()} ${tag} interrupted`);
        ac.abort();
      };

      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      console.log(`${ts()} ${tag} started`);

      try {
        const result = await toTask(ac.signal).run();

        if (result.isOk) {
          console.log(`${ts()} ${tag} completed`);
          process.exit(0);
        } else if (interrupted) {
          process.exit(130);
        } else {
          console.error(`${ts()} ${tag} error: ${formatError(result.unwrapErr())}`);
          process.exit(1);
        }
      } catch (unhandled: unknown) {
        console.error(`${ts()} ${tag} error: ${formatError(unhandled)}`);
        process.exit(1);
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }
    },

    async execute(signal?: AbortSignal): Promise<Result<T, E>> {
      return toTask(signal ?? new AbortController().signal).run();
    },
  };
}
