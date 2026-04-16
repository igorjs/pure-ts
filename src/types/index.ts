/**
 * @module types
 *
 * Structured errors, nominal types, and time primitives.
 *
 * ErrType, Type (nominal branding), Duration, Cron.
 *
 * @example
 * ```ts
 * import { ErrType, Duration } from '@igorjs/pure-ts/types'
 *
 * const NotFound = ErrType('NotFound');
 * const timeout = Duration.seconds(30);
 * ```
 */

// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Eq are visible from this entrypoint. */
export type { Eq } from "../core/eq.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { Option } from "../core/option.js";
/** Re-exported so public signatures that reference OptionMatcher are visible from this entrypoint. */
export type { OptionMatcher } from "../core/option.js";
/** Re-exported so public signatures that reference SomeVariant are visible from this entrypoint. */
export type { SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Ord are visible from this entrypoint. */
export type { Ord } from "../core/ord.js";
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

/** Cron expression parser and validator namespace. */
export { Cron } from "./cron.js";
/** A validated cron expression string (5-field standard format). */
export type { CronExpression } from "./cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./duration.js";
/** Structured error type constructor with tag-based discrimination. */
export { ErrType } from "./error.js";
/** Callable constructor that creates tagged, immutable error instances. */
export type { ErrTypeConstructor } from "./error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./nominal.js";
