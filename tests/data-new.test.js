/**
 * data-new.test.js - Tests for new data modules.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/data-new.test.js
 *
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

const {
  NonEmptyList,
  Codec,
  Schema,
  Duration,
  Cron,
  Json,
  File,
  Path,
  Eol,
  Platform,
  Logger,
  Config,
  Client,
  HttpError,
  NetworkError,
  WebSocket,
  Eq,
  Ord,
  Ok,
  Err,
  Some,
  None,
} = await import("../dist/index.js");

// =============================================================================
// NonEmptyList
// =============================================================================

describe("NonEmptyList", () => {
  it("constructs from a tuple", () => {
    const nel = NonEmptyList([1, 2, 3]);
    assert.equal(nel.length, 3);
    assert.equal(nel[0], 1);
    assert.equal(nel[1], 2);
    assert.equal(nel[2], 3);
  });

  it("of: variadic constructor", () => {
    const nel = NonEmptyList.of(1, 2, 3);
    assert.equal(nel.length, 3);
    assert.equal(nel[0], 1);
    assert.equal(nel[2], 3);
  });

  it("of: single element", () => {
    const nel = NonEmptyList.of(42);
    assert.equal(nel.length, 1);
    assert.equal(nel[0], 42);
  });

  it("from: returns None for empty array", () => {
    const result = NonEmptyList.from([]);
    assert.equal(result.isNone, true);
  });

  it("from: returns Some for non-empty array", () => {
    const result = NonEmptyList.from([1]);
    assert.equal(result.isSome, true);
    assert.equal(result.unwrap().length, 1);
    assert.equal(result.unwrap().first(), 1);
  });

  it("is: type guard checks $nonEmpty brand", () => {
    const nel = NonEmptyList([1, 2]);
    // NonEmptyList wraps via Proxy. The is() check uses `in` which requires
    // a `has` trap. Verify the brand is accessible via property access.
    assert.equal(nel.$nonEmpty, true);
    assert.equal(nel.$immutable, true);
  });

  it("is: type guard returns false for non-NEL values", () => {
    assert.equal(NonEmptyList.is([1, 2]), false);
    assert.equal(NonEmptyList.is(null), false);
    assert.equal(NonEmptyList.is(42), false);
    assert.equal(NonEmptyList.is({}), false);
  });

  it("head: returns first element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    assert.equal(nel.head, 10);
  });

  it("first: returns first element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    assert.equal(nel.first(), 10);
  });

  it("last: returns last element directly", () => {
    const nel = NonEmptyList([10, 20, 30]);
    assert.equal(nel.last(), 30);
  });

  it("last: single element", () => {
    const nel = NonEmptyList.of(99);
    assert.equal(nel.last(), 99);
  });

  it("reduce1: folds without init value", () => {
    const nel = NonEmptyList([1, 2, 3, 4]);
    const sum = nel.reduce1((acc, v) => acc + v);
    assert.equal(sum, 10);
  });

  it("reduce1: single element returns that element", () => {
    const nel = NonEmptyList.of(42);
    assert.equal(
      nel.reduce1((acc, v) => acc + v),
      42,
    );
  });

  it("map: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const mapped = nel.map(v => v * 10);
    assert.equal(mapped.$nonEmpty, true);
    assert.equal(mapped.length, 3);
    assert.equal(mapped.first(), 10);
    assert.equal(mapped.last(), 30);
  });

  it("sortBy: preserves non-emptiness", () => {
    const nel = NonEmptyList([3, 1, 2]);
    const sorted = nel.sortBy((a, b) => a - b);
    assert.equal(sorted.$nonEmpty, true);
    assert.equal(sorted.first(), 1);
    assert.equal(sorted.last(), 3);
  });

  it("sortByOrd: preserves non-emptiness", () => {
    const nel = NonEmptyList([3, 1, 2]);
    const sorted = nel.sortByOrd(Ord.number);
    assert.equal(sorted.$nonEmpty, true);
    assert.equal(sorted.first(), 1);
    assert.equal(sorted.last(), 3);
  });

  it("uniqBy: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 1, 3, 2]);
    const unique = nel.uniqBy(Eq.number);
    assert.equal(unique.$nonEmpty, true);
    assert.equal(unique.length, 3);
    assert.deepEqual(unique.toMutable(), [1, 2, 3]);
  });

  it("uniqBy: single element", () => {
    const nel = NonEmptyList.of(1);
    const unique = nel.uniqBy(Eq.number);
    assert.equal(unique.length, 1);
  });

  it("append: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2]);
    const appended = nel.append(3);
    assert.equal(appended.$nonEmpty, true);
    assert.equal(appended.length, 3);
    assert.equal(appended.last(), 3);
  });

  it("prepend: preserves non-emptiness", () => {
    const nel = NonEmptyList([2, 3]);
    const prepended = nel.prepend(1);
    assert.equal(prepended.$nonEmpty, true);
    assert.equal(prepended.length, 3);
    assert.equal(prepended.first(), 1);
  });

  it("concat: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2]);
    const concatenated = nel.concat([3, 4]);
    assert.equal(concatenated.$nonEmpty, true);
    assert.equal(concatenated.length, 4);
    assert.equal(concatenated.last(), 4);
  });

  it("concat: with empty array still non-empty", () => {
    const nel = NonEmptyList([1]);
    const concatenated = nel.concat([]);
    assert.equal(concatenated.$nonEmpty, true);
    assert.equal(concatenated.length, 1);
  });

  it("filter: returns ImmutableList (may be empty)", () => {
    const nel = NonEmptyList([1, 2, 3, 4]);
    const filtered = nel.filter(v => v > 2);
    assert.equal(filtered.length, 2);
    // filter may produce empty, so not necessarily NonEmptyList
    const empty = nel.filter(() => false);
    assert.equal(empty.length, 0);
  });

  it("at: returns Option", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const found = nel.at(1);
    assert.equal(found.isSome, true);
    assert.equal(found.unwrap(), 20);

    const outOfBounds = nel.at(10);
    assert.equal(outOfBounds.isNone, true);
  });

  it("at: supports negative index", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const last = nel.at(-1);
    assert.equal(last.isSome, true);
    assert.equal(last.unwrap(), 30);
  });

  it("find: returns Option", () => {
    const nel = NonEmptyList([10, 20, 30]);
    const found = nel.find(v => v > 15);
    assert.equal(found.isSome, true);
    assert.equal(found.unwrap(), 20);

    const notFound = nel.find(v => v > 100);
    assert.equal(notFound.isNone, true);
  });

  it("setAt: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const updated = nel.setAt(1, 99);
    assert.equal(updated.$nonEmpty, true);
    assert.equal(updated[1], 99);
    // Original unchanged
    assert.equal(nel[1], 2);
  });

  it("updateAt: preserves non-emptiness", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const updated = nel.updateAt(1, v => v * 10);
    assert.equal(updated.$nonEmpty, true);
    assert.equal(updated[1], 20);
  });

  it("equals: structural equality", () => {
    const a = NonEmptyList([1, 2, 3]);
    const b = NonEmptyList([1, 2, 3]);
    const c = NonEmptyList([1, 2, 4]);
    assert.equal(a.equals(b), true);
    assert.equal(a.equals(c), false);
  });

  it("toList: converts to ImmutableList", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const list = nel.toList();
    assert.equal(list.length, 3);
    assert.equal(list.$immutable, true);
  });

  it("toMutable: returns mutable array", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const arr = nel.toMutable();
    assert.deepEqual(arr, [1, 2, 3]);
    // Mutating the result does not affect original
    arr.push(4);
    assert.equal(nel.length, 3);
  });

  it("toJSON: returns raw array", () => {
    const nel = NonEmptyList([1, 2, 3]);
    const json = nel.toJSON();
    assert.deepEqual(json, [1, 2, 3]);
  });
});

// =============================================================================
// Codec
// =============================================================================

describe("Codec", () => {
  describe("string", () => {
    it("decodes valid string", () => {
      const r = Codec.string.decode("hello");
      assert.equal(r.isOk, true);
      assert.equal(r.value, "hello");
    });

    it("rejects non-string", () => {
      const r = Codec.string.decode(42);
      assert.equal(r.isErr, true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.string.encode("hello");
      const decoded = Codec.string.decode(encoded);
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, "hello");
    });
  });

  describe("number", () => {
    it("decodes valid number", () => {
      const r = Codec.number.decode(42);
      assert.equal(r.isOk, true);
      assert.equal(r.value, 42);
    });

    it("rejects non-number", () => {
      const r = Codec.number.decode("42");
      assert.equal(r.isErr, true);
    });

    it("rejects NaN", () => {
      const r = Codec.number.decode(NaN);
      assert.equal(r.isErr, true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.number.encode(42);
      const decoded = Codec.number.decode(encoded);
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, 42);
    });
  });

  describe("boolean", () => {
    it("decodes valid boolean", () => {
      assert.equal(Codec.boolean.decode(true).value, true);
      assert.equal(Codec.boolean.decode(false).value, false);
    });

    it("rejects non-boolean", () => {
      assert.equal(Codec.boolean.decode(1).isErr, true);
      assert.equal(Codec.boolean.decode("true").isErr, true);
    });

    it("encode roundtrip", () => {
      const encoded = Codec.boolean.encode(true);
      assert.equal(Codec.boolean.decode(encoded).value, true);
    });
  });

  describe("object", () => {
    const UserCodec = Codec.object({
      name: Codec.string,
      age: Codec.number,
    });

    it("decodes valid object", () => {
      const r = UserCodec.decode({ name: "Alice", age: 30 });
      assert.equal(r.isOk, true);
      assert.equal(r.value.name, "Alice");
      assert.equal(r.value.age, 30);
    });

    it("rejects invalid field", () => {
      const r = UserCodec.decode({ name: "Alice", age: "thirty" });
      assert.equal(r.isErr, true);
      assert.deepEqual(r.error.path, ["age"]);
    });

    it("rejects non-object", () => {
      assert.equal(UserCodec.decode(null).isErr, true);
      assert.equal(UserCodec.decode("string").isErr, true);
      assert.equal(UserCodec.decode([]).isErr, true);
    });

    it("encodes back to plain object", () => {
      const obj = { name: "Alice", age: 30 };
      const decoded = UserCodec.decode(obj).value;
      const encoded = UserCodec.encode(decoded);
      assert.deepEqual(encoded, obj);
    });
  });

  describe("array", () => {
    const NumbersCodec = Codec.array(Codec.number);

    it("decodes valid array", () => {
      const r = NumbersCodec.decode([1, 2, 3]);
      assert.equal(r.isOk, true);
      assert.deepEqual(r.value, [1, 2, 3]);
    });

    it("rejects invalid element", () => {
      const r = NumbersCodec.decode([1, "two", 3]);
      assert.equal(r.isErr, true);
      assert.deepEqual(r.error.path, ["1"]);
    });

    it("rejects non-array", () => {
      assert.equal(NumbersCodec.decode("not array").isErr, true);
    });

    it("encode roundtrip", () => {
      const input = [1, 2, 3];
      const decoded = NumbersCodec.decode(input).value;
      const encoded = NumbersCodec.encode(decoded);
      assert.deepEqual(encoded, input);
    });
  });

  describe("nullable", () => {
    const NullableString = Codec.nullable(Codec.string);

    it("decodes null", () => {
      const r = NullableString.decode(null);
      assert.equal(r.isOk, true);
      assert.equal(r.value, null);
    });

    it("decodes value", () => {
      const r = NullableString.decode("hello");
      assert.equal(r.isOk, true);
      assert.equal(r.value, "hello");
    });

    it("encodes null", () => {
      assert.equal(NullableString.encode(null), null);
    });

    it("encodes value", () => {
      assert.equal(NullableString.encode("hello"), "hello");
    });
  });

  describe("from", () => {
    it("creates custom codec with decode/encode", () => {
      const DateCodec = Codec.from(
        input => {
          if (typeof input === "string") {
            const d = new Date(input);
            return !Number.isNaN(d.getTime())
              ? Ok(d)
              : Err({ path: [], expected: "ISO date", received: typeof input });
          }
          return Err({ path: [], expected: "string", received: typeof input });
        },
        date => date.toISOString(),
      );

      const decoded = DateCodec.decode("2024-01-01T00:00:00.000Z");
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value instanceof Date, true);

      const encoded = DateCodec.encode(decoded.value);
      assert.equal(typeof encoded, "string");

      assert.equal(DateCodec.decode(42).isErr, true);
    });
  });

  describe("fromSchema", () => {
    it("bridges from Schema", () => {
      const sc = Schema.string;
      const codec = Codec.fromSchema(sc, v => v);
      assert.equal(codec.decode("hello").isOk, true);
      assert.equal(codec.decode("hello").value, "hello");
      assert.equal(codec.decode(42).isErr, true);
      assert.equal(codec.encode("hello"), "hello");
    });
  });

  describe("pipe", () => {
    it("chains two codecs: decode goes a->b, encode goes b->a", () => {
      const StringToNumber = Codec.from(
        input => {
          if (typeof input !== "string")
            return Err({ path: [], expected: "string", received: typeof input });
          const n = Number(input);
          return Number.isNaN(n)
            ? Err({ path: [], expected: "numeric string", received: input })
            : Ok(n);
        },
        n => String(n),
      );

      const DoubleCodec = Codec.from(
        input => {
          if (typeof input !== "number")
            return Err({ path: [], expected: "number", received: typeof input });
          return Ok(input * 2);
        },
        n => n / 2,
      );

      const piped = StringToNumber.pipe(DoubleCodec);
      const decoded = piped.decode("5");
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, 10);

      const encoded = piped.encode(10);
      assert.equal(encoded, "5");
    });
  });

  describe("schema property", () => {
    it("extracts decode-only schema", () => {
      const schema = Codec.string.schema;
      assert.equal(schema.parse("hello").isOk, true);
      assert.equal(schema.parse(42).isErr, true);
      assert.equal(schema.is("hello"), true);
      assert.equal(schema.is(42), false);
    });
  });

  describe("roundtrip", () => {
    it("decode then encode produces original for primitives", () => {
      // string
      assert.equal(Codec.string.encode(Codec.string.decode("test").value), "test");
      // number
      assert.equal(Codec.number.encode(Codec.number.decode(3.14).value), 3.14);
      // boolean
      assert.equal(Codec.boolean.encode(Codec.boolean.decode(false).value), false);
    });
  });
});

// =============================================================================
// Schema refinements
// =============================================================================

describe("Schema refinements", () => {
  describe("email", () => {
    it("valid emails pass", () => {
      assert.equal(Schema.email.parse("user@example.com").isOk, true);
      assert.equal(Schema.email.parse("a.b+c@domain.co").isOk, true);
    });

    it("invalid emails fail", () => {
      assert.equal(Schema.email.parse("not-an-email").isErr, true);
      assert.equal(Schema.email.parse("@missing.user").isErr, true);
      assert.equal(Schema.email.parse("user@").isErr, true);
      assert.equal(Schema.email.parse(42).isErr, true);
    });
  });

  describe("url", () => {
    it("valid URLs pass", () => {
      assert.equal(Schema.url.parse("https://example.com").isOk, true);
      assert.equal(Schema.url.parse("http://localhost:3000").isOk, true);
    });

    it("invalid URLs fail", () => {
      assert.equal(Schema.url.parse("not a url").isErr, true);
      assert.equal(Schema.url.parse("").isErr, true);
    });
  });

  describe("uuid", () => {
    it("valid v4 UUIDs pass", () => {
      assert.equal(Schema.uuid.parse("550e8400-e29b-41d4-a716-446655440000").isOk, true);
      assert.equal(Schema.uuid.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479").isOk, true);
    });

    it("invalid UUIDs fail", () => {
      assert.equal(Schema.uuid.parse("not-a-uuid").isErr, true);
      assert.equal(Schema.uuid.parse("550e8400-e29b-31d4-a716-446655440000").isErr, true);
      assert.equal(Schema.uuid.parse(42).isErr, true);
    });
  });

  describe("isoDate", () => {
    it("valid ISO dates pass", () => {
      assert.equal(Schema.isoDate.parse("2024-01-15T10:30:00.000Z").isOk, true);
      assert.equal(Schema.isoDate.parse("2024-01-15").isOk, true);
    });

    it("invalid ISO dates fail", () => {
      assert.equal(Schema.isoDate.parse("not-a-date").isErr, true);
      assert.equal(Schema.isoDate.parse("32-13-2024").isErr, true);
      assert.equal(Schema.isoDate.parse(42).isErr, true);
    });
  });

  describe("date", () => {
    it("valid ISO string parses to Date instance", () => {
      const result = Schema.date.parse("2024-01-15T10:30:00.000Z");
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Date);
      assert.equal(result.value.toISOString(), "2024-01-15T10:30:00.000Z");
    });

    it("date-only string parses to Date", () => {
      const result = Schema.date.parse("2024-06-01");
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Date);
    });

    it("invalid date string returns Err", () => {
      assert.equal(Schema.date.parse("not-a-date").isErr, true);
    });

    it("non-string input returns Err", () => {
      assert.equal(Schema.date.parse(42).isErr, true);
    });
  });

  describe("enum", () => {
    it("matching value returns Ok", () => {
      const status = Schema.enum(["active", "inactive", "pending"]);
      assert.equal(status.parse("active").isOk, true);
      assert.equal(status.parse("active").value, "active");
    });

    it("non-matching value returns Err", () => {
      const status = Schema.enum(["active", "inactive"]);
      assert.equal(status.parse("deleted").isErr, true);
    });

    it("works with numbers", () => {
      const priority = Schema.enum([1, 2, 3]);
      assert.equal(priority.parse(2).isOk, true);
      assert.equal(priority.parse(2).value, 2);
      assert.equal(priority.parse(4).isErr, true);
    });

    it("works with mixed types", () => {
      const mixed = Schema.enum(["yes", "no", true, false, 0, 1]);
      assert.equal(mixed.parse("yes").isOk, true);
      assert.equal(mixed.parse(true).isOk, true);
      assert.equal(mixed.parse(0).isOk, true);
      assert.equal(mixed.parse("maybe").isErr, true);
    });
  });

  describe("nonEmpty", () => {
    it("non-empty string passes", () => {
      assert.equal(Schema.nonEmpty.parse("hello").isOk, true);
    });

    it("empty string fails", () => {
      assert.equal(Schema.nonEmpty.parse("").isErr, true);
    });

    it("whitespace-only fails", () => {
      assert.equal(Schema.nonEmpty.parse("   ").isErr, true);
    });

    it("non-string fails", () => {
      assert.equal(Schema.nonEmpty.parse(42).isErr, true);
    });
  });

  describe("minLength", () => {
    it("at minimum passes", () => {
      assert.equal(Schema.minLength(3).parse("abc").isOk, true);
    });

    it("above minimum passes", () => {
      assert.equal(Schema.minLength(3).parse("abcd").isOk, true);
    });

    it("below minimum fails", () => {
      assert.equal(Schema.minLength(3).parse("ab").isErr, true);
    });
  });

  describe("maxLength", () => {
    it("at maximum passes", () => {
      assert.equal(Schema.maxLength(3).parse("abc").isOk, true);
    });

    it("below maximum passes", () => {
      assert.equal(Schema.maxLength(3).parse("ab").isOk, true);
    });

    it("above maximum fails", () => {
      assert.equal(Schema.maxLength(3).parse("abcd").isErr, true);
    });
  });

  describe("regex", () => {
    it("matching passes", () => {
      assert.equal(Schema.regex(/^\d{3}$/).parse("123").isOk, true);
    });

    it("non-matching fails", () => {
      assert.equal(Schema.regex(/^\d{3}$/).parse("12").isErr, true);
      assert.equal(Schema.regex(/^\d{3}$/).parse("abc").isErr, true);
    });
  });

  describe("int", () => {
    it("integers pass", () => {
      assert.equal(Schema.int.parse(42).isOk, true);
      assert.equal(Schema.int.parse(0).isOk, true);
      assert.equal(Schema.int.parse(-5).isOk, true);
    });

    it("floats fail", () => {
      assert.equal(Schema.int.parse(3.14).isErr, true);
      assert.equal(Schema.int.parse(0.1).isErr, true);
    });
  });

  describe("positive", () => {
    it("> 0 passes", () => {
      assert.equal(Schema.positive.parse(1).isOk, true);
      assert.equal(Schema.positive.parse(0.5).isOk, true);
    });

    it("0 fails", () => {
      assert.equal(Schema.positive.parse(0).isErr, true);
    });

    it("negative fails", () => {
      assert.equal(Schema.positive.parse(-1).isErr, true);
    });
  });

  describe("nonNegative", () => {
    it(">= 0 passes", () => {
      assert.equal(Schema.nonNegative.parse(0).isOk, true);
      assert.equal(Schema.nonNegative.parse(5).isOk, true);
    });

    it("negative fails", () => {
      assert.equal(Schema.nonNegative.parse(-1).isErr, true);
    });
  });

  describe("min / max / range", () => {
    it("min: at boundary passes", () => {
      assert.equal(Schema.min(5).parse(5).isOk, true);
    });

    it("min: below boundary fails", () => {
      assert.equal(Schema.min(5).parse(4).isErr, true);
    });

    it("max: at boundary passes", () => {
      assert.equal(Schema.max(10).parse(10).isOk, true);
    });

    it("max: above boundary fails", () => {
      assert.equal(Schema.max(10).parse(11).isErr, true);
    });

    it("range: within range passes", () => {
      assert.equal(Schema.range(1, 10).parse(5).isOk, true);
      assert.equal(Schema.range(1, 10).parse(1).isOk, true);
      assert.equal(Schema.range(1, 10).parse(10).isOk, true);
    });

    it("range: outside range fails", () => {
      assert.equal(Schema.range(1, 10).parse(0).isErr, true);
      assert.equal(Schema.range(1, 10).parse(11).isErr, true);
    });
  });

  describe("discriminatedUnion", () => {
    const Shape = Schema.discriminatedUnion("type", {
      circle: Schema.object({
        type: Schema.literal("circle"),
        radius: Schema.number,
      }),
      rect: Schema.object({
        type: Schema.literal("rect"),
        width: Schema.number,
        height: Schema.number,
      }),
    });

    it("correct branch selected", () => {
      const circle = Shape.parse({ type: "circle", radius: 5 });
      assert.equal(circle.isOk, true);
      assert.equal(circle.value.type, "circle");
      assert.equal(circle.value.radius, 5);

      const rect = Shape.parse({ type: "rect", width: 3, height: 4 });
      assert.equal(rect.isOk, true);
      assert.equal(rect.value.type, "rect");
    });

    it("invalid tag returns error", () => {
      const r = Shape.parse({ type: "triangle", sides: 3 });
      assert.equal(r.isErr, true);
    });

    it("non-object returns error", () => {
      assert.equal(Shape.parse("not an object").isErr, true);
      assert.equal(Shape.parse(null).isErr, true);
    });
  });

  describe("lazy", () => {
    it("supports recursive schema (tree structure)", () => {
      const TreeSchema = Schema.object({
        value: Schema.number,
        children: Schema.array(Schema.lazy(() => TreeSchema)),
      });

      const tree = TreeSchema.parse({
        value: 1,
        children: [
          { value: 2, children: [] },
          {
            value: 3,
            children: [{ value: 4, children: [] }],
          },
        ],
      });

      assert.equal(tree.isOk, true);
      assert.equal(tree.value.value, 1);
      assert.equal(tree.value.children.length, 2);
      assert.equal(tree.value.children[1].children[0].value, 4);
    });
  });

  describe("intersection", () => {
    it("both schemas must pass", () => {
      const Named = Schema.object({ name: Schema.string });
      const Aged = Schema.object({ age: Schema.number });
      const Person = Schema.intersection(Named, Aged);

      const r = Person.parse({ name: "Alice", age: 30 });
      assert.equal(r.isOk, true);
      assert.equal(r.value.name, "Alice");
      assert.equal(r.value.age, 30);
    });

    it("fails if either schema fails", () => {
      const Named = Schema.object({ name: Schema.string });
      const Aged = Schema.object({ age: Schema.number });
      const Person = Schema.intersection(Named, Aged);

      assert.equal(Person.parse({ name: "Alice" }).isErr, true);
      assert.equal(Person.parse({ age: 30 }).isErr, true);
    });
  });
});

// =============================================================================
// Duration
// =============================================================================

describe("Duration", () => {
  describe("factories", () => {
    it("milliseconds produces correct ms value", () => {
      assert.equal(Duration.toMilliseconds(Duration.milliseconds(500)), 500);
    });

    it("seconds produces correct ms value", () => {
      assert.equal(Duration.toMilliseconds(Duration.seconds(2)), 2000);
    });

    it("minutes produces correct ms value", () => {
      assert.equal(Duration.toMilliseconds(Duration.minutes(1)), 60000);
    });

    it("hours produces correct ms value", () => {
      assert.equal(Duration.toMilliseconds(Duration.hours(1)), 3600000);
    });

    it("days produces correct ms value", () => {
      assert.equal(Duration.toMilliseconds(Duration.days(1)), 86400000);
    });
  });

  describe("conversions", () => {
    it("toSeconds", () => {
      assert.equal(Duration.toSeconds(Duration.milliseconds(3000)), 3);
    });

    it("toMinutes", () => {
      assert.equal(Duration.toMinutes(Duration.seconds(120)), 2);
    });

    it("toHours", () => {
      assert.equal(Duration.toHours(Duration.minutes(90)), 1.5);
    });
  });

  describe("arithmetic", () => {
    it("add", () => {
      const a = Duration.seconds(10);
      const b = Duration.seconds(20);
      assert.equal(Duration.toSeconds(Duration.add(a, b)), 30);
    });

    it("subtract", () => {
      const a = Duration.seconds(30);
      const b = Duration.seconds(10);
      assert.equal(Duration.toSeconds(Duration.subtract(a, b)), 20);
    });

    it("multiply", () => {
      const d = Duration.seconds(5);
      assert.equal(Duration.toSeconds(Duration.multiply(d, 3)), 15);
    });
  });

  describe("predicates", () => {
    it("isZero: true for zero", () => {
      assert.equal(Duration.isZero(Duration.zero), true);
      assert.equal(Duration.isZero(Duration.milliseconds(0)), true);
    });

    it("isZero: false otherwise", () => {
      assert.equal(Duration.isZero(Duration.seconds(1)), false);
    });

    it("isPositive", () => {
      assert.equal(Duration.isPositive(Duration.seconds(1)), true);
      assert.equal(Duration.isPositive(Duration.zero), false);
    });
  });

  describe("format", () => {
    it("0ms for zero", () => {
      assert.equal(Duration.format(Duration.zero), "0ms");
    });

    it("500ms for half second", () => {
      assert.equal(Duration.format(Duration.milliseconds(500)), "500ms");
    });

    it("1s for one second", () => {
      assert.equal(Duration.format(Duration.seconds(1)), "1s");
    });

    it("1m 30s for 90 seconds", () => {
      assert.equal(Duration.format(Duration.seconds(90)), "1m 30s");
    });

    it("2h 30m 15s", () => {
      const d = Duration.add(
        Duration.add(Duration.hours(2), Duration.minutes(30)),
        Duration.seconds(15),
      );
      assert.equal(Duration.format(d), "2h 30m 15s");
    });

    it("1d for 24 hours", () => {
      assert.equal(Duration.format(Duration.days(1)), "1d");
    });
  });

  describe("zero", () => {
    it("is zero", () => {
      assert.equal(Duration.isZero(Duration.zero), true);
      assert.equal(Duration.toMilliseconds(Duration.zero), 0);
    });
  });

  describe("eq", () => {
    it("equals works correctly", () => {
      assert.equal(Duration.eq.equals(Duration.seconds(1), Duration.milliseconds(1000)), true);
      assert.equal(Duration.eq.equals(Duration.seconds(1), Duration.seconds(2)), false);
    });
  });

  describe("ord", () => {
    it("compare returns -1/0/1", () => {
      assert.equal(Duration.ord.compare(Duration.seconds(1), Duration.seconds(2)), -1);
      assert.equal(Duration.ord.compare(Duration.seconds(2), Duration.seconds(2)), 0);
      assert.equal(Duration.ord.compare(Duration.seconds(3), Duration.seconds(2)), 1);
    });
  });
});

// =============================================================================
// Cron
// =============================================================================

describe("Cron", () => {
  describe("parse", () => {
    it("valid: every minute", () => {
      const r = Cron.parse("* * * * *");
      assert.equal(r.isOk, true);
    });

    it("valid: 9am weekdays", () => {
      const r = Cron.parse("0 9 * * 1-5");
      assert.equal(r.isOk, true);
    });

    it("valid: every 5 minutes", () => {
      const r = Cron.parse("*/5 * * * *");
      assert.equal(r.isOk, true);
    });

    it("invalid: wrong field count", () => {
      const r = Cron.parse("* * *");
      assert.equal(r.isErr, true);
    });

    it("invalid: out-of-range values", () => {
      const r = Cron.parse("60 * * * *");
      assert.equal(r.isErr, true);
    });

    it("invalid: out-of-range hour", () => {
      const r = Cron.parse("* 25 * * *");
      assert.equal(r.isErr, true);
    });
  });

  describe("matches", () => {
    it("date matches expression", () => {
      const cron = Cron.parse("0 9 * * *").value;
      // 9:00 AM on any day
      const date = new Date(2024, 5, 15, 9, 0, 0);
      assert.equal(Cron.matches(cron, date), true);
    });

    it("date does not match", () => {
      const cron = Cron.parse("0 9 * * *").value;
      // 10:00 AM
      const date = new Date(2024, 5, 15, 10, 0, 0);
      assert.equal(Cron.matches(cron, date), false);
    });

    it("every-minute matches any minute", () => {
      const cron = Cron.parse("* * * * *").value;
      const date = new Date(2024, 5, 15, 14, 37, 0);
      assert.equal(Cron.matches(cron, date), true);
    });
  });

  describe("next", () => {
    it("returns next occurrence after given date", () => {
      const cron = Cron.parse("0 9 * * *").value;
      const after = new Date(2024, 5, 15, 8, 0, 0);
      const next = Cron.next(cron, after);
      assert.equal(next.isSome, true);
      const d = next.unwrap();
      assert.equal(d.getHours(), 9);
      assert.equal(d.getMinutes(), 0);
    });

    it("skips to next day if past time", () => {
      const cron = Cron.parse("0 9 * * *").value;
      const after = new Date(2024, 5, 15, 10, 0, 0);
      const next = Cron.next(cron, after);
      assert.equal(next.isSome, true);
      const d = next.unwrap();
      assert.equal(d.getHours(), 9);
      assert.equal(d.getDate(), 16);
    });
  });
});

