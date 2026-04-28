/**
 * @module runtime/process
 *
 * Cross-runtime process information and argument parsing.
 *
 * **Why wrap process globals?**
 * Each runtime exposes process info differently: Node/Bun use `process`,
 * Deno uses `Deno`. This module uses the ProcessInfo adapter from
 * runtime/adapters which normalises both behind a single interface,
 * returning Result/Option instead of throwing.
 */

import { None, type Option, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import type { SchemaError, SchemaType } from "../data/schema.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";
import { resolveProcessInfo } from "./adapters/process-adapter.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Process operation failed (e.g. cwd deleted). */
export const ProcessError: ErrTypeConstructor<"ProcessError", string> = ErrType("ProcessError");

// ── Cached adapter ──────────────────────────────────────────────────────────

const adapter = resolveProcessInfo();

// ── Memory usage type ───────────────────────────────────────────────────────

/** Heap and RSS memory usage. */
export interface MemoryUsage {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly rss: number;
}

// ── Arg parsing ─────────────────────────────────────────────────────────────

const parseArgv = (argv: readonly string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;

    const withoutDashes = arg.slice(2);
    const eqIdx = withoutDashes.indexOf("=");

    if (eqIdx !== -1) {
      const key = withoutDashes.slice(0, eqIdx);
      const value = withoutDashes.slice(eqIdx + 1);
      result[key] = value;
    } else {
      const key = withoutDashes;
      const nextArg = argv[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("--")) {
        result[key] = nextArg;
        i += 1;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Cross-runtime process information and argument parsing.
 *
 * @example
 * ```ts
 * const dir = Process.cwd();          // Result<string, ProcessError>
 * const id = Process.pid();           // Option<number>
 * const home = Process.env('HOME');   // Option<string>
 * const args = Process.argv();        // readonly string[]
 * ```
 */
export const Process: {
  /** Get the current working directory. */
  readonly cwd: () => Result<string, ErrType<"ProcessError">>;
  /** Get the process ID. */
  readonly pid: () => Option<number>;
  /** Get process uptime in seconds. */
  readonly uptime: () => Option<number>;
  /** Get heap and RSS memory usage. */
  readonly memoryUsage: () => Option<MemoryUsage>;
  /**
   * Read a single environment variable. Returns None if unset or unavailable.
   *
   * Cross-runtime: Node/Bun use `process.env[key]`, Deno uses `Deno.env.get(key)`.
   * Deno requires `--allow-env` permission; returns None if denied.
   */
  readonly env: (key: string) => Option<string>;
  /** Get command-line arguments (excluding runtime and script path). */
  readonly argv: () => readonly string[];
  /** Parse command-line arguments against a schema shape. */
  readonly parseArgs: <T extends Record<string, SchemaType<unknown>>>(
    schema: T,
    args?: readonly string[],
  ) => Result<
    { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
    SchemaError
  >;
  /** Exit the process with the given code. */
  readonly exit: (code?: number) => never;
} = {
  cwd: (): Result<string, ErrType<"ProcessError">> => {
    if (adapter === undefined) return Err(ProcessError("No process global available"));
    try {
      return Ok(adapter.cwd());
    } catch (e) {
      return Err(ProcessError(e instanceof Error ? e.message : String(e)));
    }
  },

  pid: (): Option<number> => (adapter !== undefined ? Some(adapter.pid) : None),

  uptime: (): Option<number> => {
    if (adapter?.uptime === undefined) return None;
    try {
      return Some(adapter.uptime());
    } catch {
      return None;
    }
  },

  memoryUsage: (): Option<MemoryUsage> => {
    if (adapter?.memoryUsage === undefined) return None;
    try {
      return Some(adapter.memoryUsage());
    } catch {
      return None;
    }
  },

  env: (key: string): Option<string> => {
    if (adapter === undefined) return None;
    const val = adapter.env(key);
    return val !== undefined ? Some(val) : None;
  },

  argv: (): readonly string[] => adapter?.argv ?? [],

  parseArgs: <T extends Record<string, SchemaType<unknown>>>(
    schema: T,
    args?: readonly string[],
  ): Result<
    { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
    SchemaError
  > => {
    const rawArgs = args ?? Process.argv();
    const parsed = parseArgv(rawArgs);
    const result: Record<string, unknown> = {};
    const keys = Object.keys(schema);

    for (const key of keys) {
      const fieldSchema = schema[key]!;
      const raw = parsed[key];
      const validated = fieldSchema.parse(raw);
      if (validated.isErr) {
        return Err({
          path: [key],
          expected: validated.unwrapErr().expected,
          received: raw === undefined ? "undefined" : `"${raw}"`,
        });
      }
      result[key] = validated.value;
    }

    return Ok(result) as unknown as Result<
      { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  },

  exit: (code?: number): never => {
    if (adapter !== undefined) return adapter.exit(code);
    throw new Error(`Process.exit(${code ?? 0}) called but no runtime exit available`);
  },
};
