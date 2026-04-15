/**
 * @module data
 *
 * Immutable data structures, validation, encoding, and algebraic data types.
 *
 * Record, List, NonEmptyList, Schema, Codec, and ADT.
 *
 * @example
 * ```ts
 * import { Schema, Record, ADT } from '@igorjs/pure-ts/data'
 *
 * const UserSchema = Schema.object({ name: Schema.string, age: Schema.number });
 * const user = Record({ name: 'Alice', age: 30 });
 * ```
 */
/** Algebraic data type constructor with exhaustive matching. */

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
export { ADT } from "./adt.js";
/** Bidirectional codec namespace for encoding and decoding values. */
/** Interface describing a bidirectional codec that can decode and encode. */
export { Codec, type CodecType } from "./codec.js";
/** Check whether a value is an ImmutableRecord or ImmutableList. */
/** Create an immutable list from an array of items. */
/** Create an immutable record from a plain object. */
export { isImmutable, List, Record } from "./constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./internals.js";
/** An immutable array with functional query and update methods. */
/** Methods available on every ImmutableList instance. */
export type { ImmutableList, ListMethods } from "./list.js";
/** Non-empty list guaranteeing at least one element at the type level. */
export { NonEmptyList } from "./non-empty-list.js";
/** An immutable object with type-safe structural update methods. */
/** Methods available on every ImmutableRecord instance. */
export type { ImmutableRecord, RecordMethods } from "./record.js";
/** Runtime data validation namespace with composable schemas. */
/** Describes a validation error at a specific path. */
/** Interface for a composable validation schema that parses unknown into T. */
export { Schema, type SchemaError, type SchemaType } from "./schema.js";
/** Dense, index-stable collection with O(1) insert, remove, and access. */
/** Opaque reference to an element in a StableVec. */
export { type Handle, StableVec } from "./stable-vec.js";
