/**
 * @module env
 *
 * Reader-like dependency injection for async pipelines.
 *
 * **Why Env instead of passing dependencies as parameters?**
 * When every function takes `(db, logger, config, ...)` as extra params,
 * the dependency list leaks through the entire call stack. `Env<R, T, E>`
 * defers the dependency: you compose the pipeline first, then provide the
 * environment at the edge (entry point). Each step in the pipeline can
 * `access` the environment without knowing who provides it.
 *
 * The Server's `derive()` solves this for HTTP context. Env solves it for
 * everything else: CLI tools, background workers, scheduled tasks.
 */

import type { Result } from "../core/result.js";
import { Ok } from "../core/result.js";

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A lazy async computation that requires an environment R to execute,
 * producing Result<T, E>.
 *
 * @example
 * ```ts
 * type AppEnv = { db: Database; logger: Logger };
 *
 * const getUser = (id: string) => Env.access<AppEnv>().flatMap(({ db }) =>
 *   Env.fromTask(db.query(`SELECT * FROM users WHERE id = $1`, [id]))
 * );
 *
 * // Provide the environment at the edge
 * const result = await getUser('u_123').run({ db, logger });
 * ```
 */
export interface Env<R, T, E> {
  /** Execute with the given environment. */
  readonly run: (env: R) => Promise<Result<T, E>>;
  /** Transform the produced value. */
  readonly map: <U>(fn: (value: T) => U) => Env<R, U, E>;
  /** Transform the error. */
  readonly mapErr: <F>(fn: (error: E) => F) => Env<R, T, F>;
  /** Chain into a dependent computation that shares the same environment. */
  readonly flatMap: <U>(fn: (value: T) => Env<R, U, E>) => Env<R, U, E>;
  /** Run a side-effect on the value. */
  readonly tap: (fn: (value: T) => void) => Env<R, T, E>;
  /** Provide a subset of the environment, narrowing R. */
  readonly provide: <R2>(fn: (r2: R2) => R) => Env<R2, T, E>;
  /** Provide the full environment, converting to a Task-like. */
  readonly provideAll: (env: R) => { readonly run: () => Promise<Result<T, E>> };
}

// ── Implementation ──────────────────────────────────────────────────────────

const createEnv = <R, T, E>(run: (env: R) => Promise<Result<T, E>>): Env<R, T, E> =>
  Object.freeze({
    run,

    map: <U>(fn: (value: T) => U): Env<R, U, E> =>
      createEnv(async (env: R) => {
        const r = await run(env);
        return r.isOk ? Ok(fn(r.value)) : (r as unknown as Result<U, E>);
      }),

    mapErr: <F>(fn: (error: E) => F): Env<R, T, F> =>
      createEnv(async (env: R) => {
        const r = await run(env);
        if (r.isOk) return r as unknown as Result<T, F>;
        return {
          tag: "Err" as const,
          error: fn(r.unwrapErr()),
          isOk: false,
          isErr: true,
        } as unknown as Result<T, F>;
      }),

    flatMap: <U>(fn: (value: T) => Env<R, U, E>): Env<R, U, E> =>
      createEnv(async (env: R) => {
        const r = await run(env);
        if (r.isErr) return r as unknown as Result<U, E>;
        return fn(r.value).run(env);
      }),

    tap: (fn: (value: T) => void): Env<R, T, E> =>
      createEnv(async (env: R) => {
        const r = await run(env);
        if (r.isOk) fn(r.value);
        return r;
      }),

    provide: <R2>(fn: (r2: R2) => R): Env<R2, T, E> => createEnv((r2: R2) => run(fn(r2))),

    provideAll: (env: R) => ({ run: () => run(env) }),
  });

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Create and compose environment-dependent computations.
 *
 * @example
 * ```ts
 * type Deps = { db: Database; logger: Logger };
 *
 * const program = Env.access<Deps>()
 *   .flatMap(({ db, logger }) => {
 *     logger.info('querying');
 *     return Env.of(db.query('SELECT 1'));
 *   });
 *
 * // At the entry point, provide everything
 * await program.run({ db: realDb, logger: realLogger });
 * ```
 */
export const Env: {
  /** Wrap a plain value. Environment passes through unused. */
  readonly of: <R, T>(value: T) => Env<R, T, never>;
  /** Access the full environment as the produced value. */
  readonly access: <R>() => Env<R, R, never>;
  /** Create from a function that returns a Result. */
  readonly from: <R, T, E>(fn: (env: R) => Promise<Result<T, E>>) => Env<R, T, E>;
  /** Create from a function that returns a plain value (cannot fail). */
  readonly fromSync: <R, T>(fn: (env: R) => T) => Env<R, T, never>;
} = {
  of: <R, T>(value: T): Env<R, T, never> => createEnv(async () => Ok(value)),

  access: <R>(): Env<R, R, never> => createEnv(async (env: R) => Ok(env)),

  from: createEnv,

  fromSync: <R, T>(fn: (env: R) => T): Env<R, T, never> => createEnv(async (env: R) => Ok(fn(env))),
};