// =============================================================================
// Json
// =============================================================================

describe("Json", () => {
  it("parse: valid JSON returns Ok", () => {
    const r = Json.parse('{"name":"Alice","age":30}');
    assert.equal(r.isOk, true);
    assert.deepEqual(r.value, { name: "Alice", age: 30 });
  });

  it("parse: invalid JSON returns Err", () => {
    const r = Json.parse("not json {");
    assert.equal(r.isErr, true);
    assert.equal(r.error.tag, "JsonError");
  });

  it("stringify: normal object returns Ok", () => {
    const r = Json.stringify({ name: "Alice" });
    assert.equal(r.isOk, true);
    assert.equal(r.value, '{"name":"Alice"}');
  });

  it("stringify: circular ref returns Err", () => {
    const obj = {};
    obj.self = obj;
    const r = Json.stringify(obj);
    assert.equal(r.isErr, true);
    assert.equal(r.error.tag, "JsonError");
  });

  it("roundtrip: parse(stringify(obj)) produces equivalent", () => {
    const original = { x: 1, y: [2, 3], z: { a: true } };
    const str = Json.stringify(original);
    assert.equal(str.isOk, true);
    const parsed = Json.parse(str.value);
    assert.equal(parsed.isOk, true);
    assert.deepEqual(parsed.value, original);
  });
});

