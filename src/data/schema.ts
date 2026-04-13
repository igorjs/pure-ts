/**
 * @module schema
 *
 * Composable validation schemas that parse `unknown` into typed values.
 *
 * **Why decouple Schema from Record?**
 * Schema validates untrusted input (API boundaries, JSON, user forms).
 * Record enforces immutability on trusted data. Coupling them would force
 * every validated value into a Record, even when a plain object suffices.
 * Keeping them separate lets callers choose: `Schema.parse(input)` returns
 * a plain `Result<T, SchemaError>`, and wrapping in `Record()` is opt-in.
 *
 * **How composition works:**
 * Each `SchemaType<T>` wraps a `parse: (input: unknown) => Result<T, SchemaError>`
 * function. Combinators (`.refine()`, `.transform()`, `.optional()`, `.default()`)
 * return new schemas that chain the inner parse, keeping schemas immutable
 * and composable. Object/array/tuple schemas validate recursively, prepending
 * field names to the error path for precise diagnostics.
 */

import type { Result } from "../core/result.js";
import { castErr, Err, Ok } from "../core/result.js";

/**
 * Describes a validation error at a specific path.
 *
 * @example
 * ```ts
 * // { path: ['user', 'age'], expected: 'number', received: 'string' }
 * ```
 */
export interface SchemaError {
  readonly path: readonly string[];
  readonly expected: string;
  readonly received: string;
}

/** Shorthand to create a typed schema error Result. */
const schemaErr = (
  path: readonly string[],
  expected: string,
  received: unknown,
): Result<never, SchemaError> => Err({ path, expected, received: typeof received });

/**
 * A composable validation schema that parses unknown input into type `T`.
 *
 * Schemas are pure validators: they accept unknown input and return
 * `Result<T, SchemaError>`. Compose via `.refine()`, `.transform()`,
 * `.optional()`, and `.default()`.
 *
 * To get an immutable record from validated data, wrap explicitly:
 * ```ts
 * const user = Record(UserSchema.parse(input).unwrap());
 * ```
 *
 * @example
 * ```ts
 * const UserSchema = Schema.object({
 *   name: Schema.string,
 *   age: Schema.number.refine(n => n > 0, 'positive'),
 * });
 *
 * const result = UserSchema.parse(input); // Result<User, SchemaError>
 * ```
 */
export interface SchemaType<T> {
  /** Validate unknown input and return the parsed value on success. */
  readonly parse: (input: unknown) => Result<T, SchemaError>;
  /** Type guard: returns `true` if `input` parses successfully. */
  readonly is: (input: unknown) => input is T;
  /** Add a validation predicate with a descriptive `label` for error messages. */
  readonly refine: (predicate: (v: T) => boolean, label: string) => SchemaType<T>;
  /** Transform the parsed value into a different type. */
  readonly transform: <U>(fn: (v: T) => U) => SchemaType<U>;
  /** Make this schema accept `undefined` as valid input. */
  readonly optional: () => SchemaType<T | undefined>;
  /** Provide a fallback value for `undefined` or `null` input. */
  readonly default: (fallback: T) => SchemaType<T>;
}

/**
 * Internal schema factory: wraps a parse function with combinators.
 *
 * Every public schema (`Schema.string`, `Schema.object(...)`, etc.) is built
 * through this factory. The combinators (`.refine()`, `.transform()`, etc.)
 * return new schemas by wrapping the original parse function, keeping all
 * schemas immutable and composable.
 */
const createSchema = <T>(rawParse: (input: unknown) => Result<T, SchemaError>): SchemaType<T> => ({
  parse: rawParse,
  is: (input): input is T => rawParse(input).isOk,
  refine: (predicate, label) =>
    createSchema(input => {
      const r = rawParse(input);
      if (r.isErr) return r;
      return predicate(r.value) ? r : schemaErr([], label, input);
    }),
  transform: <U>(fn: (v: T) => U) =>
    createSchema<U>(input => {
      const r = rawParse(input);
      if (r.isErr) return castErr(r);
      return Ok(fn(r.value));
    }),
  optional: () =>
    createSchema<T | undefined>(input => (input === undefined ? Ok(undefined) : rawParse(input))),
  default: (fallback: T) =>
    createSchema<T>(input =>
      input === undefined || input === null ? Ok(fallback) : rawParse(input),
    ),
});

const stringSchema: SchemaType<string> = createSchema<string>(i =>
  typeof i === "string" ? Ok(i) : schemaErr([], "string", i),
);
const numberSchema: SchemaType<number> = createSchema<number>(i =>
  typeof i === "number" && !Number.isNaN(i) ? Ok(i) : schemaErr([], "number", i),
);
const booleanSchema: SchemaType<boolean> = createSchema<boolean>(i =>
  typeof i === "boolean" ? Ok(i) : schemaErr([], "boolean", i),
);

/** Prepend a field name to the error path for nested validation diagnostics. */
const prependPath = (e: SchemaError, key: string): SchemaError => ({
  ...e,
  path: [key, ...e.path],
});

const objectSchema = <T extends Record<string, SchemaType<any>>>(
  shape: T,
): SchemaType<{ [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never }> =>
  createSchema(input => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return schemaErr([], "object", input);
    }
    const result: Record<string, unknown> = {};
    const keys = Object.keys(shape);
    for (const key of keys) {
      const fieldSchema = (shape as Record<string, SchemaType<any>>)[key]!;
      const r = fieldSchema.parse((input as Record<string, unknown>)[key]);
      if (r.isErr) return Err(prependPath(r.error, key));
      result[key] = r.value;
    }
    // Why: result is Record<string, unknown> built from validated fields.
    // TS can't prove the dynamic keys match the mapped type { [K in keyof T]: ... }.
    // Safe because we iterated Object.keys(shape) and validated each field.
    return Ok(result) as unknown as Result<
      { [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  });

const arraySchema = <T>(element: SchemaType<T>): SchemaType<readonly T[]> =>
  createSchema(input => {
    if (!Array.isArray(input)) return schemaErr([], "array", input);
    const results: T[] = [];
    for (let i = 0; i < input.length; i++) {
      const r = element.parse(input[i]);
      if (r.isErr) return Err(prependPath(r.error, String(i)));
      results.push(r.value);
    }
    return Ok(results as readonly T[]);
  });

const tupleSchema = <T extends readonly SchemaType<any>[]>(
  ...schemas: T
): SchemaType<{ readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never }> =>
  createSchema(input => {
    if (!Array.isArray(input)) return schemaErr([], "tuple", input);
    if (input.length !== schemas.length) {
      return schemaErr([], `tuple(${schemas.length})`, `array(${input.length})`);
    }
    const results: unknown[] = [];
    for (let i = 0; i < schemas.length; i++) {
      const r = schemas[i]!.parse(input[i]);
      if (r.isErr) return Err(prependPath(r.error, String(i)));
      results.push(r.value);
    }
    // Why: results is unknown[] built from positional validation.
    // TS can't prove the dynamic array matches the mapped tuple type.
    // Safe because we validated each position against its schema.
    return Ok(results) as unknown as Result<
      { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  });

const recordValuesSchema = <V>(value: SchemaType<V>): SchemaType<Readonly<Record<string, V>>> =>
  createSchema(input => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      return schemaErr([], "record", input);
    }
    const result: Record<string, unknown> = {};
    const keys = Object.keys(input);
    for (const key of keys) {
      const r = value.parse((input as Record<string, unknown>)[key]);
      if (r.isErr) return Err(prependPath(r.error, key));
      result[key] = r.value;
    }
    return Ok(result as Readonly<Record<string, V>>);
  });

const literalSchema = <const T extends string | number | boolean>(value: T): SchemaType<T> =>
  createSchema(i => (i === value ? Ok(value) : schemaErr([], `literal(${String(value)})`, i)));

const enumSchema = <const T extends readonly (string | number | boolean)[]>(
  values: T,
): SchemaType<T[number]> =>
  createSchema(i => {
    for (const v of values) {
      if (i === v) {
        return Ok(v as T[number]);
      }
    }
    return schemaErr([], `enum(${values.map(String).join(" | ")})`, i);
  });

const unionSchema = <T extends readonly SchemaType<any>[]>(
  ...schemas: T
): SchemaType<T[number] extends SchemaType<infer U> ? U : never> =>
  createSchema(input => {
    for (const s of schemas) {
      const r = s.parse(input);
      if (r.isOk) {
        // Why: r is Result<any, SchemaError> from one of the union schemas.
        // TS can't prove which union member matched, so it can't narrow to
        // the inferred union type. Safe because parse succeeded on one branch.
        return r as unknown as Result<
          T[number] extends SchemaType<infer U> ? U : never,
          SchemaError
        >;
      }
    }
    return schemaErr([], `union(${schemas.length})`, input);
  });

