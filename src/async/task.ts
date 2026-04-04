/**
 * @module task
 *
 * Lazy, composable async computations that always produce `Result<T, E>`.
 *
 * **Why Task instead of raw async/await?**
 * An `async function` executes immediately when called and throws on failure.
 * `Task` is a *description* of an async operation: it does nothing until
 * `.run()` is called. This lets you build pipelines (`map`, `flatMap`, `zip`)
 * that compose before any side effects happen, and guarantees the result is
 * always a `Result` (never a thrown exception).
 *
 * **How memoisation works:**
 * `.memoize()` captures the first `.run()` Promise. Concurrent callers
 * share the same in-flight Promise (no duplicate work). After settlement,
 * the original thunk is released for GC, mirroring `Lazy<T>`.
 */

import type { Result } from "../core/result.js";
import { castErr, castOk, collectResults, Err, Ok } from "../core/result.js";

/**
 * Composable async computation that produces `Result<T, E>`.
 *
 * A Task is a lazy description of an async operation. It does not execute
 * until `.run()` is called. This lets you build complex async pipelines
 * that compose before any side effects happen.
 *
 * @example
 * ```ts
 * const fetchUser = Task<User, ApiError>(async () => {
 *   const res = await fetch('/api/user');
 *   if (!res.ok) return Err({ code: res.status });
 *   return Ok(await res.json());
 * });
 *
 * const pipeline = fetchUser
 *   .map(user => user.name)
 *   .flatMap(name => validateName(name))
 *   .mapErr(e => `Failed: ${e.code}`);
 *
 * const result = await pipeline.run(); // Result<string, string>
 * ```
 */
class TaskImpl<T, E> {
  constructor(private readonly _run: () => Promise<Result<T, E>>) {}

  /** Execute the task. Returns a Promise of Result. */
  run(): Promise<Result<T, E>> {
    return this._run();
  }

  /** Transform the success value. Does not execute yet. */
  map<U>(fn: (value: T) => U): Task<U, E> {
    return new TaskImpl(async () => {
      const r = await this._run();
      return r.isOk ? Ok(fn(r.value)) : castErr(r);
    });
  }

  /** Transform the error value. Does not execute yet. */
  mapErr<F>(fn: (error: E) => F): Task<T, F> {
    return new TaskImpl(async () => {
      const r = await this._run();
      return r.isErr ? Err(fn(r.error)) : castOk(r);
    });
  }

  /** Chain into another async operation on success. Short-circuits on error. */
  flatMap<U>(fn: (value: T) => Task<U, E>): Task<U, E> {
    return new TaskImpl(async () => {
      const r = await this._run();
      if (r.isErr) return castErr(r);
      return fn(r.value).run();
    });
  }

  /** Run a side-effect on the success value without altering the Task. */
  tap(fn: (value: T) => void): Task<T, E> {
    return new TaskImpl(async () => {
      const r = await this._run();
      if (r.isOk) fn(r.value);
      return r;
    });
  }

  /** Run a side-effect on the error without altering the Task. */
  tapErr(fn: (error: E) => void): Task<T, E> {
    return new TaskImpl(async () => {
      const r = await this._run();
      if (r.isErr) fn(r.error);
      return r;
    });
  }

  /** Provide a fallback value on error. Returns `Task<T, never>`. */
  unwrapOr(fallback: T): Task<T, never> {
    return new TaskImpl(async () => {
      const r = await this._run();
      return Ok(r.isOk ? r.value : fallback);
    });
  }

  /** Run and extract the value, or use `fallback` on error. Convenience for fire-and-forget. */
  async runGetOr(fallback: T): Promise<T> {
    const r = await this._run();
    return r.isOk ? r.value : fallback;
  }

  /** Run both tasks in parallel, combine results into a tuple. */
  zip<U>(other: Task<U, E>): Task<[T, U], E> {
    return new TaskImpl(async () => {
      const [a, b] = await Promise.all([this._run(), other._run()]);
      if (a.isErr) return castErr(a);
      if (b.isErr) return castErr(b);
      return Ok([a.value, b.value] as [T, U]);
    });
  }