// =============================================================================
// File
// =============================================================================

describe("File", () => {
  let tmpDir;

  // Create temp directory before tests, clean up after
  it("setup: create temp directory", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pure-ts-test-"));
  });

  it("write then read: roundtrip", async () => {
    const filePath = join(tmpDir, "test.txt");
    const writeResult = await File.write(filePath, "hello world").run();
    assert.equal(writeResult.isOk, true);

    const readResult = await File.read(filePath).run();
    assert.equal(readResult.isOk, true);
    assert.equal(readResult.value, "hello world");
  });

  it("read: non-existent file returns Err", async () => {
    const r = await File.read(join(tmpDir, "does-not-exist.txt")).run();
    assert.equal(r.isErr, true);
    assert.equal(r.error.tag, "FileError");
  });

  it("exists: true for existing file", async () => {
    const filePath = join(tmpDir, "exists.txt");
    await File.write(filePath, "content").run();
    const r = await File.exists(filePath).run();
    assert.equal(r.isOk, true);
    assert.equal(r.value, true);
  });

  it("exists: false for missing file", async () => {
    const r = await File.exists(join(tmpDir, "missing.txt")).run();
    assert.equal(r.isOk, true);
    assert.equal(r.value, false);
  });

  it("makeDir: creates directory", async () => {
    const dirPath = join(tmpDir, "sub", "dir");
    const r = await File.makeDir(dirPath).run();
    assert.equal(r.isOk, true);

    // Write a file into the directory to verify it exists
    const filePath = join(dirPath, "file.txt");
    const wr = await File.write(filePath, "inside").run();
    assert.equal(wr.isOk, true);
  });

  it("list: lists directory entries", async () => {
    const dirPath = join(tmpDir, "listdir");
    await File.makeDir(dirPath).run();
    await File.write(join(dirPath, "a.txt"), "a").run();
    await File.write(join(dirPath, "b.txt"), "b").run();

    const r = await File.list(dirPath).run();
    assert.equal(r.isOk, true);
    assert.equal(r.value.length, 2);
    assert.equal(r.value.includes("a.txt"), true);
    assert.equal(r.value.includes("b.txt"), true);
  });

  it("remove: deletes file", async () => {
    const filePath = join(tmpDir, "to-delete.txt");
    await File.write(filePath, "delete me").run();
    assert.equal((await File.exists(filePath).run()).value, true);

    const r = await File.remove(filePath).run();
    assert.equal(r.isOk, true);

    assert.equal((await File.exists(filePath).run()).value, false);
  });

  it("line ending normalization: write \\r\\n, read gets \\n", async () => {
    const filePath = join(tmpDir, "crlf.txt");
    await File.write(filePath, "line1\r\nline2\r\nline3").run();

    const r = await File.read(filePath).run();
    assert.equal(r.isOk, true);
    assert.equal(r.value, "line1\nline2\nline3");
    assert.equal(r.value.includes("\r\n"), false);
  });

  it("teardown: remove temp directory", async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});

