/**
 * web-smoke.mjs - Smoke test for pure and web-standard modules.
 *
 * Tests modules that require no runtime-specific APIs: core (Result, Option,
 * pipe, Match, etc.), data (Schema, Codec, Record, List), async (Task, Stream),
 * and web (Json, Crypto, Encoding, Compression, Url, Timer, Client).
 *
 * Designed to run in restricted environments: Cloudflare Workers (miniflare)
 * and browsers (Playwright). Uses only console.log for output.
 *
 * Run directly:    node tests/web-smoke.mjs
 * Via miniflare:   see tests/workers/worker.mjs
 * Via Playwright:  see tests/browser/browser.test.mjs
 */

// This file is imported by worker.mjs and browser test, or run directly via Node.
// When imported, it exports runWebSmoke(). When run directly, it self-executes.

export async function runWebSmoke(lib) {
  let passed = 0;
  let failed = 0;
  const logs = [];

  const log = msg => logs.push(msg);
  const assert = (condition, message) => {
    if (!condition) {
      log(`  FAIL: ${message}`);
      failed++;
    } else {
      log(`  ok: ${message}`);
      passed++;
    }
  };
  const section = name => log(`\n--- ${name} ---`);

  const {
    Ok,
    Err,
    Some,
    None,
    Result,
    Option,
    pipe,
    flow,
    Match,
    Eq,
    Ord,
    State,
    Lens,
    Record,
    List,
    NonEmptyList,
    Schema,
    Codec,
    ErrType,
    Duration,
    Task,
    Stream,
    Lazy,
    Retry,
    Semaphore,
    Mutex,
    Cache,
    Channel,
    Json,
    Encoding,
    Url,
  } = lib;

  // ── Core: Result ──────────────────────────────────────────────────────

  section("Result");
  {
    const ok = Ok(42);
    assert(ok.isOk === true, "Ok(42).isOk");
    assert(ok.value === 42, "Ok(42).value === 42");

    const err = Err("fail");
    assert(err.isErr === true, "Err.isErr");
    assert(err.error === "fail", "Err.error === 'fail'");

    const mapped = ok.map(x => x * 2);
    assert(mapped.isOk && mapped.value === 84, "Ok.map doubles value");

    const chained = ok.flatMap(x => Ok(x + 1));
    assert(chained.isOk && chained.value === 43, "Ok.flatMap chains");

    const errMap = err.map(x => x);
    assert(errMap.isErr, "Err.map stays Err");
  }

  // ── Core: Option ──────────────────────────────────────────────────────

  section("Option");
  {
    const some = Some(10);
    assert(some.isSome === true, "Some(10).isSome");
    assert(some.unwrap() === 10, "Some(10).unwrap() === 10");

    const none = None;
    assert(none.isNone === true, "None.isNone");

    const mapped = some.map(x => x + 5);
    assert(mapped.isSome && mapped.unwrap() === 15, "Some.map adds 5");
  }

  // ── Core: pipe / flow ────────────────────────────────────────────────

  section("pipe / flow");
  {
    const result = pipe(
      5,
      x => x * 2,
      x => x + 1,
    );
    assert(result === 11, "pipe(5, *2, +1) === 11");

    const fn = flow(
      x => x * 3,
      x => x - 1,
    );
    assert(fn(4) === 11, "flow(*3, -1)(4) === 11");
  }

  // ── Core: Match ───────────────────────────────────────────────────────

  section("Match");
  {
    const val = Match(2)
      .when(
        v => v === 2,
        () => "two",
      )
      .otherwise(() => "other");
    assert(val === "two", "Match(2) returns 'two'");
  }

  // ── Core: Eq / Ord ───────────────────────────────────────────────────

  section("Eq / Ord");
  {
    const numEq = Eq.fromEquals((a, b) => a === b);
    assert(numEq.equals(1, 1) === true, "Eq: 1 equals 1");
    assert(numEq.equals(1, 2) === false, "Eq: 1 not equals 2");

    const numOrd = Ord.fromCompare((a, b) => a - b);
    assert(numOrd.compare(1, 2) < 0, "Ord: 1 < 2");
    assert(numOrd.compare(2, 1) > 0, "Ord: 2 > 1");
  }

  // ── Data: Schema ──────────────────────────────────────────────────────

  section("Schema");
  {
    const numSchema = Schema.number;
    const valid = numSchema.parse(42);
    assert(valid.isOk && valid.value === 42, "Schema.number parses 42");

    const invalid = numSchema.parse("not a number");
    assert(invalid.isErr, "Schema.number rejects string");

    const strSchema = Schema.string;
    const strValid = strSchema.parse("hello");
    assert(strValid.isOk && strValid.value === "hello", "Schema.string parses 'hello'");
  }

  // ── Data: Record / List ───────────────────────────────────────────────

  section("Record / List");
  {
    const rec = Record({ name: "test", age: 25 });
    assert(rec.name === "test", "Record.name === 'test'");
    assert(rec.age === 25, "Record.age === 25");

    const updated = rec.produce(d => {
      d.age = 26;
    });
    assert(updated.age === 26, "Record.produce returns updated copy");
    assert(rec.age === 25, "Original unchanged");

    const list = List([1, 2, 3]);
    assert(list.length === 3, "List length is 3");
    const mapped = list.map(x => x * 2);
    assert(mapped[0] === 2, "List.map doubles first element");
  }

  // ── Data: Duration ────────────────────────────────────────────────────

  section("Duration");
  {
    const ms = Duration.seconds(90);
    assert(ms === 90000, "Duration.seconds(90) === 90000");
    const back = Duration.toSeconds(ms);
    assert(back === 90, "Duration.toSeconds(90000) === 90");
  }

  // ── Async: Task ───────────────────────────────────────────────────────

  section("Task");
  {
    const task = Task.of(42);
    const result = await task.run();
    assert(result.isOk && result.value === 42, "Task.of(42) resolves to Ok(42)");

    const mapped = Task.of(10).map(x => x + 5);
    const mapResult = await mapped.run();
    assert(mapResult.isOk && mapResult.value === 15, "Task.map adds 5");

    const failed = Task.fromResult(Err("err"));
    const failResult = await failed.run();
    assert(failResult.isErr && failResult.error === "err", "Task.fromResult(Err) produces Err");
  }

  // ── Async: Stream ─────────────────────────────────────────────────────

  section("Stream");
  {
    const s = Stream.of(1, 2, 3);
    const result = await s.collect().run();
    assert(result.isOk, "Stream.of collects Ok");
    assert(result.value.length === 3, "Stream.of(1,2,3) has 3 elements");

    const filtered = Stream.of(1, 2, 3, 4).filter(x => x % 2 === 0);
    const fResult = await filtered.collect().run();
    assert(fResult.isOk && fResult.value.length === 2, "Stream.filter keeps even numbers");
  }

  // ── IO: Json ──────────────────────────────────────────────────────────

  section("Json");
  {
    const parsed = Json.parse('{"a":1}');
    assert(parsed.isOk, "Json.parse succeeds");
    assert(parsed.value.a === 1, "Json.parse returns correct value");

    const invalid = Json.parse("{bad}");
    assert(invalid.isErr, "Json.parse rejects invalid JSON");

    const str = Json.stringify({ b: 2 });
    assert(str.isOk && str.value === '{"b":2}', "Json.stringify works");
  }

  // ── IO: Encoding ──────────────────────────────────────────────────────

  section("Encoding");
  {
    const bytes = Encoding.utf8.encode("hello");
    assert(bytes instanceof Uint8Array, "Encoding.utf8.encode returns Uint8Array");
    assert(bytes.length === 5, "Encoding.utf8.encode('hello') is 5 bytes");

    const decoded = Encoding.utf8.decode(bytes);
    assert(decoded.isOk && decoded.value === "hello", "Encoding.utf8.decode roundtrips");

    const b64 = Encoding.base64.encode(bytes);
    assert(typeof b64 === "string", "Encoding.base64.encode returns string");

    const b64decoded = Encoding.base64.decode(b64);
    assert(b64decoded.isOk, "Encoding.base64.decode succeeds");

    const hex = Encoding.hex.encode(bytes);
    assert(hex === "68656c6c6f", "Encoding.hex.encode('hello') is correct");

    const hexDecoded = Encoding.hex.decode(hex);
    assert(hexDecoded.isOk, "Encoding.hex.decode succeeds");
  }

  // ── IO: Url ───────────────────────────────────────────────────────────

  section("Url");
  {
    const parsed = Url.parse("https://example.com/path?q=1");
    assert(parsed.isOk, "Url.parse succeeds");
    assert(parsed.value.hostname === "example.com", "Url.parse extracts hostname");
    assert(parsed.value.pathname === "/path", "Url.parse extracts pathname");

    const invalid = Url.parse("not a url");
    assert(invalid.isErr, "Url.parse rejects invalid URL");
  }

  // ── Summary ───────────────────────────────────────────────────────────

  log(`\n========================================`);
  log(`Web smoke test: ${passed} passed, ${failed} failed`);
  log(`========================================`);

  return { passed, failed, logs };
}

// Self-execute when run directly (Node/Deno/Bun)
if (typeof process !== "undefined" || typeof Deno !== "undefined") {
  const lib = await import("../dist/index.js");
  const { passed, failed, logs } = await runWebSmoke(lib);
  for (const line of logs) {
    console.log(line);
  }
  if (failed > 0) {
    process.exit(1);
  }
}
