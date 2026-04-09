/**
 * @module runtime/process
 *
 * Cross-runtime process information and argument parsing.
 *
 * **Why wrap process globals?**
 * Each runtime exposes process info differently: Node/Bun use `process`,
 * Deno uses `Deno`, and QuickJS uses `scriptArgs` plus `std`/`os` modules.
 * This module provides a unified API that detects the runtime via
 * globalThis and returns Result/Option instead of throwing. The parseArgs
 * function provides a zero-dependency argument parser validated against a
 * Schema shape.
 */

import { None, type Option, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import type { SchemaError, SchemaType } from "../data/schema.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// -- Error types -------------------------------------------------------------

/** Process operation failed (e.g. cwd deleted). */
export const ProcessError: ErrTypeConstructor<"ProcessError", string> = ErrType("ProcessError");

// -- Structural types for runtime globals ------------------------------------

/** Structural type for globalThis.process (Node/Bun). */
interface NodeProcess {
  cwd(): string;
  readonly pid: number;
  readonly argv: readonly string[];
  exit(code?: number): never;
  uptime(): number;
  memoryUsage(): { heapUsed: number; heapTotal: number; rss: number };
}

/** Structural type for the Deno global with process-related APIs. */
interface DenoGlobal {
  cwd(): string;
  readonly pid: number;
  readonly args: readonly string[];
  exit(code?: number): never;
}

/** Structural type for the QuickJS `qjs:os` module (process-related subset). */
interface QjsOs {
  getcwd(): string;
  getpid(): number;
}

/** Structural type for the QuickJS `qjs:std` module (process-related subset). */
interface QjsStd {
  getenv(name: string): string | undefined;
  exit(code: number): void;
}

// -- Runtime detection helpers -----------------------------------------------

const getNodeProcess = (): NodeProcess | undefined =>
  (globalThis as unknown as { process?: NodeProcess }).process;

const getDeno = (): DenoGlobal | undefined => (globalThis as unknown as { Deno?: DenoGlobal }).Deno;

// Why: QuickJS detection mirrors the caching pattern from io/file.ts.
// The `scriptArgs` global is the cheapest feature-test for QuickJS.
// Module loading uses Function() to avoid bundler/static-analysis issues.
let qjsModules: { std: QjsStd; os: QjsOs } | null | undefined;
const getQjs = (): { std: QjsStd; os: QjsOs } | null => {
  if (qjsModules !== undefined) {
    return qjsModules;
  }
  const sa = (globalThis as unknown as { scriptArgs?: unknown }).scriptArgs;
  if (sa === undefined) {
    qjsModules = null;
    return null;
  }
  try {
    const os = Function(
      'try{return require("qjs:os")}catch{try{return require("os")}catch{return null}}',
    )() as QjsOs | null;
    const std = Function(
      'try{return require("qjs:std")}catch{try{return require("std")}catch{return null}}',
    )() as QjsStd | null;
    qjsModules = os !== null && std !== null ? { std, os } : null;
  } catch {
    qjsModules = null;
  }
  return qjsModules;
};

/** Get the QuickJS scriptArgs global (CLI arguments including script name). */
const getScriptArgs = (): readonly string[] | undefined =>
  (globalThis as unknown as { scriptArgs?: readonly string[] }).scriptArgs;

// -- Arg parsing helpers -----------------------------------------------------

/**
 * Parse --key=value and --flag patterns from argv.
 *
 * Returns a Record<string, string | true> where:
 * - `--key=value` produces { key: "value" }
 * - `--key value` produces { key: "value" } (next arg consumed as value)
 * - `--flag` produces { flag: "true" }
 */
const parseArgv = (argv: readonly string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith("--")) continue;

    const withoutDashes = arg.slice(2);
    const eqIdx = withoutDashes.indexOf("=");

    if (eqIdx !== -1) {
      // --key=value form
      const key = withoutDashes.slice(0, eqIdx);
      const value = withoutDashes.slice(eqIdx + 1);
      result[key] = value;
    } else {
      // --flag or --key value form
      const key = withoutDashes;
      const nextArg = argv[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith("--")) {
        result[key] = nextArg;
        i += 1; // Skip the value argument
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
};

// -- Memory usage type -------------------------------------------------------

/** Heap and RSS memory usage. */
interface MemoryUsage {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly rss: number;
}

const tryCwd = (fn: () => string): Result<string, ErrType<"ProcessError">> => {
  try {
    return Ok(fn());
  } catch (e) {
    return Err(ProcessError(e instanceof Error ? e.message : String(e)));
  }
};

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime process information and argument parsing.
 *
 * Detects the runtime (Deno, QuickJS, Node, Bun) via globalThis.
 * Returns Result for operations that can fail (cwd) and Option for
 * values that may not be available.
 *
 * @example
 * ```ts
 * const dir = Process.cwd();          // Result<string, ErrType<'ProcessError'>>
 * const id = Process.pid();           // Option<number>
 * const args = Process.argv();        // readonly string[]
 *
 * const config = Process.parseArgs({
 *   port: Schema.string.transform(Number),
 *   verbose: Schema.string.optional(),
 * });
 * // node app.js --port=3000 --verbose
 * // Result<{ port: number; verbose: string | undefined }, SchemaError>
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
  /** Get command-line arguments (excluding runtime and script path). */
  readonly argv: () => readonly string[];
  /**
   * Parse command-line arguments against a schema shape.
   *
   * Extracts `--key=value` and `--flag` patterns from argv, then
   * validates each value against the corresponding schema field.
   */
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
    const deno = getDeno();
    if (deno !== undefined) {
      return tryCwd(() => deno.cwd());
    }
    const qjs = getQjs();
    if (qjs !== null) {
      return tryCwd(() => qjs.os.getcwd());
    }
    const proc = getNodeProcess();
    if (proc !== undefined) {
      return tryCwd(() => proc.cwd());
    }
    return Err(ProcessError("No process global available"));
  },

  pid: (): Option<number> => {
    const deno = getDeno();
    if (deno !== undefined) {
      return Some(deno.pid);
    }
    const qjs = getQjs();
    if (qjs !== null) {
      return Some(qjs.os.getpid());
    }
    const proc = getNodeProcess();
    if (proc !== undefined) {
      return Some(proc.pid);
    }
    return None;
  },

  uptime: (): Option<number> => {
    const proc = getNodeProcess();
    if (proc !== undefined) {
      try {
        return Some(proc.uptime());
      } catch {
        return None;
      }
    }
    // Deno and QuickJS do not expose process uptime
    return None;
  },

  memoryUsage: (): Option<MemoryUsage> => {
    const proc = getNodeProcess();
    if (proc !== undefined) {
      try {
        const mem = proc.memoryUsage();
        return Some({
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
        });
      } catch {
        return None;
      }
    }
    // Deno and QuickJS do not expose heap/RSS memory usage
    return None;
  },

  argv: (): readonly string[] => {
    const deno = getDeno();
    if (deno !== undefined) {
      return deno.args;
    }
    const sa = getScriptArgs();
    if (sa !== undefined) {
      return sa;
    }
    const proc = getNodeProcess();
    if (proc !== undefined) {
      return proc.argv.slice(2);
    }
    return [];
  },

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

    // Why: result is Record<string, unknown> built from validated fields.
    // TS cannot prove the dynamic keys match the mapped type. Safe because
    // we iterated Object.keys(schema) and validated each field.
    return Ok(result) as unknown as Result<
      { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  },

  exit: (code?: number): never => {
    const deno = getDeno();
    if (deno !== undefined) {
      return deno.exit(code);
    }
    const qjs = getQjs();
    if (qjs !== null) {
      qjs.std.exit(code ?? 0);
      // Why: std.exit terminates the process but TS cannot verify that.
      // The throw below is unreachable; it satisfies the `never` return type.
      throw new Error("unreachable");
    }
    const proc = getNodeProcess();
    if (proc !== undefined) {
      return proc.exit(code);
    }
    // Last resort for environments without a process global
    throw new Error(`Process.exit(${code ?? 0}) called but no runtime exit available`);
  },
};