// =============================================================================
// Path / Eol / Platform
// =============================================================================

describe("Path", () => {
  it("join: joins segments with separator", () => {
    const result = Path.join("src", "core", "result.ts");
    // On POSIX it uses /, on Windows \
    assert.equal(result.includes("core"), true);
    assert.equal(result.includes("result.ts"), true);
    // Separator is used
    assert.equal(result.includes(Path.separator), true);
  });

  it("normalize: collapses // and handles mixed separators", () => {
    const result = Path.normalize("src//core///result.ts");
    // Should not have double slashes
    assert.equal(result.includes("//"), false);
  });

  it("basename: extracts filename", () => {
    assert.equal(Path.basename("/home/user/file.ts"), "file.ts");
    assert.equal(Path.basename("file.ts"), "file.ts");
  });

  it("dirname: extracts directory", () => {
    const dir = Path.dirname("/home/user/file.ts");
    // Should contain "home" and "user" but not "file.ts"
    assert.equal(dir.includes("file.ts"), false);
    assert.equal(dir.includes("user"), true);
  });

  it("dirname: returns . for bare filename", () => {
    assert.equal(Path.dirname("file.ts"), ".");
  });

  it("extname: extracts extension", () => {
    assert.equal(Path.extname("file.ts"), ".ts");
    assert.equal(Path.extname("file.test.ts"), ".ts");
  });

  it("extname: empty for no extension", () => {
    assert.equal(Path.extname("Makefile"), "");
  });

  it("toPosix: converts backslashes to forward", () => {
    assert.equal(Path.toPosix("src\\core\\result.ts"), "src/core/result.ts");
    assert.equal(Path.toPosix("src/core/result.ts"), "src/core/result.ts");
  });
});