/**
 * Schema namespace: composable validation primitives.
 *
 * Each schema validates unknown input and returns `Result<T, SchemaError>`.
 * Compose with `.refine()`, `.transform()`, `.optional()`, and `.default()`.
 *
 * @example
 * ```ts
 * const UserSchema = Schema.object({
 *   name: Schema.string,
 *   age: Schema.number,
 *   tags: Schema.array(Schema.string),
 * });
 *
 * type User = Schema.Infer<typeof UserSchema>;
 * ```
 */
export const Schema: {
  readonly string: SchemaType<string>;
  readonly number: SchemaType<number>;
  readonly boolean: SchemaType<boolean>;
  readonly object: <T extends Record<string, SchemaType<any>>>(
    shape: T,
  ) => SchemaType<{ [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never }>;
  readonly array: <T>(element: SchemaType<T>) => SchemaType<readonly T[]>;
  readonly tuple: <T extends readonly SchemaType<any>[]>(
    ...schemas: T
  ) => SchemaType<{
    readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never;
  }>;
  readonly record: <V>(value: SchemaType<V>) => SchemaType<Readonly<Record<string, V>>>;
  readonly literal: <const T extends string | number | boolean>(value: T) => SchemaType<T>;
  readonly union: <T extends readonly SchemaType<any>[]>(
    ...schemas: T
  ) => SchemaType<T[number] extends SchemaType<infer U> ? U : never>;
  readonly discriminatedUnion: <D extends string, M extends Record<string, SchemaType<any>>>(
    discriminant: D,
    mapping: M,
  ) => SchemaType<M[keyof M] extends SchemaType<infer U> ? U : never>;
  readonly lazy: <T>(factory: () => SchemaType<T>) => SchemaType<T>;
  readonly intersection: <A, B>(a: SchemaType<A>, b: SchemaType<B>) => SchemaType<A & B>;
  readonly regex: (pattern: RegExp, label?: string) => SchemaType<string>;
  readonly nonEmpty: SchemaType<string>;
  readonly minLength: (n: number) => SchemaType<string>;
  readonly maxLength: (n: number) => SchemaType<string>;
  readonly email: SchemaType<string>;
  readonly url: SchemaType<string>;
  readonly uuid: SchemaType<string>;
  readonly isoDate: SchemaType<string>;
  readonly date: SchemaType<Date>;
  readonly enum: <const T extends readonly (string | number | boolean)[]>(
    values: T,
  ) => SchemaType<T[number]>;
  readonly int: SchemaType<number>;
  readonly min: (n: number) => SchemaType<number>;
  readonly max: (n: number) => SchemaType<number>;
  readonly range: (lo: number, hi: number) => SchemaType<number>;
  readonly positive: SchemaType<number>;
  readonly nonNegative: SchemaType<number>;
} = {
  /** Validates that input is a `string`. */
  string: stringSchema,
  /** Validates that input is a `number` (rejects `NaN`). */
  number: numberSchema,
  /** Validates that input is a `boolean`. */
  boolean: booleanSchema,
  /** Validates an object against a shape of field schemas. */
  object: objectSchema,
  /** Validates an array where every element matches the given schema. */
  array: arraySchema,
  /** Validates a fixed-length tuple with per-position schemas. */
  tuple: tupleSchema,
  /** Validates a string-keyed record where every value matches the given schema. */
  record: recordValuesSchema,
  /** Validates that input is exactly the given literal value. */
  literal: literalSchema,
  /** Validates that input matches at least one of the given schemas. */
  union: unionSchema,

  /**
   * Validates a tagged union using a discriminant field.
   *
   * More efficient than `union()` because it reads the discriminant first,
   * then validates only the matching branch. Produces better error messages.
   *
   * @example
   * ```ts
   * const Shape = Schema.discriminatedUnion('type', {
   *   circle: Schema.object({ type: Schema.literal('circle'), radius: Schema.number }),
   *   rect: Schema.object({ type: Schema.literal('rect'), width: Schema.number, height: Schema.number }),
   * });
   * ```
   */
  discriminatedUnion: <D extends string, M extends Record<string, SchemaType<any>>>(
    discriminant: D,
    mapping: M,
  ): SchemaType<M[keyof M] extends SchemaType<infer U> ? U : never> =>
    createSchema(input => {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return schemaErr([], "object with discriminant", input);
      }
      const tag = (input as Record<string, unknown>)[discriminant];
      if (typeof tag !== "string") {
        return schemaErr([discriminant], "string discriminant", tag);
      }
      const schema = (mapping as Record<string, SchemaType<any>>)[tag];
      if (schema === undefined) {
        const expected = Object.keys(mapping).join(" | ");
        return schemaErr([discriminant], expected, tag);
      }
      return schema.parse(input) as Result<
        M[keyof M] extends SchemaType<infer U> ? U : never,
        SchemaError
      >;
    }),

  /**
   * Deferred schema for recursive or circular data structures.
   *
   * The factory function is called lazily on first parse, allowing
   * schemas to reference themselves.
   *
   * @example
   * ```ts
   * type Tree = { value: number; children: readonly Tree[] };
   * const TreeSchema: SchemaType<Tree> = Schema.object({
   *   value: Schema.number,
   *   children: Schema.array(Schema.lazy(() => TreeSchema)),
   * });
   * ```
   */
  lazy: <T>(factory: () => SchemaType<T>): SchemaType<T> => {
    let cached: SchemaType<T> | null = null;
    const getSchema = (): SchemaType<T> => {
      if (cached === null) cached = factory();
      return cached;
    };
    return createSchema<T>(input => getSchema().parse(input));
  },

  /**
   * Validates that input matches all given schemas (intersection).
   *
   * Parses through each schema in order; all must succeed.
   * The result is the merged value from all schemas.
   *
   * @example
   * ```ts
   * const Named = Schema.object({ name: Schema.string });
   * const Aged = Schema.object({ age: Schema.number });
   * const Person = Schema.intersection(Named, Aged);
   * ```
   */
  intersection: <A, B>(a: SchemaType<A>, b: SchemaType<B>): SchemaType<A & B> =>
    createSchema<A & B>(input => {
      const ra = a.parse(input);
      if (ra.isErr) return castErr(ra);
      const rb = b.parse(input);
      if (rb.isErr) return castErr(rb);
      return Ok({ ...ra.value, ...rb.value } as A & B);
    }),
  // ── Common refinements ────────────────────────────────────────────────────

  /** String that matches the given regex. */
  regex: (pattern: RegExp, label?: string): SchemaType<string> =>
    stringSchema.refine(s => pattern.test(s), label ?? `regex(${pattern.source})`),

  /** Non-empty string (trims first). */
  nonEmpty: stringSchema.refine(s => s.trim().length > 0, "non-empty string"),

  /** String with a minimum length. */
  minLength: (n: number): SchemaType<string> =>
    stringSchema.refine(s => s.length >= n, `minLength(${n})`),

  /** String with a maximum length. */
  maxLength: (n: number): SchemaType<string> =>
    stringSchema.refine(s => s.length <= n, `maxLength(${n})`),

  /** Email address (simplified RFC 5322 pattern). */
  email: stringSchema.refine(s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "email"),

  /** URL (uses URL constructor for validation). */
  url: stringSchema.refine(s => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  }, "url"),

  /** UUID v4 format. */
  uuid: stringSchema.refine(
    s => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s),
    "uuid",
  ),

  /** ISO 8601 date string (validates via Date constructor). */
  isoDate: stringSchema.refine(s => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s.slice(0, 10));
  }, "ISO date"),

  /** Parses an ISO 8601 date string into a Date instance. Rejects invalid dates. */
  date: stringSchema
    .refine(s => {
      const d = new Date(s);
      return !Number.isNaN(d.getTime());
    }, "date string")
    .transform(s => new Date(s)),

  /** Validates that input is one of the given enum values. */
  enum: enumSchema,

  /** Integer (no decimal part). */
  int: numberSchema.refine(n => Number.isInteger(n), "integer"),

  /** Number with a minimum value (inclusive). */
  min: (n: number): SchemaType<number> => numberSchema.refine(v => v >= n, `min(${n})`),

  /** Number with a maximum value (inclusive). */
  max: (n: number): SchemaType<number> => numberSchema.refine(v => v <= n, `max(${n})`),

  /** Number within a range (inclusive). */
  range: (lo: number, hi: number): SchemaType<number> =>
    numberSchema.refine(v => v >= lo && v <= hi, `range(${lo}, ${hi})`),

  /** Positive number (> 0). */
  positive: numberSchema.refine(n => n > 0, "positive"),

  /** Non-negative number (>= 0). */
  nonNegative: numberSchema.refine(n => n >= 0, "non-negative"),
} as const;

export namespace Schema {
  /** Extract the TypeScript type that a schema validates to. */
  export type Infer<S> = S extends SchemaType<infer T> ? T : never;
}
