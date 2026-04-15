/**
 * @module error
 *
 * Structured, immutable error constructors for domain modelling.
 *
 * **Why ErrType instead of plain Error subclasses?**
 * `Error` subclasses are mutable, lack a machine-readable discriminant, and
 * encourage `instanceof` checks that break across realms. `ErrType` produces
 * frozen value objects with a literal `tag` discriminant, making them safe for
 * `switch`/`match` exhaustiveness checks and serialization. They compose
 * naturally with `Result<T, E>` via `.toResult()`.
 *
 * **How the factory/type merge works:**
 * `ErrType` is both a type (`ErrType<'NotFound', 'NOT_FOUND'>` describes an
 * instance) and a value (`ErrType('NotFound')` returns a callable constructor).
 * TypeScript's const/type merge makes this seamless. The constructor auto-derives
 * a SCREAMING_SNAKE code from the PascalCase tag unless overridden.
 */

import type { Result } from "../core/result.js";
import { Err } from "../core/result.js";
import { deepFreezeRaw } from "../data/internals.js";

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Global symbol brand for ErrType instances.
 *
 * Uses `Symbol.for` so the brand is shared across realms (e.g. when the
 * library is duplicated in node_modules). This makes `.is()` guards reliable
 * even when multiple copies of pure-ts are loaded.
 */
const ERR_TYPE_BRAND = Symbol.for("pure-ts/ErrType");

/** Capture a stack trace, stripping library frames where V8 is available. */
const captureStack = (): string | undefined => {
  const holder: { stack?: string | undefined } = {};
  if (typeof Error.captureStackTrace === "function") {
    Error.captureStackTrace(holder, captureStack);
  } else {
    holder.stack = new Error().stack;
  }
  return holder.stack;
};

/** Convert PascalCase to SCREAMING_SNAKE_CASE at runtime. */
const pascalToScreamingSnake = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();

/** Structural check for any ErrType instance. */
const isErrType = (value: unknown): value is ErrType<string, string> => {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["tag"] === "string" &&
    typeof v["code"] === "string" &&
    typeof v["message"] === "string" &&
    typeof v["metadata"] === "object" &&
    v["metadata"] !== null &&
    typeof v["timestamp"] === "number"
  );
};

// ── Instance interface ───────────────────────────────────────────────────────

/**
 * A structured, immutable error value.
 *
 * Created by calling an {@link ErrTypeConstructor}. Every instance is
 * deeply frozen: mutations throw `TypeError`. Use `.tag` as the discriminant
 * in `switch`/`match` for exhaustive handling.
 *
 * @example
 * ```ts
 * const err: ErrType<'NotFound', 'NOT_FOUND'> = NotFound('User not found');
 * err.tag;      // 'NotFound'
 * err.code;     // 'NOT_FOUND'
 * err.message;  // 'User not found'
 * ```
 */
interface ErrTypeInstance<Tag extends string, Code extends string> {
  /** Brand symbol for cross-realm identification. */
  readonly [ERR_TYPE_BRAND]: true;
  /** The literal tag discriminant for this error type. */
  readonly tag: Tag;
  /** Alias for tag, matching Error.name convention. */
  readonly name: Tag;
  /** The SCREAMING_SNAKE code for this error type. */
  readonly code: Code;
  /** Human-readable error message. */
  readonly message: string;
  /** Additional key-value metadata attached to this error. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Optional underlying cause of this error. */
  readonly cause: unknown | undefined;
  /** Unix timestamp (ms) when this error was created. */
  readonly timestamp: number;
  /** Stack trace captured at construction time, if available. */
  readonly stack: string | undefined;

  /** Wrap this error in `Err(this)` to create a `Result`. */
  toResult<T>(): Result<T, ErrType<Tag, Code>>;

  /** Serialize all fields except `stack`. Includes `cause` only if defined. */
  toJSON(): {
    /** The tag discriminant. */
    readonly tag: Tag;
    /** Alias for tag. */
    readonly name: Tag;
    /** The error code. */
    readonly code: Code;
    /** The error message. */
    readonly message: string;
    /** Attached metadata. */
    readonly metadata: Readonly<Record<string, unknown>>;
    /** Creation timestamp in milliseconds. */
    readonly timestamp: number;
    /** Underlying cause, if present. */
    readonly cause?: unknown;
  };