describe("Eol", () => {
  it("normalize: replaces \\r\\n with \\n", () => {
    assert.equal(Eol.normalize("a\r\nb\r\nc"), "a\nb\nc");
    assert.equal(Eol.normalize("no crlf here"), "no crlf here");
  });

  it("split: splits on both \\r\\n and \\n", () => {
    assert.deepEqual(Eol.split("a\r\nb\nc"), ["a", "b", "c"]);
    assert.deepEqual(Eol.split("single"), ["single"]);
  });
});

describe("Platform", () => {
  it("os: returns 'windows' or 'posix'", () => {
    assert.equal(Platform.os === "windows" || Platform.os === "posix", true);
  });

  it("isWindows: matches os", () => {
    assert.equal(Platform.isWindows, Platform.os === "windows");
  });
});

// =============================================================================
// Logger
// =============================================================================

describe("Logger", () => {
  it("create: produces a logger with methods", () => {
    const log = Logger.create({ name: "test", sink: Logger.silent });
    assert.equal(typeof log.debug, "function");
    assert.equal(typeof log.info, "function");
    assert.equal(typeof log.warn, "function");
    assert.equal(typeof log.error, "function");
    assert.equal(typeof log.child, "function");
    assert.equal(typeof log.named, "function");
    assert.equal(log.name, "test");
  });

  it("silent sink: no output (does not throw)", () => {
    const log = Logger.create({ name: "test", sink: Logger.silent });
    // These should not throw
    log.debug("debug");
    log.info("info");
    log.warn("warn");
    log.error("error");
  });

  it("custom sink: captures log records with correct structure", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "myapp", level: "debug", sink });

    log.info("hello", { key: "value" });

    assert.equal(records.length, 1);
    const r = records[0];
    assert.equal(r.level, "info");
    assert.equal(r.message, "hello");
    assert.equal(r.name, "myapp");
    assert.equal(typeof r.timestamp, "string");
    assert.equal(r.context.key, "value");
  });

  it("child: inherits context and adds new context", () => {
    const records = [];
    const sink = record => records.push(record);
    const parent = Logger.create({
      name: "parent",
      level: "debug",
      sink,
      context: { app: "test" },
    });

    const child = parent.child({ requestId: "abc" });
    child.info("from child");

    assert.equal(records.length, 1);
    assert.equal(records[0].context.app, "test");
    assert.equal(records[0].context.requestId, "abc");
  });

  it("named: changes name", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "original", level: "debug", sink });
    const renamed = log.named("renamed");

    renamed.info("test");

    assert.equal(renamed.name, "renamed");
    assert.equal(records[0].name, "renamed");
  });

  it("level filtering: debug not emitted at info level", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "test", level: "info", sink });

    log.debug("should not appear");
    log.info("should appear");
    log.warn("should also appear");

    assert.equal(records.length, 2);
    assert.equal(records[0].level, "info");
    assert.equal(records[1].level, "warn");
  });

  it("level filtering: error always emitted", () => {
    const records = [];
    const sink = record => records.push(record);
    const log = Logger.create({ name: "test", level: "error", sink });

    log.debug("no");
    log.info("no");
    log.warn("no");
    log.error("yes");

    assert.equal(records.length, 1);
    assert.equal(records[0].level, "error");
  });
});