  /**
   * Cache the result of the first `.run()`. Subsequent calls return the
   * same Promise (and therefore the same Result). The original thunk is
   * released for GC after execution, mirroring `Lazy<T>`.
   *
   * @example
   * ```ts
   * const config = Task.fromPromise(() => loadConfig()).memoize();
   * await config.run(); // executes
   * await config.run(); // returns cached Result
   * ```
   */
  memoize(): Task<T, E> {
    let cached: Promise<Result<T, E>> | null = null;
    let thunk: (() => Promise<Result<T, E>>) | null = this._run;
    return new TaskImpl(() => {
      if (cached !== null) return cached;
      if (thunk === null) throw new TypeError("Task.memoize: thunk released unexpectedly");
      cached = thunk();
      thunk = null;
      return cached;
    });
  }

  /**
   * Race this task against a timeout. If the task does not complete
   * within `ms` milliseconds, returns `Err(onTimeout())`.
   *
   * @example
   * ```ts
   * fetchUser.timeout(5000, () => 'timeout').run();
   * ```
   */
  timeout(ms: number, onTimeout: () => E): Task<T, E> {
    return new TaskImpl(() =>
      Promise.race([
        this._run(),
        new Promise<Result<T, E>>(resolve => setTimeout(() => resolve(Err(onTimeout())), ms)),
      ]),
    );
  }

