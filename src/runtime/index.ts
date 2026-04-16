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

// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { Option } from "../core/option.js";
/** Re-exported so public signatures that reference OptionMatcher are visible from this entrypoint. */
export type { OptionMatcher } from "../core/option.js";
/** Re-exported so public signatures that reference SomeVariant are visible from this entrypoint. */
export type { SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Err are visible from this entrypoint. */
export type { Err } from "../core/result.js";
/** Re-exported so public signatures that reference Ok are visible from this entrypoint. */
export type { Ok } from "../core/result.js";
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
export type { Result } from "../core/result.js";
/** Re-exported so public signatures that reference ResultMatcher are visible from this entrypoint. */
export type { ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference SchemaError are visible from this entrypoint. */
export type { SchemaError } from "../data/schema.js";
/** Re-exported so public signatures that reference SchemaType are visible from this entrypoint. */
export type { SchemaType } from "../data/schema.js";
/** Re-exported so public signatures that reference ErrType are visible from this entrypoint. */
export type { ErrType } from "../types/error.js";
/** Re-exported so public signatures that reference ErrTypeConstructor are visible from this entrypoint. */
export type { ErrTypeConstructor } from "../types/error.js";

/** Typed environment variable validation and access. */
export { Config } from "./config.js";
/** Structured logger with configurable levels and formatters. */
export { Logger } from "./logger.js";
/** Configuration options for creating a Logger. */
export type { LoggerOptions } from "./logger.js";
/** Log severity levels, ordered from least to most severe. */
export type { LogLevel } from "./logger.js";
/** A structured log record passed to log sinks. */
export type { LogRecord } from "./logger.js";
/** A log sink function that receives formatted log entries. */
export type { LogSink } from "./logger.js";
/** Cross-runtime OS information (hostname, arch, memory). */
export { Os } from "./os.js";
/** Line ending constants and normalization. */
export { Eol } from "./platform.js";
/** OS-aware path manipulation without node:path dependency. */
export { Path } from "./platform.js";
/** Parsed path components (root, dir, base, ext, name). */
export type { PathParts } from "./platform.js";
/** Runtime platform detection (isWindows, isPosix). */
export { Platform } from "./platform.js";
/** Heap and RSS memory usage information. */
export type { MemoryUsage } from "./process.js";
/** Cross-runtime process info, cwd, env, args, and exit namespace. */
export { Process } from "./process.js";
/** Error returned when a process operation fails. */
export { ProcessError } from "./process.js";