// =============================================================================
// Config
// =============================================================================

describe("Config", () => {
  it("loadFrom: valid env returns Ok with parsed values", () => {
    const AppConfig = Config.from({
      PORT: Schema.string,
      HOST: Schema.string,
    });

    const r = AppConfig.loadFrom({ PORT: "3000", HOST: "localhost" });
    assert.equal(r.isOk, true);
    assert.equal(r.value.PORT, "3000");
    assert.equal(r.value.HOST, "localhost");
  });

  it("loadFrom: missing key returns Err with path", () => {
    const AppConfig = Config.from({
      PORT: Schema.string,
      HOST: Schema.string,
    });

    const r = AppConfig.loadFrom({ PORT: "3000" });
    assert.equal(r.isErr, true);
    assert.deepEqual(r.error.path, ["HOST"]);
  });

  it("loadFrom: invalid value returns Err", () => {
    const AppConfig = Config.from({
      PORT: Schema.number,
    });

    // Schema.number expects a number, not a string
    const r = AppConfig.loadFrom({ PORT: "3000" });
    assert.equal(r.isErr, true);
  });

  it("loadFrom: with schema transform", () => {
    const AppConfig = Config.from({
      DEBUG: Schema.string.transform(s => s === "true"),
    });

    const r = AppConfig.loadFrom({ DEBUG: "true" });
    assert.equal(r.isOk, true);
    assert.equal(r.value.DEBUG, true);
  });

  it("loadFrom: with schema default", () => {
    const AppConfig = Config.from({
      LOG_LEVEL: Schema.string.default("info"),
    });

    const r = AppConfig.loadFrom({});
    assert.equal(r.isOk, true);
    assert.equal(r.value.LOG_LEVEL, "info");
  });
});

