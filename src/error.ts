// ═══════════════════════════════════════════════════════════════════════════════
// TaggedError
// ═══════════════════════════════════════════════════════════════════════════════

import type { Result } from './result.js';
import { Err } from './result.js';
import { deepFreezeRaw } from './internals.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

const TAGGED_ERROR_BRAND = Symbol.for('pure-ts/TaggedError');

/** Capture a stack trace, stripping library frames where V8 is available. */
const captureStack = (): string | undefined => {
  const holder: { stack?: string | undefined } = {};
  if (typeof Error.captureStackTrace === 'function') {
    Error.captureStackTrace(holder, captureStack);
  } else {
    holder.stack = new Error().stack;
  }
  return holder.stack;
};

// ── Instance type ────────────────────────────────────────────────────────────

/**
 * A structured, immutable error value.
 *
 * Created by calling a {@link TaggedErrorConstructor}. Every instance is
 * deeply frozen: mutations throw `TypeError`. Use `.tag` as the discriminant
 * in `switch`/`match` for exhaustive handling.
 *
 * @example
 * ```ts
 * const err: TaggedErrorInstance<'NotFound', 'NOT_FOUND'> = NotFound('User not found');
 * err.tag;      // 'NotFound'
 * err.code;     // 'NOT_FOUND'
 * err.message;  // 'User not found'
 * ```
 */
export interface TaggedErrorInstance<Tag extends string, Code extends string> {
  readonly [TAGGED_ERROR_BRAND]: true;
  readonly tag: Tag;
  readonly name: Tag;
  readonly code: Code;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
  readonly stack: string | undefined;

  /** Wrap this error in `Err(this)` to create a `Result`. */
  toResult<T>(): Result<T, TaggedErrorInstance<Tag, Code>>;

  /** Serialise all fields except `stack`. */
  toJSON(): { readonly tag: Tag; readonly name: Tag; readonly code: Code; readonly message: string; readonly metadata: Readonly<Record<string, unknown>>; readonly timestamp: number };

  /** Format as `'Tag(CODE): message'`. */
  toString(): string;
}

// ── Implementation class ─────────────────────────────────────────────────────

class TaggedErrorImpl<Tag extends string, Code extends string> implements TaggedErrorInstance<Tag, Code> {
  readonly [TAGGED_ERROR_BRAND]: true;
  readonly tag: Tag;
  readonly name: Tag;
  readonly code: Code;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly timestamp: number;
  readonly stack: string | undefined;

  constructor(tag: Tag, code: Code, message: string, metadata: Record<string, unknown>, stack: string | undefined) {
    this[TAGGED_ERROR_BRAND] = true;
    this.tag = tag;
    this.name = tag;
    this.code = code;
    this.message = message;
    this.metadata = metadata;
    this.timestamp = Date.now();
    this.stack = stack;
    deepFreezeRaw(metadata);
    Object.freeze(this);
  }

  toResult<T>(): Result<T, TaggedErrorInstance<Tag, Code>> { return Err(this); }

  toJSON(): { readonly tag: Tag; readonly name: Tag; readonly code: Code; readonly message: string; readonly metadata: Readonly<Record<string, unknown>>; readonly timestamp: number } {
    return { tag: this.tag, name: this.name, code: this.code, message: this.message, metadata: this.metadata, timestamp: this.timestamp };
  }

  toString(): string { return `${this.tag}(${this.code}): ${this.message}`; }
}

// ── Constructor type ─────────────────────────────────────────────────────────

/**
 * A callable constructor returned by {@link TaggedError}.
 *
 * Call it with `(message, metadata?)` to create a frozen {@link TaggedErrorInstance}.
 * Also exposes `.tag`, `.code`, and `.is()` for introspection and narrowing.
 *
 * @example
 * ```ts
 * const NotFound = TaggedError('NotFound', 'NOT_FOUND');
 * NotFound.tag;            // 'NotFound'
 * NotFound.code;           // 'NOT_FOUND'
 * NotFound.is(someError);  // type guard
 * ```
 */
export interface TaggedErrorConstructor<Tag extends string, Code extends string> {
  /** Create a new frozen error instance. */
  (message: string, metadata?: Record<string, unknown>): TaggedErrorInstance<Tag, Code>;

  /** The tag literal for this error type. */
  readonly tag: Tag;

  /** The code literal for this error type. */
  readonly code: Code;

  /** Type guard: narrows `value` to `TaggedErrorInstance<Tag, Code>`. */
  is(value: unknown): value is TaggedErrorInstance<Tag, Code>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Define a reusable error type with a fixed `tag` and `code`.
 *
 * Returns a callable {@link TaggedErrorConstructor} that produces frozen,
 * immutable {@link TaggedErrorInstance} values. These compose naturally with
 * `Result<T, E>` and support discriminated union narrowing via `tag`.
 *
 * @example
 * ```ts
 * const NotFound = TaggedError('NotFound', 'NOT_FOUND');
 * const Forbidden = TaggedError('Forbidden', 'FORBIDDEN');
 *
 * const err = NotFound('User not found', { userId: 'u_123' });
 * const result = err.toResult<User>();
 *
 * type AppError =
 *   | TaggedErrorInstance<'NotFound', 'NOT_FOUND'>
 *   | TaggedErrorInstance<'Forbidden', 'FORBIDDEN'>;
 * ```
 */
export const TaggedError = <Tag extends string, Code extends string>(
  tag: Tag,
  code: Code,
): TaggedErrorConstructor<Tag, Code> => {
  const constructor = (message: string, metadata?: Record<string, unknown>): TaggedErrorInstance<Tag, Code> =>
    new TaggedErrorImpl(tag, code, message, metadata ?? {}, captureStack());

  return Object.assign(constructor, {
    tag,
    code,
    is(value: unknown): value is TaggedErrorInstance<Tag, Code> {
      return isTaggedError(value) && value.tag === tag && value.code === code;
    },
  } as const);
};

// ── Global type guard ────────────────────────────────────────────────────────

/**
 * Type guard: check whether `value` is any {@link TaggedErrorInstance}.
 *
 * Validates the structural shape: `tag` (string), `code` (string),
 * `message` (string), `metadata` (object), `timestamp` (number).
 *
 * @example
 * ```ts
 * if (isTaggedError(err)) {
 *   console.log(err.tag, err.code, err.message);
 * }
 * ```
 */
export const isTaggedError = (value: unknown): value is TaggedErrorInstance<string, string> => {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['tag'] === 'string' &&
    typeof v['code'] === 'string' &&
    typeof v['message'] === 'string' &&
    typeof v['metadata'] === 'object' && v['metadata'] !== null &&
    typeof v['timestamp'] === 'number'
  );
};