  /** Format as `'Tag(CODE): message'`. Appends cause if present. */
  toString(): string;
}

// ── Implementation class ─────────────────────────────────────────────────────

/**
 * Internal implementation of ErrType instances.
 *
 * Not exported: callers use the `ErrType()` factory which returns
 * `ErrTypeConstructor`. Instances are frozen in the constructor so
 * no property can be mutated after creation.
 */
class ErrTypeImpl<Tag extends string, Code extends string> implements ErrTypeInstance<Tag, Code> {
  readonly [ERR_TYPE_BRAND]: true;
  readonly tag: Tag;
  readonly name: Tag;
  readonly code: Code;
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly cause: unknown | undefined;
  readonly timestamp: number;
  readonly stack: string | undefined;

  constructor(
    tag: Tag,
    code: Code,
    message: string,
    metadata: Record<string, unknown>,
    cause: unknown | undefined,
    stack: string | undefined,
  ) {
    this[ERR_TYPE_BRAND] = true;
    this.tag = tag;
    this.name = tag;
    this.code = code;
    this.message = message;
    this.metadata = metadata;
    this.cause = cause;
    this.timestamp = Date.now();
    this.stack = stack;
    deepFreezeRaw(metadata);
    Object.freeze(this);
  }

  toResult<T>(): Result<T, ErrType<Tag, Code>> {
    return Err(this);
  }

  toJSON(): {
    readonly tag: Tag;
    readonly name: Tag;
    readonly code: Code;
    readonly message: string;
    readonly metadata: Readonly<Record<string, unknown>>;
    readonly timestamp: number;
    readonly cause?: unknown;
  } {
    const base = {
      tag: this.tag,
      name: this.name,
      code: this.code,
      message: this.message,
      metadata: this.metadata,
      timestamp: this.timestamp,
    } as {
      tag: Tag;
      name: Tag;
      code: Code;
      message: string;
      metadata: Readonly<Record<string, unknown>>;
      timestamp: number;
      cause?: unknown;
    };
    if (this.cause !== undefined) {
      if (
        isErrType(this.cause) &&
        typeof (this.cause as unknown as Record<string, unknown>)["toJSON"] === "function"
      ) {
        base.cause = (this.cause as ErrTypeInstance<string, string>).toJSON();
      } else if (this.cause instanceof Error) {
        base.cause = { name: this.cause.name, message: this.cause.message };
      } else {
        base.cause = this.cause;
      }
    }
    return base;
  }

  toString(): string {
    const base = `${this.tag}(${this.code}): ${this.message}`;
    if (this.cause !== undefined) {
      return `${base} [caused by: ${this.cause}]`;
    }
    return base;
  }
}

// ── Constructor type ─────────────────────────────────────────────────────────

/**
 * A callable constructor returned by {@link ErrType}.
 *
 * Call it with `(message, metadata?)` to create a frozen {@link ErrType} instance.
 * Also exposes `.tag`, `.code`, and `.is()` for introspection and narrowing.
 *
 * @example
 * ```ts
 * const NotFound = ErrType('NotFound');
 * NotFound.tag;            // 'NotFound'
 * NotFound.code;           // 'NOT_FOUND'
 * NotFound.is(someError);  // type guard
 * ```
 */
export interface ErrTypeConstructor<Tag extends string, Code extends string> {
  /** Create a new frozen error instance. */
  (
    message: string,
    options?: Record<string, unknown> | { metadata?: Record<string, unknown>; cause?: unknown },
  ): ErrType<Tag, Code>;

  /** The tag literal for this error type. */
  readonly tag: Tag;

  /** The code literal for this error type. */
  readonly code: Code;

  /** Type guard: narrows `value` to `ErrType<Tag, Code>`. */
  is(value: unknown): value is ErrType<Tag, Code>;
}

// ── Public type (merges with const in value position) ────────────────────────

/**
 * A structured, immutable error value with a `tag` discriminant.
 *
 * In type position, `ErrType<Tag, Code>` describes an error instance.
 * In value position, `ErrType(tag, code?)` is the factory that creates
 * {@link ErrTypeConstructor} callables.
 *
 * @example
 * ```ts
 * // Value position: factory
 * const NotFound = ErrType('NotFound');
 *
 * // Type position: instance type
 * type AppError = ErrType<'NotFound', 'NOT_FOUND'> | ErrType<'Forbidden'>;
 * ```
 */
