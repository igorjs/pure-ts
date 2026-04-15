/**
 * @module task-like
 *
 * Shared interface for Task-shaped values returned by IO and async operations.
 *
 * Many modules (File, Command, Crypto, Stream, Cache, etc.) return a "task-like"
 * value: an object with a `.run()` that produces `Promise<Result<T, E>>`. This
 * interface captures that contract without importing the full Task class, keeping
 * modules loosely coupled and avoiding circular dependencies.
 */

import type { Result } from "../core/result.js";

/**
 * A lazy computation that produces `Result<T, E>` when `.run()` is called.
 *
 * This is the structural contract shared by {@link Task} and all IO/async
 * operations. Call `.run()` to execute the computation.
 *
 * @example
 * ```ts
 * const task: TaskLike<string, Error> = File.read('./config.json');
 * const result = await task.run(); // Result<string, Error>
 * ```
 */
export interface TaskLike<T, E> {
  /** Execute the computation and return the result. */
  readonly run: () => Promise<Result<T, E>>;
}

/** Create a TaskLike from a run function. */
export const makeTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });
