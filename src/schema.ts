// ═══════════════════════════════════════════════════════════════════════════════
// Schema System
// ═══════════════════════════════════════════════════════════════════════════════

import { isObjectLike } from './internals.js';
import { createRecord, type ImmutableRecord } from './record.js';
import type { Result } from './result.js';
import { Err, type ErrImpl, Ok } from './result.js';

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

const schemaErr = (
  path: readonly string[],
  expected: string,
  received: unknown,
): Result<never, SchemaError> => Err({ path, expected, received: typeof received });

/**
 * A composable validation schema that parses unknown input into type `T`.
 *
 * Schemas are immutable and compose via `.refine()`, `.transform()`,
 * `.optional()`, and `.default()`. The `.parse()` method returns an
 * `ImmutableRecord<T>` on success, while `._parseRaw()` returns the
 * unwrapped value.
 *
 * @example
 * ```ts
 * const UserSchema = Schema.object({
 *   name: Schema.string,
 *   age: Schema.number.refine(n => n > 0, 'positive'),
 * });
 *
 * const result = UserSchema.parse(input); // Result<ImmutableRecord<User>, SchemaError>
 * ```
 */
export interface SchemaType<T> {
  /** Parse and wrap the result in an ImmutableRecord (for objects) or Ok (for primitives). */
  readonly parse: (input: unknown) => Result<ImmutableRecord<T>, SchemaError>;
  /** Parse without wrapping in ImmutableRecord. Used internally for nested schemas. */
  readonly _parseRaw: (input: unknown) => Result<T, SchemaError>;
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

const createSchema = <T>(rawParse: (input: unknown) => Result<T, SchemaError>): SchemaType<T> => ({
  parse: input => {
    const r = rawParse(input);
    if (r.isErr) return r as unknown as Result<ImmutableRecord<T>, SchemaError>;
    const val = r.value;
    if (isObjectLike(val))
      return Ok(createRecord(val as object)) as unknown as Result<ImmutableRecord<T>, SchemaError>;
    return Ok(val) as unknown as Result<ImmutableRecord<T>, SchemaError>;
  },
  _parseRaw: rawParse,
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
      if (r.isErr) return r as unknown as Result<U, SchemaError>;
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
  typeof i === 'string' ? Ok(i) : schemaErr([], 'string', i),
);
const numberSchema: SchemaType<number> = createSchema<number>(i =>
  typeof i === 'number' && !Number.isNaN(i) ? Ok(i) : schemaErr([], 'number', i),
);
const booleanSchema: SchemaType<boolean> = createSchema<boolean>(i =>
  typeof i === 'boolean' ? Ok(i) : schemaErr([], 'boolean', i),
);

const prependPath = (e: SchemaError, key: string): SchemaError => ({
  ...e,
  path: [key, ...e.path],
});

const objectSchema = <T extends Record<string, SchemaType<any>>>(
  shape: T,
): SchemaType<{ [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never }> =>
  createSchema(input => {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      return schemaErr([], 'object', input);
    const result: Record<string, unknown> = {};
    const keys = Object.keys(shape);
    for (const key of keys) {
      const fieldSchema = (shape as Record<string, SchemaType<any>>)[key]!;
      const r = fieldSchema._parseRaw((input as Record<string, unknown>)[key]);
      if (r.isErr) return Err(prependPath((r as ErrImpl<unknown, SchemaError>).error, key));
      result[key] = r.value;
    }
    return Ok(result) as unknown as Result<
      { [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  });

const arraySchema = <T>(element: SchemaType<T>): SchemaType<readonly T[]> =>
  createSchema(input => {
    if (!Array.isArray(input)) return schemaErr([], 'array', input);
    const results: T[] = [];
    for (let i = 0; i < input.length; i++) {
      const r = element._parseRaw(input[i]);
      if (r.isErr) return Err(prependPath((r as ErrImpl<unknown, SchemaError>).error, String(i)));
      results.push(r.value);
    }
    return Ok(results as readonly T[]);
  });

const tupleSchema = <T extends readonly SchemaType<any>[]>(
  ...schemas: T
): SchemaType<{ readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never }> =>
  createSchema(input => {
    if (!Array.isArray(input)) return schemaErr([], 'tuple', input);
    if (input.length !== schemas.length)
      return schemaErr([], `tuple(${schemas.length})`, `array(${input.length})`);
    const results: unknown[] = [];
    for (let i = 0; i < schemas.length; i++) {
      const r = schemas[i]!._parseRaw(input[i]);
      if (r.isErr) return Err(prependPath((r as ErrImpl<unknown, SchemaError>).error, String(i)));
      results.push(r.value);
    }
    return Ok(results) as unknown as Result<
      { readonly [K in keyof T]: T[K] extends SchemaType<infer U> ? U : never },
      SchemaError
    >;
  });

const recordValuesSchema = <V>(value: SchemaType<V>): SchemaType<Readonly<Record<string, V>>> =>
  createSchema(input => {
    if (input === null || typeof input !== 'object' || Array.isArray(input))
      return schemaErr([], 'record', input);
    const result: Record<string, unknown> = {};
    const keys = Object.keys(input);
    for (const key of keys) {
      const r = value._parseRaw((input as Record<string, unknown>)[key]);
      if (r.isErr) return Err(prependPath((r as ErrImpl<unknown, SchemaError>).error, key));
      result[key] = r.value;
    }
    return Ok(result as Readonly<Record<string, V>>);
  });

const literalSchema = <const T extends string | number | boolean>(value: T): SchemaType<T> =>
  createSchema(i => (i === value ? Ok(value) : schemaErr([], `literal(${String(value)})`, i)));

const unionSchema = <T extends readonly SchemaType<any>[]>(
  ...schemas: T
): SchemaType<T[number] extends SchemaType<infer U> ? U : never> =>
  createSchema(input => {
    for (const s of schemas) {
      const r = s._parseRaw(input);
      if (r.isOk)
        return r as unknown as Result<
          T[number] extends SchemaType<infer U> ? U : never,
          SchemaError
        >;
    }
    return schemaErr([], `union(${schemas.length})`, input);
  });

/**
 * Schema namespace: composable validation primitives.
 *
 * Each schema validates unknown input and returns `Result<ImmutableRecord<T>, SchemaError>`.
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
export const Schema = {
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
} as const;

export namespace Schema {
  /** Extract the TypeScript type that a schema validates to. */
  export type Infer<S> = S extends SchemaType<infer T> ? T : never;
}
