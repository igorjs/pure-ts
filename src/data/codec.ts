/**
 * @module codec
 *
 * Bidirectional schemas: decode (unknown -> T) and encode (T -> unknown).
 *
 * **Why Codec in addition to Schema?**
 * Schema only decodes: it parses `unknown` into `T`. Codec adds the reverse
 * direction: encoding `T` back to `unknown` for serialisation (API responses,
 * storage, wire formats). A Codec is a Schema with an encode function,
 * keeping decode/encode paired so they cannot drift apart.
 *
 * **How composition works:**
 * `Codec.pipe(inner, outer)` chains: decode goes inner then outer,
 * encode goes outer then inner. This keeps the encode path the mirror
 * of the decode path.
 */

import type { Result } from "../core/result.js";
import { castErr, Err, Ok } from "../core/result.js";
import type { SchemaError, SchemaType } from "./schema.js";

// ── Codec interface ─────────────────────────────────────────────────────────

/**
 * A bidirectional schema that can both decode and encode values.
 *
 * @example
 * ```ts
 * const DateCodec = Codec.from(
 *   (input: unknown) => typeof input === 'string'
 *     ? Ok(new Date(input))
 *     : Err({ path: [], expected: 'ISO string', received: typeof input }),
 *   (date: Date) => date.toISOString(),
 * );
 *
 * DateCodec.decode('2024-01-01').unwrap(); // Date
 * DateCodec.encode(new Date());            // '2024-01-01T...'
 * ```
 */
export interface CodecType<I, O> {
  /** Parse input into the output type. */
  readonly decode: (input: I) => Result<O, SchemaError>;
  /** Serialise the output type back to the input form. */
  readonly encode: (output: O) => I;
  /** Extract the decode-only schema for places that only need validation. */
  readonly schema: SchemaType<O>;
  /** Chain this codec with another: decode goes this then other, encode reverses. */
  readonly pipe: <O2>(other: CodecType<O, O2>) => CodecType<I, O2>;
}

// ── Internal helpers ────────────────────────────────────────────────────────

const schemaErr = (
  path: readonly string[],
  expected: string,
  received: unknown,
): Result<never, SchemaError> => Err({ path, expected, received: typeof received });

/** Prepend a key to the error path. */
const prependPath = (e: SchemaError, key: string): SchemaError => ({
  ...e,
  path: [key, ...e.path],
});

/**
 * Create a minimal SchemaType from a decode function.
 * Only used internally to satisfy the `.schema` property.
 */
const toSchema = <O>(decode: (input: unknown) => Result<O, SchemaError>): SchemaType<O> => ({
  parse: decode,
  is: (input: unknown): input is O => decode(input).isOk,
  refine: (predicate, label) =>
    toSchema(input => {
      const r = decode(input);
      if (r.isErr) return r;
      return predicate(r.value) ? r : schemaErr([], label, input);
    }),
  transform: <U>(fn: (v: O) => U) =>
    toSchema<U>(input => {
      const r = decode(input);
      if (r.isErr) return castErr(r);
      return Ok(fn(r.value));
    }),
  optional: () =>
    toSchema<O | undefined>(input => (input === undefined ? Ok(undefined) : decode(input))),
  default: (fallback: O) =>
    toSchema<O>(input => (input === undefined || input === null ? Ok(fallback) : decode(input))),
});

/** Create a CodecType from decode and encode functions. */
const createCodec = <I, O>(
  decode: (input: I) => Result<O, SchemaError>,
  encode: (output: O) => I,
): CodecType<I, O> =>
  Object.freeze({
    decode,
    encode,
    schema: toSchema(decode as (input: unknown) => Result<O, SchemaError>),
    pipe: <O2>(other: CodecType<O, O2>): CodecType<I, O2> =>
      createCodec(
        (input: I) => {
          const r = decode(input);
          // Why: r is Result<O, SchemaError>, need Result<O2, SchemaError>.
          // Error type unchanged; only the Ok payload differs in the pipeline.
          if (r.isErr) return r as unknown as Result<O2, SchemaError>;
          return other.decode(r.value);
        },
        (o2: O2) => encode(other.encode(o2)),
      ),
  });

// ── Primitive codecs ────────────────────────────────────────────────────────

const stringCodec: CodecType<unknown, string> = createCodec<unknown, string>(
  i => (typeof i === "string" ? Ok(i) : schemaErr([], "string", i)),
  s => s,
);

