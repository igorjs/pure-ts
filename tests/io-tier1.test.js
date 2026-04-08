/**
 * io-tier1.test.js - Comprehensive tests for Tier 1 IO modules:
 * Crypto, Url, Encoding, Clone, Compression, Timer.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  Crypto,
  CryptoError,
  Url,
  UrlError,
  Encoding,
  EncodingError,
  Clone,
  CloneError,
  Compression,
  CompressionError,
  Timer,
  TimeoutError,
  Duration,
  Ok,
  Err,
  Some,
  None,
} = await import("../dist/index.js");

// =============================================================================
// 1. Crypto
// =============================================================================

describe("Crypto", () => {
  describe("Crypto.uuid()", () => {
    it("returns a string", () => {
      const id = Crypto.uuid();
      assert.equal(typeof id, "string");
    });

    it("matches UUID v4 format", () => {
      const id = Crypto.uuid();
      const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
      assert.match(id, uuidV4Regex);
    });

    it("two calls produce different values", () => {
      const a = Crypto.uuid();
      const b = Crypto.uuid();
      assert.notEqual(a, b);
    });
  });

  describe("Crypto.randomBytes()", () => {
    it("returns Ok with Uint8Array of correct length", () => {
      const result = Crypto.randomBytes(16);
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Uint8Array);
      assert.equal(result.value.length, 16);
    });

    it("returns Ok for length 0", () => {
      const result = Crypto.randomBytes(0);
      assert.equal(result.isOk, true);
      assert.equal(result.value.length, 0);
    });

    it("returns Err for negative length", () => {
      const result = Crypto.randomBytes(-1);
      assert.equal(result.isErr, true);
    });
  });

  describe("Crypto.hash()", () => {
    it("SHA-256 of string returns Ok(Uint8Array) with 32 bytes", async () => {
      const result = await Crypto.hash("SHA-256", "hello").run();
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Uint8Array);
      assert.equal(result.value.length, 32);
    });

    it("SHA-512 of string returns 64 bytes", async () => {
      const result = await Crypto.hash("SHA-512", "hello").run();
      assert.equal(result.isOk, true);
      assert.equal(result.value.length, 64);
    });

    it("accepts Uint8Array input", async () => {
      const input = new TextEncoder().encode("hello");
      const result = await Crypto.hash("SHA-256", input).run();
      assert.equal(result.isOk, true);
      assert.equal(result.value.length, 32);
    });

    it("produces consistent output for the same input", async () => {
      const a = await Crypto.hash("SHA-256", "hello").run();
      const b = await Crypto.hash("SHA-256", "hello").run();
      assert.deepEqual(a.value, b.value);
    });

    it("produces different output for different input", async () => {
      const a = await Crypto.hash("SHA-256", "hello").run();
      const b = await Crypto.hash("SHA-256", "world").run();
      assert.notDeepEqual(a.value, b.value);
    });
  });

  describe("Crypto.timingSafeEqual()", () => {
    it("returns true for identical byte arrays", () => {
      const a = new Uint8Array([1, 2, 3, 4]);
      assert.equal(Crypto.timingSafeEqual(a, a), true);
    });

    it("returns true for equal but distinct byte arrays", () => {
      const a = new Uint8Array([10, 20, 30]);
      const b = new Uint8Array([10, 20, 30]);
      assert.equal(Crypto.timingSafeEqual(a, b), true);
    });

    it("returns false for different byte arrays", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      assert.equal(Crypto.timingSafeEqual(a, b), false);
    });

    it("returns false for different lengths", () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      assert.equal(Crypto.timingSafeEqual(a, b), false);
    });

    it("returns true for two empty arrays", () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);
      assert.equal(Crypto.timingSafeEqual(a, b), true);
    });
  });
});

// =============================================================================
// 2. Url
// =============================================================================

describe("Url", () => {
  describe("Url.parse()", () => {
    it("parses a valid URL and returns Ok(URL)", () => {
      const result = Url.parse("https://example.com/path?q=1");
      assert.equal(result.isOk, true);
      assert.equal(result.value.hostname, "example.com");
      assert.equal(result.value.pathname, "/path");
      assert.equal(result.value.searchParams.get("q"), "1");
    });

    it("returns Err(UrlError) for invalid URL", () => {
      const result = Url.parse("not a url");
      assert.equal(result.isErr, true);
      assert.equal(UrlError.is(result.error), true);
    });

    it("parses a relative URL with base", () => {
      const result = Url.parse("/path", "https://example.com");
      assert.equal(result.isOk, true);
      assert.equal(result.value.href, "https://example.com/path");
    });

    it("returns Err for empty string", () => {
      const result = Url.parse("");
      assert.equal(result.isErr, true);
    });

    it("parses URL with port and fragment", () => {
      const result = Url.parse("https://example.com:8080/api#section");
      assert.equal(result.isOk, true);
      assert.equal(result.value.port, "8080");
      assert.equal(result.value.hash, "#section");
    });
  });

  describe("Url.searchParams()", () => {
    it("builds query string from object", () => {
      const qs = Url.searchParams({ q: "1", page: "2" });
      // URLSearchParams may order keys by insertion order
      assert.ok(qs.includes("q=1"));
      assert.ok(qs.includes("page=2"));
    });

    it("returns empty string for empty object", () => {
      const qs = Url.searchParams({});
      assert.equal(qs, "");
    });

    it("encodes special characters", () => {
      const qs = Url.searchParams({ q: "hello world" });
      assert.ok(qs.includes("hello+world") || qs.includes("hello%20world"));
    });
  });

  describe("Url.parseSearchParams()", () => {
    it("parses a query string into an object", () => {
      const result = Url.parseSearchParams("q=1&page=2");
      assert.deepEqual(result, { q: "1", page: "2" });
    });

    it("strips leading ? from query string", () => {
      const result = Url.parseSearchParams("?q=1");
      assert.deepEqual(result, { q: "1" });
    });

    it("returns empty object for empty string", () => {
      const result = Url.parseSearchParams("");
      assert.deepEqual(result, {});
    });

    it("handles URL-encoded values", () => {
      const result = Url.parseSearchParams("name=John+Doe&city=New%20York");
      assert.equal(result.name, "John Doe");
      assert.equal(result.city, "New York");
    });
  });
});

// =============================================================================
// 3. Encoding
// =============================================================================

describe("Encoding", () => {
  describe("Encoding.base64", () => {
    it("encodes bytes to base64 string", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      assert.equal(Encoding.base64.encode(bytes), "SGVsbG8=");
    });

    it("decodes base64 string to Ok(Uint8Array)", () => {
      const result = Encoding.base64.decode("SGVsbG8=");
      assert.equal(result.isOk, true);
      assert.deepEqual(Array.from(result.value), [72, 101, 108, 108, 111]);
    });

    it("returns Err(EncodingError) for invalid base64", () => {
      const result = Encoding.base64.decode("!!!invalid!!!");
      assert.equal(result.isErr, true);
      assert.equal(EncodingError.is(result.error), true);
    });

    it("roundtrip: encode then decode produces original bytes", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = Encoding.base64.encode(original);
      const decoded = Encoding.base64.decode(encoded);
      assert.equal(decoded.isOk, true);
      assert.deepEqual(Array.from(decoded.value), Array.from(original));
    });

    it("handles empty input", () => {
      const encoded = Encoding.base64.encode(new Uint8Array([]));
      assert.equal(encoded, "");
      const decoded = Encoding.base64.decode("");
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value.length, 0);
    });
  });

  describe("Encoding.hex", () => {
    it("encodes bytes to lowercase hex string", () => {
      const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      assert.equal(Encoding.hex.encode(bytes), "deadbeef");
    });

    it("decodes hex string to Ok(Uint8Array)", () => {
      const result = Encoding.hex.decode("deadbeef");
      assert.equal(result.isOk, true);
      assert.deepEqual(Array.from(result.value), [0xde, 0xad, 0xbe, 0xef]);
    });

    it("returns Err for invalid hex characters", () => {
      const result = Encoding.hex.decode("xyz");
      assert.equal(result.isErr, true);
      assert.equal(EncodingError.is(result.error), true);
    });

    it("returns Err for odd-length hex string", () => {
      const result = Encoding.hex.decode("abc");
      assert.equal(result.isErr, true);
      assert.ok(result.error.message.includes("even length"));
    });

    it("roundtrip: encode then decode", () => {
      const original = new Uint8Array([0, 15, 16, 255]);
      const hex = Encoding.hex.encode(original);
      const decoded = Encoding.hex.decode(hex);
      assert.equal(decoded.isOk, true);
      assert.deepEqual(Array.from(decoded.value), Array.from(original));
    });

    it("handles empty input", () => {
      assert.equal(Encoding.hex.encode(new Uint8Array([])), "");
      const decoded = Encoding.hex.decode("");
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value.length, 0);
    });
  });

  describe("Encoding.utf8", () => {
    it("encodes a string to Uint8Array", () => {
      const result = Encoding.utf8.encode("Hello");
      assert.ok(result instanceof Uint8Array);
      assert.deepEqual(Array.from(result), [72, 101, 108, 108, 111]);
    });

    it("decodes Uint8Array to Ok(string)", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]);
      const result = Encoding.utf8.decode(bytes);
      assert.equal(result.isOk, true);
      assert.equal(result.value, "Hello");
    });

    it("roundtrip: encode then decode", () => {
      const original = "Hello, world! Unicode: \u00e9\u00e0\u00fc";
      const bytes = Encoding.utf8.encode(original);
      const decoded = Encoding.utf8.decode(bytes);
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, original);
    });

    it("handles empty string", () => {
      const bytes = Encoding.utf8.encode("");
      assert.equal(bytes.length, 0);
      const decoded = Encoding.utf8.decode(new Uint8Array([]));
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, "");
    });

    it("handles multi-byte characters", () => {
      const bytes = Encoding.utf8.encode("\u{1F600}"); // emoji
      assert.ok(bytes.length > 1);
      const decoded = Encoding.utf8.decode(bytes);
      assert.equal(decoded.isOk, true);
      assert.equal(decoded.value, "\u{1F600}");
    });
  });
});

// =============================================================================
// 4. Clone
// =============================================================================

describe("Clone", () => {
  describe("Clone.deep()", () => {
    it("deeply clones a plain object", () => {
      const original = { a: 1, b: [2, 3] };
      const result = Clone.deep(original);
      assert.equal(result.isOk, true);
      assert.deepEqual(result.value, original);
    });

    it("produces a distinct object (mutations do not affect original)", () => {
      const original = { a: 1, b: [2, 3] };
      const result = Clone.deep(original);
      assert.equal(result.isOk, true);
      result.value.a = 999;
      result.value.b.push(999);
      assert.equal(original.a, 1);
      assert.deepEqual(original.b, [2, 3]);
    });

    it("works for primitives", () => {
      const result = Clone.deep(42);
      assert.equal(result.isOk, true);
      assert.equal(result.value, 42);
    });

    it("works for strings", () => {
      const result = Clone.deep("hello");
      assert.equal(result.isOk, true);
      assert.equal(result.value, "hello");
    });

    it("works for null", () => {
      const result = Clone.deep(null);
      assert.equal(result.isOk, true);
      assert.equal(result.value, null);
    });

    it("works for dates", () => {
      const original = new Date("2024-01-01T00:00:00Z");
      const result = Clone.deep(original);
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Date);
      assert.equal(result.value.toISOString(), original.toISOString());
      // Verify it is a distinct Date instance
      assert.notEqual(result.value, original);
    });

    it("deeply clones nested structures", () => {
      const original = { x: { y: { z: [1, 2, 3] } } };
      const result = Clone.deep(original);
      assert.equal(result.isOk, true);
      result.value.x.y.z.push(4);
      assert.deepEqual(original.x.y.z, [1, 2, 3]);
    });

    it("returns Err(CloneError) for objects with function properties", () => {
      const obj = { fn: () => undefined };
      const result = Clone.deep(obj);
      assert.equal(result.isErr, true);
      assert.equal(CloneError.is(result.error), true);
    });

    it("works for arrays", () => {
      const original = [1, [2, 3], { a: 4 }];
      const result = Clone.deep(original);
      assert.equal(result.isOk, true);
      assert.deepEqual(result.value, original);
    });
  });
});

// =============================================================================
// 5. Compression
// =============================================================================

describe("Compression", () => {
  const te = new TextEncoder();
  const td = new TextDecoder();

  describe("gzip/gunzip", () => {
    it("gzip returns Ok(Uint8Array)", async () => {
      const data = te.encode("hello world");
      const result = await Compression.gzip(data).run();
      assert.equal(result.isOk, true);
      assert.ok(result.value instanceof Uint8Array);
    });

    it("compressed data differs from input", async () => {
      const data = te.encode("hello world");
      const result = await Compression.gzip(data).run();
      assert.equal(result.isOk, true);
      assert.notDeepEqual(Array.from(result.value), Array.from(data));
    });

    it("roundtrip: gzip then gunzip restores original data", async () => {
      const data = te.encode("hello world");
      const compressed = await Compression.gzip(data).run();
      assert.equal(compressed.isOk, true);
      const decompressed = await Compression.gunzip(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(td.decode(decompressed.value), "hello world");
    });

    it("works with empty data", async () => {
      const data = new Uint8Array([]);
      const compressed = await Compression.gzip(data).run();
      assert.equal(compressed.isOk, true);
      const decompressed = await Compression.gunzip(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(decompressed.value.length, 0);
    });

    it("works with larger data", async () => {
      const text = "The quick brown fox jumps over the lazy dog. ".repeat(1000);
      const data = te.encode(text);
      const compressed = await Compression.gzip(data).run();
      assert.equal(compressed.isOk, true);
      // Compressed should be significantly smaller than input for repetitive data
      assert.ok(compressed.value.length < data.length);
      const decompressed = await Compression.gunzip(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(td.decode(decompressed.value), text);
    });
  });

  describe("deflate/inflate", () => {
    it("roundtrip: deflate then inflate restores original data", async () => {
      const data = te.encode("compress me with deflate");
      const compressed = await Compression.deflate(data).run();
      assert.equal(compressed.isOk, true);
      assert.ok(compressed.value instanceof Uint8Array);
      const decompressed = await Compression.inflate(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(td.decode(decompressed.value), "compress me with deflate");
    });

    it("works with empty data", async () => {
      const data = new Uint8Array([]);
      const compressed = await Compression.deflate(data).run();
      assert.equal(compressed.isOk, true);
      const decompressed = await Compression.inflate(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(decompressed.value.length, 0);
    });

    it("works with larger data", async () => {
      const text = "ABCDEFGHIJ".repeat(1000);
      const data = te.encode(text);
      const compressed = await Compression.deflate(data).run();
      assert.equal(compressed.isOk, true);
      assert.ok(compressed.value.length < data.length);
      const decompressed = await Compression.inflate(compressed.value).run();
      assert.equal(decompressed.isOk, true);
      assert.equal(td.decode(decompressed.value), text);
    });
  });
});

// =============================================================================
// 6. Timer
// =============================================================================

describe("Timer", () => {
  describe("Timer.sleep()", () => {
    it("resolves Ok(undefined) after the given duration", async () => {
      const start = Date.now();
      const result = await Timer.sleep(Duration.milliseconds(10)).run();
      const elapsed = Date.now() - start;
      assert.equal(result.isOk, true);
      assert.equal(result.value, undefined);
      assert.ok(elapsed >= 5, `Expected at least 5ms, got ${elapsed}ms`);
    });
  });

  describe("Timer.now()", () => {
    it("returns a number greater than 0", () => {
      const t = Timer.now();
      assert.equal(typeof t, "number");
      assert.ok(t > 0);
    });

    it("subsequent calls are non-decreasing", () => {
      const a = Timer.now();
      const b = Timer.now();
      assert.ok(b >= a);
    });
  });

  describe("Timer.delay()", () => {
    it("runs task after the specified delay", async () => {
      const task = { run: () => Promise.resolve(Ok(42)) };
      const start = Date.now();
      const result = await Timer.delay(Duration.milliseconds(10), task).run();
      const elapsed = Date.now() - start;
      assert.equal(result.isOk, true);
      assert.equal(result.value, 42);
      assert.ok(elapsed >= 5, `Expected at least 5ms, got ${elapsed}ms`);
    });
  });

  describe("Timer.deadline()", () => {
    it("succeeds if task completes before deadline", async () => {
      const fastTask = { run: () => Promise.resolve(Ok("done")) };
      const result = await Timer.deadline(Duration.milliseconds(50), fastTask).run();
      assert.equal(result.isOk, true);
      assert.equal(result.value, "done");
    });

    it("returns Err(TimeoutError) if task exceeds deadline", async () => {
      const slowTask = {
        run: () => new Promise(r => setTimeout(() => r(Ok("late")), 200)),
      };
      const result = await Timer.deadline(Duration.milliseconds(10), slowTask).run();
      assert.equal(result.isErr, true);
      assert.equal(TimeoutError.is(result.error), true);
      assert.ok(result.error.message.includes("exceeded"));
    });
  });

  describe("Timer.interval()", () => {
    it("returns an object with take and collect methods", () => {
      const stream = Timer.interval(Duration.milliseconds(10));
      assert.equal(typeof stream.take, "function");
      assert.equal(typeof stream.collect, "function");
    });
  });
});
