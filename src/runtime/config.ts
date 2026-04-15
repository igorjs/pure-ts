/**
 * @module runtime/config
 *
 * Type-safe configuration loading from environment variables.
 *
 * **Why Config instead of raw process.env?**
 * `process.env` returns `string | undefined` for every key. Config ties
 * Schema validation to env loading: define the shape once, get a typed,
 * validated config object back as `Result<T, SchemaError>`. Failed
 * validation tells you exactly which key was missing or malformed.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import type { SchemaError, SchemaType } from "../data/schema.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** @internal A schema shape where each field validates a string env value. */
export type ConfigShape = Record<string, SchemaType<unknown>>;

/** @internal Infer the output type from a config shape. */
export type InferConfig<T extends ConfigShape> = {
  readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never;
};

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Load configuration from a record of string values (typically process.env).
 *
 * For each key in the schema shape, reads the corresponding env value and
 * parses it through the schema. Collects all errors (does not short-circuit)
 * so the user sees every invalid field at once.
 */
const loadConfig = <T extends ConfigShape>(
  shape: T,
  env: Record<string, string | undefined>,
): Result<InferConfig<T>, SchemaError> => {
  const result: Record<string, unknown> = {};
  const keys = Object.keys(shape);

  for (const key of keys) {
    const schema = shape[key]!;
    const raw = env[key];
    const parsed = schema.parse(raw);
    if (parsed.isErr) {
      return Err({
        path: [key],
        expected: parsed.unwrapErr().expected,
        received: raw === undefined ? "undefined" : `"${raw}"`,
      });
    }
    result[key] = parsed.value;
  }

  return Ok(result as InferConfig<T>);
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Type-safe configuration loading.
 *
 * @example
 * ```ts
 * const AppConfig = Config.from({
 *   PORT: Schema.string.transform(Number).refine(n => n > 0, 'valid port'),
 *   DATABASE_URL: Schema.string,
 *   LOG_LEVEL: Schema.union(
 *     Schema.literal('debug'), Schema.literal('info'),
 *     Schema.literal('warn'), Schema.literal('error'),
 *   ).default('info'),
 * });
 *
 * // Load from process.env
 * const config = AppConfig.load();  // Result<{ PORT: number, ... }, SchemaError>
 *
 * // Load from custom env (useful for testing)
 * const config = AppConfig.loadFrom({ PORT: '3000', DATABASE_URL: 'pg://...' });
 * ```
 */
export const Config: {
  /** Define a typed config shape and get a loader with load() and loadFrom(). */
  readonly from: <T extends ConfigShape>(
    shape: T,
  ) => {
    /** Load config from the runtime environment (process.env or Deno.env). */
    readonly load: () => Result<InferConfig<T>, SchemaError>;
    /** Load config from a custom env record (useful for testing). */
    readonly loadFrom: (
      env: Record<string, string | undefined>,
    ) => Result<InferConfig<T>, SchemaError>;
    /** The original schema shape definition. */
    readonly shape: T;
  };
} = {
  from: <T extends ConfigShape>(shape: T) =>
    Object.freeze({
      load: (): Result<InferConfig<T>, SchemaError> => {
        // Try process.env first (Node/Bun)
        const processEnv = (
          globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }
        ).process?.env;
        if (processEnv !== undefined) return loadConfig(shape, processEnv);

        // Try Deno.env (Deno)
        const denoEnv = (
          globalThis as unknown as {
            Deno?: { env?: { toObject?(): Record<string, string> } };
          }
        ).Deno?.env?.toObject?.();
        if (denoEnv !== undefined) return loadConfig(shape, denoEnv);

        // No env available
        return Err({
          path: [],
          expected: "environment variables",
          received: "unavailable (no process or Deno.env global)",
        });
      },
      loadFrom: (env: Record<string, string | undefined>): Result<InferConfig<T>, SchemaError> =>
        loadConfig(shape, env),
      shape,
    }),
};
