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

/** Algebraic data type constructor with exhaustive matching. */
export { ADT } from "./adt.js";
/** Bidirectional codec namespace for encoding and decoding values. */
export { Codec } from "./codec.js";
/** Interface describing a bidirectional codec that can decode and encode. */
export type { CodecType } from "./codec.js";
/** Check whether a value is an ImmutableRecord or ImmutableList. */
export { isImmutable } from "./constructors.js";
/** Create an immutable list from an array of items. */
export { List } from "./constructors.js";
/** Create an immutable record from a plain object. */
export { Record } from "./constructors.js";
/** Recursively marks all properties as readonly. */
export type { DeepReadonly } from "./internals.js";
/** An immutable array with functional query and update methods. */
export type { ImmutableList } from "./list.js";
/** Methods available on every ImmutableList instance. */
export type { ListMethods } from "./list.js";
/** Non-empty list guaranteeing at least one element at the type level. */
export { NonEmptyList } from "./non-empty-list.js";
/** An immutable object with type-safe structural update methods. */
export type { ImmutableRecord } from "./record.js";
/** Methods available on every ImmutableRecord instance. */
export type { RecordMethods } from "./record.js";
/** Runtime data validation namespace with composable schemas. */
export { Schema } from "./schema.js";
/** Describes a validation error at a specific path. */
export type { SchemaError } from "./schema.js";
/** Interface for a composable validation schema that parses unknown into T. */
export type { SchemaType } from "./schema.js";
/** Dense, index-stable collection with O(1) insert, remove, and access. */
export { StableVec } from "./stable-vec.js";
/** Opaque reference to an element in a StableVec. */
export type { Handle } from "./stable-vec.js";
