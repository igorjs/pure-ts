/**
 * @module semaphore
 *
 * Concurrency control for limiting parallel Task execution.
 *
 * **Why Semaphore?**
 * When calling external APIs with rate limits, or accessing resources
 * with connection pool limits, you need to bound concurrency. Semaphore
 * ensures at most N tasks run simultaneously. Tasks that exceed the limit
 * queue and wait until a permit becomes available.
 */

import type { Result } from "../core/result.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Task-like interface to avoid direct Task import. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

/** A release function returned after acquiring a permit. */
type Release = () => void;

/**
 * A counting semaphore for concurrency control.
 *
 * @example
 * ```ts
 * const sem = Semaphore.create(3); // max 3 concurrent
 *
 * // Wrap a task: queues if all permits are taken
 * const limited = sem.wrap(expensiveTask);
 * await limited.run();
 *
 * // Manual acquire/release
 * const release = await sem.acquire();
 * try { await doWork(); } finally { release(); }
 * ```
 */
export interface SemaphoreInstance {
  /** Acquire a permit. Resolves when a permit is available. */
  readonly acquire: () => Promise<Release>;
  /** Wrap a task: acquires before run, releases after completion. */
  readonly wrap: <T, E>(task: TaskLike<T, E>) => TaskLike<T, E>;
  /** Number of permits currently available. */
  readonly available: () => number;
  /** Number of tasks waiting for a permit. */
  readonly pending: () => number;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createSemaphore = (permits: number): SemaphoreInstance => {
  let available = permits;
  const waiters: Array<() => void> = [];

  const release: Release = () => {
    available++;
    const next = waiters.shift();
    if (next !== undefined) next();
  };

  const acquire = (): Promise<Release> => {
    if (available > 0) {
      available--;
      return Promise.resolve(release);
    }
    return new Promise<Release>(resolve => {
      waiters.push(() => {
        available--;
        resolve(release);
      });
    });
  };

  return Object.freeze({
    acquire,

    wrap: <T, E>(task: TaskLike<T, E>): TaskLike<T, E> => ({
      run: async (): Promise<Result<T, E>> => {
        const rel = await acquire();
        try {
          return await task.run();
        } finally {
          rel();
        }
      },
    }),

    available: () => available,
    pending: () => waiters.length,
  });
};

// ── Mutex (special case: semaphore with 1 permit) ───────────────────────────

/**
 * A mutual exclusion lock. Only one task can hold the lock at a time.
 * Equivalent to `Semaphore.create(1)`.
 */
export interface MutexInstance {
  readonly acquire: () => Promise<Release>;
  readonly wrap: <T, E>(task: TaskLike<T, E>) => TaskLike<T, E>;
  readonly isLocked: () => boolean;
}

const createMutex = (): MutexInstance => {
  const inner = createSemaphore(1);
  return Object.freeze({
    acquire: inner.acquire,
    wrap: inner.wrap,
    isLocked: () => inner.available() === 0,
  });
};

// ── Public namespaces ───────────────────────────────────────────────────────

/**
 * Create counting semaphores for concurrency control.
 */
export const Semaphore: {
  readonly create: (permits: number) => SemaphoreInstance;
} = {
  create: createSemaphore,
};

/**
 * Create mutual exclusion locks (semaphore with 1 permit).
 */
export const Mutex: {
  readonly create: () => MutexInstance;
} = {
  create: createMutex,
};