  /**
   * Retry the task up to `attempts` times, with optional `delay` (ms)
   * between attempts. Returns the last Result if all attempts fail.
   *
   * @example
   * ```ts
   * fetchUser.retry(3, 100).run(); // 3 attempts, 100ms between
   * ```
   */
  retry(attempts: number, delay?: number): Task<T, E> {
    return new TaskImpl(async () => {
      let last: Result<T, E> = await this._run();
      for (let i = 1; i < attempts && last.isErr; i++) {
        if (delay !== undefined && delay > 0) {
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
        last = await this._run();
      }
      return last;
    });
  }
}

// ── Public type + callable factory (const/type merge) ────────────────────────

/**
 * Public type alias so consumers write `Task<T, E>` without seeing
 * the internal class name. Works in both type and value position:
 *
 *   - Type position: `const t: Task<number, string> = ...`
 *   - Value position: `Task(async () => Ok(42))`, `Task.of(42)`
 */
export type Task<T, E> = TaskImpl<T, E>;

/**
 * Create or manipulate `Task` values.
 *
 * Callable as a factory (`Task(thunk)`) and as a namespace for static
 * helpers (`Task.of`, `Task.fromResult`, `Task.fromPromise`, etc.).
 *
 * @example
 * ```ts
 * const t = Task<number, string>(async () => Ok(42));
 * const wrapped = Task.of(42);
 * const safe = Task.fromPromise(() => fetch('/api'), String);
 * ```
 */
export const Task: {
  <T, E>(run: () => Promise<Result<T, E>>): Task<T, E>;
  readonly of: <T>(value: T) => Task<T, never>;
  readonly fromResult: <T, E>(result: Result<T, E>) => Task<T, E>;
  readonly fromPromise: <T, E = unknown>(
    promise: () => Promise<T>,
    onError?: (e: unknown) => E,
  ) => Task<T, E>;
  readonly all: <T, E>(tasks: readonly Task<T, E>[]) => Task<readonly T[], E>;
  readonly race: <T, E>(tasks: readonly Task<T, E>[]) => Task<T, E>;
  readonly allSettled: <T, E>(tasks: readonly Task<T, E>[]) => Task<readonly Result<T, E>[], never>;
  readonly traverse: <A, T, E>(
    items: readonly A[],
    fn: (item: A) => Task<T, E>,
  ) => Task<readonly T[], E>;
  readonly sequence: <T, E>(tasks: readonly Task<T, E>[]) => Task<readonly T[], E>;
  readonly ap: <A, B, E>(fnTask: Task<(a: A) => B, E>, argTask: Task<A, E>) => Task<B, E>;
  readonly is: (value: unknown) => value is Task<unknown, unknown>;
} = Object.assign(<T, E>(run: () => Promise<Result<T, E>>): Task<T, E> => new TaskImpl(run), {
  /**
   * Create a Task from a plain value. Always succeeds.
   *
   * @example
   * ```ts
   * const task = Task.of(42); // Task<number, never>
   * ```
   */
  of: <T>(value: T): Task<T, never> => new TaskImpl(async () => Ok(value)),

  /**
   * Create a Task from an existing Result.
   *
   * @example
   * ```ts
   * Task.fromResult(Ok(42)).run(); // Promise<Ok(42)>
   * ```
   */
  fromResult: <T, E>(result: Result<T, E>): Task<T, E> => new TaskImpl(async () => result),

  /**
   * Create a Task from a Promise, catching rejections.
   *
   * Provide `onError` to map the rejection to a typed error.
   *
   * @example
   * ```ts
   * Task.fromPromise(() => fetch('/api'), e => String(e));
   * ```
   */
  fromPromise: <T, E = unknown>(
    promise: () => Promise<T>,
    onError?: (e: unknown) => E,
  ): Task<T, E> =>
    new TaskImpl(async () => {
      try {
        return Ok(await promise());
      } catch (e) {
        return Err(onError ? onError(e) : (e as E));
      }
    }),

  /**
   * Run all tasks in parallel, collect results. Short-circuits on first error.
   *
   * @example
   * ```ts
   * const result = await Task.all([Task.of(1), Task.of(2)]).run();
   * result.unwrap(); // [1, 2]
   * ```
   */
  all: <T, E>(tasks: readonly Task<T, E>[]): Task<readonly T[], E> =>
    new TaskImpl(async () => {
      const results = await Promise.all(tasks.map(t => t.run()));
      return collectResults(results);
    }),

  /**
   * Race all tasks. The first to settle wins.
   *
   * @example
   * ```ts
   * Task.race([fetchFromCache, fetchFromApi]).run();
   * ```
   */
  race: <T, E>(tasks: readonly Task<T, E>[]): Task<T, E> =>
    new TaskImpl(() => Promise.race(tasks.map(t => t.run()))),

  /**
   * Run all tasks in parallel and collect every Result (never short-circuits).
   *
   * @example
   * ```ts
   * Task.allSettled([task1, task2]).run();
   * // -> Ok([Ok(1), Err('x')])
   * ```
   */
  allSettled: <T, E>(tasks: readonly Task<T, E>[]): Task<readonly Result<T, E>[], never> =>
    new TaskImpl(async () => Ok(await Promise.all(tasks.map(t => t.run())))),

  /**
   * Map each element through an async fallible function, collecting in parallel.
   * Short-circuits on the first Err.
   */
  traverse: <A, T, E>(items: readonly A[], fn: (item: A) => Task<T, E>): Task<readonly T[], E> =>
    new TaskImpl(async () => {
      const results = await Promise.all(items.map(item => fn(item).run()));
      return collectResults(results);
    }),

  /** Alias for `Task.all`. Runs all tasks in parallel and collects results. */
  sequence: <T, E>(tasks: readonly Task<T, E>[]): Task<readonly T[], E> =>
    new TaskImpl(async () => {
      const results = await Promise.all(tasks.map(t => t.run()));
      return collectResults(results);
    }),

  /**
   * Applicative apply: run both tasks in parallel, apply the function result to the value.
   *
   * @example
   * ```ts
   * Task.ap(Task.of((n: number) => n * 2), Task.of(21)).run();
   * // Ok(42)
   * ```
   */
  ap: <A, B, E>(fnTask: Task<(a: A) => B, E>, argTask: Task<A, E>): Task<B, E> =>
    new TaskImpl(async () => {
      const [fnResult, argResult] = await Promise.all([fnTask.run(), argTask.run()]);
      if (fnResult.isErr) return castErr(fnResult);
      if (argResult.isErr) return castErr(argResult);
      return Ok(fnResult.value(argResult.value));
    }),

  /** Type guard: returns true if `value` is a Task instance. */
  is: (value: unknown): value is Task<unknown, unknown> => value instanceof TaskImpl,
});