const numberCodec: CodecType<unknown, number> = createCodec<unknown, number>(
  i => (typeof i === "number" && !Number.isNaN(i) ? Ok(i) : schemaErr([], "number", i)),
  n => n,
);

const booleanCodec: CodecType<unknown, boolean> = createCodec<unknown, boolean>(
  i => (typeof i === "boolean" ? Ok(i) : schemaErr([], "boolean", i)),
  b => b,
);

// ── Composite codecs ────────────────────────────────────────────────────────

type CodecShape = Record<string, CodecType<unknown, unknown>>;

type DecodedShape<T extends CodecShape> = {
  [K in keyof T]: T[K] extends CodecType<unknown, infer O> ? O : never;
};

const objectCodec = <T extends CodecShape>(shape: T): CodecType<unknown, DecodedShape<T>> => {
  const keys = Object.keys(shape);
  return createCodec<unknown, DecodedShape<T>>(
    (input: unknown) => {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return schemaErr([], "object", input);
      }
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const codec = shape[key]!;
        const r = codec.decode((input as Record<string, unknown>)[key]);
        if (r.isErr) return Err(prependPath(r.error, key));
        result[key] = r.value;
      }
      // Why: result is Record<string, unknown> built from validated codec fields.
      // TS can't prove dynamic keys match the mapped DecodedShape<T>.
      // Safe because we decoded each field via its codec.
      return Ok(result) as unknown as Result<DecodedShape<T>, SchemaError>;
    },
    (output: DecodedShape<T>) => {
      const result: Record<string, unknown> = {};
      for (const key of keys) {
        const codec = shape[key]!;
        result[key] = codec.encode((output as Record<string, unknown>)[key]);
      }
      return result as unknown;
    },
  );
};

const arrayCodec = <T>(element: CodecType<unknown, T>): CodecType<unknown, readonly T[]> =>
  createCodec<unknown, readonly T[]>(
    (input: unknown) => {
      if (!Array.isArray(input)) return schemaErr([], "array", input);
      const results: T[] = [];
      for (let i = 0; i < input.length; i++) {
        const r = element.decode(input[i]);
        if (r.isErr) return Err(prependPath(r.error, String(i)));
        results.push(r.value);
      }
      return Ok(results as readonly T[]);
    },
    (output: readonly T[]) => output.map(item => element.encode(item)) as unknown,
  );

const nullableCodec = <I, O>(codec: CodecType<I, O>): CodecType<I | null, O | null> =>
  createCodec(
    (input: I | null) => {
      if (input === null) return Ok(null);
      return codec.decode(input);
    },
    (output: O | null) => {
      if (output === null) return null;
      return codec.encode(output);
    },
  );

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create bidirectional codecs for encoding and decoding values.
 *
 * @example
 * ```ts
 * const UserCodec = Codec.object({
 *   name: Codec.string,
 *   age: Codec.number,
 * });
 *
 * const user = UserCodec.decode({ name: 'Alice', age: 30 }).unwrap();
 * const json = UserCodec.encode(user);
 *
 * // Bridge from existing Schema
 * const codec = Codec.fromSchema(mySchema, value => value);
 * ```
 */
export const Codec: {
  readonly from: <I, O>(
    decode: (input: I) => Result<O, SchemaError>,
    encode: (output: O) => I,
  ) => CodecType<I, O>;
  readonly fromSchema: <T>(
    schema: SchemaType<T>,
    encode: (value: T) => unknown,
  ) => CodecType<unknown, T>;
  readonly string: CodecType<unknown, string>;
  readonly number: CodecType<unknown, number>;
  readonly boolean: CodecType<unknown, boolean>;
  readonly object: <T extends CodecShape>(shape: T) => CodecType<unknown, DecodedShape<T>>;
  readonly array: <T>(element: CodecType<unknown, T>) => CodecType<unknown, readonly T[]>;
  readonly nullable: <I, O>(codec: CodecType<I, O>) => CodecType<I | null, O | null>;
} = {
  from: createCodec,
  fromSchema: <T>(schema: SchemaType<T>, encode: (value: T) => unknown): CodecType<unknown, T> =>
    createCodec(schema.parse, encode),
  string: stringCodec,
  number: numberCodec,
  boolean: booleanCodec,
  object: objectCodec,
  array: arrayCodec,
  nullable: nullableCodec,
};