export interface ErrType<Tag extends string, Code extends string = string> {
  /** The literal tag discriminant for this error type. */
  readonly tag: Tag;
  /** Alias for tag, matching Error.name convention. */
  readonly name: Tag;
  /** The SCREAMING_SNAKE code for this error type. */
  readonly code: Code;
  /** Human-readable error message. */
  readonly message: string;
  /** Additional key-value metadata attached to this error. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Optional underlying cause of this error. */
  readonly cause: unknown | undefined;
  /** Unix timestamp (ms) when this error was created. */
  readonly timestamp: number;
  /** Stack trace captured at construction time, if available. */
  readonly stack: string | undefined;

  /** Wrap this error in `Err(this)` to create a `Result`. */
  toResult<T>(): Result<T, ErrType<Tag, Code>>;

  /** Serialize all fields except `stack`. Includes `cause` only if defined. */
  toJSON(): {
    /** The tag discriminant. */
    readonly tag: Tag;
    /** Alias for tag. */
    readonly name: Tag;
    /** The error code. */
    readonly code: Code;
    /** The error message. */
    readonly message: string;
    /** Attached metadata. */
    readonly metadata: Readonly<Record<string, unknown>>;
    /** Creation timestamp in milliseconds. */
    readonly timestamp: number;
    /** Underlying cause, if present. */
    readonly cause?: unknown;
  };

  /** Format as `'Tag(CODE): message'`. Appends cause if present. */
  toString(): string;
}

// ── Factory + namespace (const merges with type above) ───────────────────────

/**
 * Define a reusable error kind with a fixed `tag` and optional `code`.
 *
 * If `code` is omitted, it is auto-derived from the PascalCase `tag`
 * as SCREAMING_SNAKE_CASE (e.g. `'NotFound'` -> `'NOT_FOUND'`).
 *
 * Returns a callable {@link ErrTypeConstructor} that produces frozen,
 * immutable {@link ErrType} instances. These compose naturally with
 * `Result<T, E>` and support discriminated union narrowing via `tag`.
 *
 * @example
 * ```ts
 * const NotFound = ErrType('NotFound');           // code: 'NOT_FOUND'
 * const Forbidden = ErrType('Forbidden');         // code: 'FORBIDDEN'
 * const DbError = ErrType('DbError', 'DB_ERR');  // explicit code
 *
 * type AppError =
 *   | ErrType<'NotFound', 'NOT_FOUND'>
 *   | ErrType<'Forbidden'>;
 * ```
 */
export const ErrType: {
  /** Define an error kind with auto-derived SCREAMING_SNAKE code. */
  <Tag extends string>(tag: Tag): ErrTypeConstructor<Tag, string>;
  /** Define an error kind with an explicit code. */
  <Tag extends string, Code extends string>(tag: Tag, code: Code): ErrTypeConstructor<Tag, Code>;
  /** Type guard: check whether `value` is any {@link ErrType} instance. */
  is(value: unknown): value is ErrType<string, string>;
} = Object.assign(
  <Tag extends string, Code extends string>(
    tag: Tag,
    code?: Code,
  ): ErrTypeConstructor<Tag, Code> => {
    const resolvedCode = (code ?? pascalToScreamingSnake(tag)) as Code;

    const ctor = (
      message: string,
      optionsOrMetadata?: Record<string, unknown>,
    ): ErrType<Tag, Code> => {
      let metadata: Record<string, unknown>;
      let cause: unknown | undefined;
      if (optionsOrMetadata !== undefined && "cause" in optionsOrMetadata) {
        // Options-style: { metadata?, cause? }
        const opts = optionsOrMetadata as { metadata?: Record<string, unknown>; cause?: unknown };
        metadata = opts.metadata ?? {};
        cause = opts.cause;
      } else {
        // Backward-compatible: treat entire argument as metadata
        metadata = optionsOrMetadata ?? {};
        cause = undefined;
      }
      return new ErrTypeImpl(tag, resolvedCode, message, metadata, cause, captureStack());
    };

    return Object.assign(ctor, {
      tag,
      code: resolvedCode,
      is(value: unknown): value is ErrType<Tag, Code> {
        return isErrType(value) && value.tag === tag && value.code === resolvedCode;
      },
    } as const);
  },
  {
    is: isErrType,
  },
);
