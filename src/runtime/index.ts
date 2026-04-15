/**
 * @module runtime
 *
 * HTTP server, program lifecycle, logging, configuration, and cross-runtime utilities.
 *
 * Server, Program, Logger, Config, Os, Process, Path, Eol, Platform.
 *
 * @example
 * ```ts
 * import { Config, Logger, Process } from '@igorjs/pure-ts/runtime'
 *
 * const log = Logger.create({ level: 'info' });
 * const cwd = Process.cwd();
 * ```
 */
/** Typed environment variable validation and access. */

/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant, Option, OptionMatcher, SomeVariant } from "../core/option.js";
// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
/** Re-exported so public signatures that reference Ok / Err are visible from this entrypoint. */
export type { Err, Ok, Result, ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference SchemaError / SchemaType are visible from this entrypoint. */
export type { SchemaError, SchemaType } from "../data/schema.js";
/** Re-exported so public signatures that reference ErrType / ErrTypeConstructor are visible from this entrypoint. */
export type { ErrType, ErrTypeConstructor } from "../types/error.js";
/** Typed environment variable validation and access. */
export { Config } from "./config.js";
/** Log severity levels, ordered from least to most severe. */
/** Options for creating a Logger instance. */
/** A structured log record passed to log sinks. */
/** Function that receives a log record and outputs it somewhere. */
export type { LoggerOptions, LogLevel, LogRecord, LogSink } from "./logger.js";
/** Structured logger with configurable levels and formatters. */
export { Logger } from "./logger.js";
/** Cross-runtime OS information (hostname, arch, memory). */
export { Os } from "./os.js";
/** Line ending constants and normalization. */
/** OS-aware path manipulation without node:path dependency. */
/** Parsed path components (root, dir, base, ext, name). */
/** Runtime platform detection (isWindows, isPosix). */
export { Eol, Path, type PathParts, Platform } from "./platform.js";
/** Heap and RSS memory usage information. */
export type { MemoryUsage } from "./process.js";
/** Cross-runtime process info, cwd, env, args, and exit namespace. */
/** Error returned when a process operation fails. */
export { Process, ProcessError } from "./process.js";
