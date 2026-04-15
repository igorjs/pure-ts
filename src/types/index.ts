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
/** Cron expression parser and validator namespace. */
/** A validated cron expression string (5-field standard format). */

/** Re-exported so public signatures that reference Eq are visible from this entrypoint. */
export type { Eq } from "../core/eq.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant, Option, OptionMatcher, SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Ord are visible from this entrypoint. */
export type { Ord } from "../core/ord.js";
// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
/** Re-exported so public signatures that reference Ok / Err are visible from this entrypoint. */
export type { Err, Ok, Result, ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference SchemaError are visible from this entrypoint. */
export type { SchemaError } from "../data/schema.js";
export { Cron, type CronExpression } from "./cron.js";
/** Type-safe duration namespace with unit conversions. */
export { Duration } from "./duration.js";
/** Structured error type constructor with tag-based discrimination. */
/** Callable constructor that creates tagged, immutable error instances. */
export { ErrType, type ErrTypeConstructor } from "./error.js";
/** Phantom-branded nominal type for compile-time domain safety. */
export type { Type } from "./nominal.js";