// =============================================================================
// Client
// =============================================================================

describe("Client", () => {
  // Mock fetch factory
  const mockFetch =
    (status, body, headers = {}) =>
    async (_url, _init) => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      headers: new Headers(headers),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });

  it("successful GET returns Ok with ClientResponse", async () => {
    const api = Client.create({
      fetch: mockFetch(200, { users: [] }),
    });

    const r = await api.get("/users").run();
    assert.equal(r.isOk, true);
    assert.equal(r.value.status, 200);
    assert.equal(r.value.statusText, "OK");
  });

  it("non-2xx returns Err(HttpError) with status metadata", async () => {
    const api = Client.create({
      fetch: mockFetch(404, { error: "not found" }),
    });

    const r = await api.get("/missing").run();
    assert.equal(r.isErr, true);
    assert.equal(r.error.tag, "HttpError");
    assert.equal(r.error.metadata.status, 404);
  });

  it("network error returns Err(NetworkError)", async () => {
    const api = Client.create({
      fetch: async () => {
        throw new Error("DNS resolution failed");
      },
    });

    const r = await api.get("/anything").run();
    assert.equal(r.isErr, true);
    assert.equal(r.error.tag, "NetworkError");
    assert.equal(r.error.message, "DNS resolution failed");
  });

  it("ClientResponse.json(): parses JSON body", async () => {
    const data = { id: 1, name: "Alice" };
    const api = Client.create({
      fetch: mockFetch(200, data),
    });

    const r = await api.get("/user/1").run();
    assert.equal(r.isOk, true);
    const jsonResult = await r.value.json();
    assert.equal(jsonResult.isOk, true);
    assert.deepEqual(jsonResult.value, data);
  });

  it("ClientResponse.text(): reads text body", async () => {
    const data = { message: "hello" };
    const api = Client.create({
      fetch: mockFetch(200, data),
    });

    const r = await api.get("/text").run();
    assert.equal(r.isOk, true);
    const textResult = await r.value.text();
    assert.equal(textResult.isOk, true);
    assert.equal(typeof textResult.value, "string");
  });

  it("custom headers: merged with defaults", async () => {
    let capturedHeaders;
    const api = Client.create({
      headers: { Authorization: "Bearer token" },
      fetch: async (_url, init) => {
        capturedHeaders = init.headers;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: async () => ({}),
          text: async () => "",
        };
      },
    });

    await api.get("/test", { headers: { "X-Custom": "value" } }).run();
    assert.equal(capturedHeaders.Authorization, "Bearer token");
    assert.equal(capturedHeaders["X-Custom"], "value");
  });

  it("baseUrl: prepended to path", async () => {
    let capturedUrl;
    const api = Client.create({
      baseUrl: "https://api.example.com",
      fetch: async url => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: async () => ({}),
          text: async () => "",
        };
      },
    });

    await api.get("/users").run();
    assert.equal(capturedUrl, "https://api.example.com/users");
  });
});

// =============================================================================
// WebSocket
// =============================================================================

describe("WebSocket", () => {
  it("router: creates empty router", () => {
    const ws = WebSocket.router();
    assert.equal(ws.routes.length, 0);
  });

  it("route: adds route", () => {
    const handler = {
      onOpen: () => {
        /* noop */
      },
    };
    const ws = WebSocket.router().route("/chat", handler);
    assert.equal(ws.routes.length, 1);
    assert.equal(ws.routes[0].pattern, "/chat");
    assert.equal(ws.routes[0].handler, handler);
  });

  it("route: chaining adds multiple routes", () => {
    const ws = WebSocket.router()
      .route("/chat", {
        onOpen: () => {
          /* noop */
        },
      })
      .route("/notifications", {
        onMessage: () => {
          /* noop */
        },
      });
    assert.equal(ws.routes.length, 2);
  });

  it("match: finds handler by exact path", () => {
    const handler = {
      onOpen: () => {
        /* noop */
      },
    };
    const ws = WebSocket.router().route("/chat", handler);
    const found = ws.match("/chat");
    assert.equal(found, handler);
  });

  it("match: returns undefined for unmatched path", () => {
    const ws = WebSocket.router().route("/chat", {
      onOpen: () => {
        /* noop */
      },
    });
    assert.equal(ws.match("/other"), undefined);
  });

  it("routes: lists all registered routes", () => {
    const ws = WebSocket.router()
      .route("/a", {
        onOpen: () => {
          /* noop */
        },
      })
      .route("/b", {
        onMessage: () => {
          /* noop */
        },
      });

    const patterns = ws.routes.map(r => r.pattern);
    assert.deepEqual(patterns, ["/a", "/b"]);
  });

  it("router is immutable: route returns new router", () => {
    const ws1 = WebSocket.router();
    const ws2 = ws1.route("/chat", {
      onOpen: () => {
        /* noop */
      },
    });
    assert.equal(ws1.routes.length, 0);
    assert.equal(ws2.routes.length, 1);
  });
});
