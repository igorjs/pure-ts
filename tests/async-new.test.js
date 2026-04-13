/**
 * async-new.test.js - Tests for new async modules: Stream, Retry, CircuitBreaker,
 * Semaphore, Mutex, RateLimiter, Cache, Channel, Env.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output, not the source.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  Stream,
  Retry,
  CircuitBreaker,
  CircuitOpen,
  Semaphore,
  Mutex,
  RateLimiter,
  RateLimited,
  Cache,
  Channel,
  Env,
  Ok,
  Err,
  Some,
  None,
  Duration,
  Task,
  StateMachine,
  InvalidTransition,
} = await import("../dist/index.js");

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Create a minimal Task-like from an async function returning Result. */
const mkTask = fn => ({ run: fn });

// =============================================================================
// 1. Stream
// =============================================================================

describe("Stream", () => {
  describe("Stream.of", () => {
    it("creates a stream from values and collect returns Ok array", async () => {
      const result = await Stream.of(1, 2, 3).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
    });

    it("handles a single value", async () => {
      const result = await Stream.of(42).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [42]);
    });

    it("handles no values (empty variadic)", async () => {
      const result = await Stream.of().collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe("Stream.fromArray", () => {
    it("creates a stream from an array", async () => {
      const result = await Stream.fromArray([10, 20, 30]).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [10, 20, 30]);
    });

    it("handles empty array", async () => {
      const result = await Stream.fromArray([]).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe("Stream.empty", () => {
    it("collect returns Ok([])", async () => {
      const result = await Stream.empty().collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe("Stream.unfold", () => {
    it("generates a finite sequence and terminates on None", async () => {
      const result = await Stream.unfold(0, n => (n < 5 ? Some([n, n + 1]) : None))
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [0, 1, 2, 3, 4]);
    });

    it("produces empty stream when seed immediately returns None", async () => {
      const result = await Stream.unfold(0, () => None)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe(".map", () => {
    it("transforms each value", async () => {
      const result = await Stream.of(1, 2, 3)
        .map(n => n * 10)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [10, 20, 30]);
    });
  });

  describe(".filter", () => {
    it("keeps matching values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5)
        .filter(n => n % 2 === 0)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [2, 4]);
    });

    it("returns empty when nothing matches", async () => {
      const result = await Stream.of(1, 3, 5)
        .filter(n => n % 2 === 0)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe(".take", () => {
    it("limits count to n values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).take(3).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
    });

    it("returns all values when n exceeds stream length", async () => {
      const result = await Stream.of(1, 2).take(10).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2]);
    });

    it("returns empty when taking 0", async () => {
      const result = await Stream.of(1, 2, 3).take(0).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe(".drop", () => {
    it("skips first n values", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).drop(2).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [3, 4, 5]);
    });

    it("returns empty when dropping more than available", async () => {
      const result = await Stream.of(1, 2).drop(10).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });

    it("returns all when dropping 0", async () => {
      const result = await Stream.of(1, 2, 3).drop(0).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
    });
  });

  describe(".takeWhile", () => {
    it("stops on first false predicate", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5)
        .takeWhile(n => n < 4)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
    });

    it("returns all when predicate never fails", async () => {
      const result = await Stream.of(1, 2, 3)
        .takeWhile(() => true)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
    });

    it("returns empty when predicate fails immediately", async () => {
      const result = await Stream.of(1, 2, 3)
        .takeWhile(() => false)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe(".chunk", () => {
    it("groups into fixed-size chunks", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5, 6).chunk(2).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [
        [1, 2],
        [3, 4],
        [5, 6],
      ]);
    });

    it("handles remainder when stream length is not divisible by chunk size", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).chunk(3).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [
        [1, 2, 3],
        [4, 5],
      ]);
    });

    it("handles chunk size larger than stream", async () => {
      const result = await Stream.of(1, 2).chunk(10).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [[1, 2]]);
    });
  });

  describe(".tap", () => {
    it("runs side effect without changing values", async () => {
      const tapped = [];
      const result = await Stream.of(1, 2, 3)
        .tap(v => tapped.push(v))
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3]);
      assert.deepEqual(tapped, [1, 2, 3]);
    });
  });

  describe(".mapErr", () => {
    it("transforms error values in the stream", async () => {
      const errStream = Stream(async function* () {
        yield Ok(1);
        yield Err("oops");
      });
      const result = await errStream
        .mapErr(e => `wrapped: ${e}`)
        .collect()
        .run();
      assert.equal(result.isErr, true);
      assert.equal(result.unwrapErr(), "wrapped: oops");
    });
  });

  describe(".flatMap", () => {
    it("flattens nested streams", async () => {
      const result = await Stream.of(1, 2, 3)
        .flatMap(n => Stream.of(n, n * 10))
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 10, 2, 20, 3, 30]);
    });

    it("handles empty inner streams", async () => {
      const result = await Stream.of(1, 2, 3)
        .flatMap(() => Stream.empty())
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });
  });

  describe(".concat", () => {
    it("concatenates two streams sequentially", async () => {
      const a = Stream.of(1, 2);
      const b = Stream.of(3, 4);
      const result = await a.concat(b).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2, 3, 4]);
    });

    it("concatenates with empty stream", async () => {
      const result = await Stream.of(1, 2).concat(Stream.empty()).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 2]);
    });
  });

  describe(".zip", () => {
    it("pairs elements 1:1", async () => {
      const result = await Stream.of(1, 2, 3)
        .zip(Stream.of("a", "b", "c"))
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [
        [1, "a"],
        [2, "b"],
        [3, "c"],
      ]);
    });

    it("stops at shorter stream (left shorter)", async () => {
      const result = await Stream.of(1, 2)
        .zip(Stream.of("a", "b", "c"))
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [
        [1, "a"],
        [2, "b"],
      ]);
    });

    it("stops at shorter stream (right shorter)", async () => {
      const result = await Stream.of(1, 2, 3).zip(Stream.of("a")).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [[1, "a"]]);
    });
  });

  describe(".window", () => {
    it("produces sliding windows with correct overlap", async () => {
      const result = await Stream.of(1, 2, 3, 4, 5).window(3).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [
        [1, 2, 3],
        [2, 3, 4],
        [3, 4, 5],
      ]);
    });

    it("returns empty when stream is shorter than window size", async () => {
      const result = await Stream.of(1, 2).window(5).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), []);
    });

    it("window of 1 returns each element individually", async () => {
      const result = await Stream.of(1, 2, 3).window(1).collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [[1], [2], [3]]);
    });
  });

  describe(".scan", () => {
    it("produces intermediate accumulated values", async () => {
      const result = await Stream.of(1, 2, 3, 4)
        .scan((acc, v) => acc + v, 0)
        .collect()
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), [1, 3, 6, 10]);
    });
  });

  describe(".groupBy", () => {
    it("collects into keyed record", async () => {
      const result = await Stream.of(
        { type: "fruit", name: "apple" },
        { type: "veggie", name: "carrot" },
        { type: "fruit", name: "banana" },
        { type: "veggie", name: "pea" },
      )
        .groupBy(item => item.type)
        .run();
      assert.equal(result.isOk, true);
      const groups = result.unwrap();
      assert.deepEqual(groups.fruit, [
        { type: "fruit", name: "apple" },
        { type: "fruit", name: "banana" },
      ]);
      assert.deepEqual(groups.veggie, [
        { type: "veggie", name: "carrot" },
        { type: "veggie", name: "pea" },
      ]);
    });
  });

  describe(".collect", () => {
    it("gathers all values into array", async () => {
      const result = await Stream.of("a", "b", "c").collect().run();
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), ["a", "b", "c"]);
    });

    it("short-circuits on error", async () => {
      const s = Stream(async function* () {
        yield Ok(1);
        yield Err("fail");
        yield Ok(3);
      });
      const result = await s.collect().run();
      assert.equal(result.isErr, true);
      assert.equal(result.unwrapErr(), "fail");
    });
  });

  describe(".forEach", () => {
    it("runs side effect on each value", async () => {
      const values = [];
      const result = await Stream.of(1, 2, 3)
        .forEach(v => {
          values.push(v);
        })
        .run();
      assert.equal(result.isOk, true);
      assert.deepEqual(values, [1, 2, 3]);
    });

    it("short-circuits on error", async () => {
      const values = [];
      const s = Stream(async function* () {
        yield Ok(1);
        yield Err("stop");
        yield Ok(3);
      });
      const result = await s
        .forEach(v => {
          values.push(v);
        })
        .run();
      assert.equal(result.isErr, true);
      assert.deepEqual(values, [1]);
    });
  });

  describe(".reduce", () => {
    it("folds to a single value", async () => {
      const result = await Stream.of(1, 2, 3, 4)
        .reduce((acc, v) => acc + v, 0)
        .run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), 10);
    });

    it("returns init for empty stream", async () => {
      const result = await Stream.empty()
        .reduce((acc, v) => acc + v, 42)
        .run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), 42);
    });
  });

  describe(".first", () => {
    it("returns Some(first element) for non-empty stream", async () => {
      const result = await Stream.of(10, 20, 30).first().run();
      assert.equal(result.isOk, true);
      const opt = result.unwrap();
      assert.equal(opt.isSome, true);
      assert.equal(opt.unwrap(), 10);
    });

    it("returns None for empty stream", async () => {
      const result = await Stream.empty().first().run();
      assert.equal(result.isOk, true);
      const opt = result.unwrap();
      assert.equal(opt.isNone, true);
    });
  });
});

// =============================================================================
// 2. Retry
// =============================================================================

describe("Retry", () => {
  describe("Retry.policy() builder", () => {
    it("builds a policy with maxAttempts, delay, exponentialBackoff, jitter", () => {
      const policy = Retry.policy()
        .maxAttempts(5)
        .exponentialBackoff(Duration.milliseconds(10))
        .jitter()
        .build();

      assert.equal(policy.maxAttempts, 5);
      assert.equal(policy.backoff, "exponential");
      assert.equal(policy.jitter, true);
    });

    it("defaults to 3 maxAttempts, fixed backoff, no jitter", () => {
      const policy = Retry.policy().build();
      assert.equal(policy.maxAttempts, 3);
      assert.equal(policy.backoff, "fixed");
      assert.equal(policy.jitter, false);
    });
  });

  describe("Retry.fixed", () => {
    it("creates a fixed policy with specified attempts and delay", () => {
      const policy = Retry.fixed(4, Duration.milliseconds(50));
      assert.equal(policy.maxAttempts, 4);
      assert.equal(policy.backoff, "fixed");
      assert.equal(policy.jitter, false);
    });
  });

  describe("Retry.exponential", () => {
    it("creates an exponential policy", () => {
      const policy = Retry.exponential(3, Duration.milliseconds(10));
      assert.equal(policy.maxAttempts, 3);
      assert.equal(policy.backoff, "exponential");
    });
  });

  describe("Retry.apply", () => {
    it("retries on failure and succeeds when task eventually succeeds", async () => {
      let attempts = 0;
      const flaky = mkTask(async () => {
        attempts++;
        if (attempts < 3) return Err("not yet");
        return Ok("done");
      });

      const policy = Retry.fixed(5, Duration.milliseconds(1));
      const result = await Retry.apply(policy, flaky).run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "done");
      assert.equal(attempts, 3);
    });

    it("stops after maxAttempts and returns last error", async () => {
      let attempts = 0;
      const failing = mkTask(async () => {
        attempts++;
        return Err(`fail-${attempts}`);
      });

      const policy = Retry.fixed(3, Duration.milliseconds(1));
      const result = await Retry.apply(policy, failing).run();
      assert.equal(result.isErr, true);
      assert.equal(result.unwrapErr(), "fail-3");
      assert.equal(attempts, 3);
    });

    it("does not retry when first attempt succeeds", async () => {
      let attempts = 0;
      const ok = mkTask(async () => {
        attempts++;
        return Ok("first try");
      });

      const policy = Retry.fixed(5, Duration.milliseconds(1));
      const result = await Retry.apply(policy, ok).run();
      assert.equal(result.isOk, true);
      assert.equal(attempts, 1);
    });
  });

  describe("Retry.withPolicy", () => {
    it("curried version works the same as apply", async () => {
      let attempts = 0;
      const flaky = mkTask(async () => {
        attempts++;
        if (attempts < 2) return Err("not yet");
        return Ok("ok");
      });

      const policy = Retry.fixed(3, Duration.milliseconds(1));
      const withRetry = Retry.withPolicy(policy);
      const result = await withRetry(flaky).run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "ok");
      assert.equal(attempts, 2);
    });
  });
});

// =============================================================================
// 3. CircuitBreaker
// =============================================================================

describe("CircuitBreaker", () => {
  it("starts in closed state", () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 3,
      successThreshold: 1,
      timeout: Duration.milliseconds(50),
    });
    assert.equal(cb.state(), "closed");
  });

  it("transitions to open after failureThreshold failures", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 2,
      successThreshold: 1,
      timeout: Duration.milliseconds(50),
    });

    const failing = mkTask(async () => Err("fail"));

    await cb.protect(failing).run();
    assert.equal(cb.state(), "closed");

    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");
  });

  it("rejects requests when open with CircuitOpen error", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(100),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    const succeeding = mkTask(async () => Ok("should not run"));
    const result = await cb.protect(succeeding).run();
    assert.equal(result.isErr, true);
    assert.equal(CircuitOpen.is(result.unwrapErr()), true);
    assert.equal(result.unwrapErr().tag, "CircuitOpen");
  });

  it("transitions to half-open after timeout", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    await sleep(50);
    assert.equal(cb.state(), "half-open");
  });

  it("closes after successThreshold successes in half-open", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 2,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    await sleep(50);
    // Now half-open: two successes needed
    const succeeding = mkTask(async () => Ok("ok"));
    await cb.protect(succeeding).run();
    // After one success, still half-open (need 2)
    // state() itself also checks for transition, but internal state tracks successCount
    await cb.protect(succeeding).run();
    assert.equal(cb.state(), "closed");
  });

  it("reopens on failure in half-open", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 2,
      timeout: Duration.milliseconds(30),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    await sleep(50);
    assert.equal(cb.state(), "half-open");

    // Fail in half-open -> reopens
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");
  });

  it(".reset() returns to closed", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 1,
      successThreshold: 1,
      timeout: Duration.milliseconds(1000),
    });

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    cb.reset();
    assert.equal(cb.state(), "closed");

    // After reset, requests pass through again
    const succeeding = mkTask(async () => Ok("ok"));
    const result = await cb.protect(succeeding).run();
    assert.equal(result.isOk, true);
    assert.equal(result.unwrap(), "ok");
  });

  it(".state() reflects current state accurately", async () => {
    const cb = CircuitBreaker.create({
      failureThreshold: 2,
      successThreshold: 1,
      timeout: Duration.milliseconds(30),
    });

    assert.equal(cb.state(), "closed");

    const failing = mkTask(async () => Err("fail"));
    await cb.protect(failing).run();
    assert.equal(cb.state(), "closed");

    await cb.protect(failing).run();
    assert.equal(cb.state(), "open");

    await sleep(50);
    assert.equal(cb.state(), "half-open");

    const succeeding = mkTask(async () => Ok("ok"));
    await cb.protect(succeeding).run();
    assert.equal(cb.state(), "closed");
  });
});

// =============================================================================
// 4. Semaphore / Mutex
// =============================================================================

describe("Semaphore", () => {
  it("allows n concurrent tasks", async () => {
    const sem = Semaphore.create(2);
    assert.equal(sem.available(), 2);
    assert.equal(sem.pending(), 0);

    const r1 = await sem.acquire();
    assert.equal(sem.available(), 1);
    const r2 = await sem.acquire();
    assert.equal(sem.available(), 0);

    r1();
    assert.equal(sem.available(), 1);
    r2();
    assert.equal(sem.available(), 2);
  });

  it("blocks the n+1th acquire until a permit is released", async () => {
    const sem = Semaphore.create(1);
    const order = [];

    const r1 = await sem.acquire();
    order.push("acquired-1");

    // Second acquire should block
    const p2 = sem.acquire().then(release => {
      order.push("acquired-2");
      return release;
    });

    // Let microtasks settle
    await sleep(5);
    assert.equal(order.length, 1);
    assert.equal(sem.pending(), 1);

    // Release first permit
    r1();
    const r2 = await p2;
    assert.equal(order.length, 2);
    assert.deepEqual(order, ["acquired-1", "acquired-2"]);
    r2();
  });

  describe(".wrap", () => {
    it("acquires before run and releases after completion", async () => {
      const sem = Semaphore.create(1);
      let running = 0;
      let maxRunning = 0;

      const tasks = Array.from({ length: 3 }, (_, i) =>
        sem.wrap(
          mkTask(async () => {
            running++;
            if (running > maxRunning) maxRunning = running;
            await sleep(10);
            running--;
            return Ok(i);
          }),
        ),
      );

      await Promise.all(tasks.map(t => t.run()));
      assert.equal(maxRunning, 1);
      assert.equal(sem.available(), 1);
    });

    it("releases permit even when task returns Err", async () => {
      const sem = Semaphore.create(1);
      const failing = sem.wrap(mkTask(async () => Err("boom")));
      const result = await failing.run();
      assert.equal(result.isErr, true);
      assert.equal(sem.available(), 1);
    });
  });

  it(".available() and .pending() reflect state", async () => {
    const sem = Semaphore.create(2);
    assert.equal(sem.available(), 2);
    assert.equal(sem.pending(), 0);

    const r1 = await sem.acquire();
    assert.equal(sem.available(), 1);
    assert.equal(sem.pending(), 0);

    const r2 = await sem.acquire();
    assert.equal(sem.available(), 0);
    assert.equal(sem.pending(), 0);

    // Third acquire will pend
    const p3 = sem.acquire();
    // Let event loop tick
    await sleep(1);
    assert.equal(sem.pending(), 1);

    r1();
    await p3;
    assert.equal(sem.pending(), 0);
    r2();
  });
});

describe("Mutex", () => {
  it("only allows 1 concurrent task", async () => {
    const mutex = Mutex.create();
    assert.equal(mutex.isLocked(), false);

    const r1 = await mutex.acquire();
    assert.equal(mutex.isLocked(), true);

    r1();
    assert.equal(mutex.isLocked(), false);
  });

  it(".isLocked() reflects state correctly", async () => {
    const mutex = Mutex.create();
    assert.equal(mutex.isLocked(), false);

    const release = await mutex.acquire();
    assert.equal(mutex.isLocked(), true);

    release();
    assert.equal(mutex.isLocked(), false);
  });

  it(".wrap ensures mutual exclusion", async () => {
    const mutex = Mutex.create();
    let running = 0;
    let maxRunning = 0;

    const tasks = Array.from({ length: 5 }, (_, i) =>
      mutex.wrap(
        mkTask(async () => {
          running++;
          if (running > maxRunning) maxRunning = running;
          await sleep(5);
          running--;
          return Ok(i);
        }),
      ),
    );

    await Promise.all(tasks.map(t => t.run()));
    assert.equal(maxRunning, 1);
    assert.equal(mutex.isLocked(), false);
  });
});

// =============================================================================
// 5. RateLimiter
// =============================================================================

describe("RateLimiter", () => {
  describe("tryAcquire", () => {
    it("succeeds while tokens are available", () => {
      const limiter = RateLimiter.create({
        capacity: 3,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      assert.equal(limiter.tryAcquire(), true);
      assert.equal(limiter.tryAcquire(), true);
      assert.equal(limiter.tryAcquire(), true);
    });

    it("fails when tokens are exhausted", () => {
      const limiter = RateLimiter.create({
        capacity: 2,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      limiter.tryAcquire();
      limiter.tryAcquire();
      assert.equal(limiter.tryAcquire(), false);
    });
  });

  it("tokens refill after interval", async () => {
    const limiter = RateLimiter.create({
      capacity: 2,
      refillRate: 2,
      refillInterval: Duration.milliseconds(30),
    });

    // Exhaust tokens
    limiter.tryAcquire();
    limiter.tryAcquire();
    assert.equal(limiter.tryAcquire(), false);

    // Wait for refill
    await sleep(50);
    assert.equal(limiter.tryAcquire(), true);
  });

  describe(".wrap", () => {
    it("runs task when tokens available", async () => {
      const limiter = RateLimiter.create({
        capacity: 5,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      const task = mkTask(async () => Ok("ok"));
      const result = await limiter.wrap(task).run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "ok");
    });

    it("returns RateLimited error when tokens exhausted", async () => {
      const limiter = RateLimiter.create({
        capacity: 1,
        refillRate: 1,
        refillInterval: Duration.seconds(10),
      });

      const task = mkTask(async () => Ok("ok"));
      // First call uses the token
      await limiter.wrap(task).run();

      // Second call should be rate limited
      const result = await limiter.wrap(task).run();
      assert.equal(result.isErr, true);
      assert.equal(RateLimited.is(result.unwrapErr()), true);
      assert.equal(result.unwrapErr().tag, "RateLimited");
    });
  });

  it(".reset() restores full capacity", () => {
    const limiter = RateLimiter.create({
      capacity: 3,
      refillRate: 1,
      refillInterval: Duration.seconds(10),
    });

    limiter.tryAcquire();
    limiter.tryAcquire();
    limiter.tryAcquire();
    assert.equal(limiter.tokens(), 0);

    limiter.reset();
    assert.equal(limiter.tokens(), 3);
  });
});

// =============================================================================
// 6. Cache
// =============================================================================

describe("Cache", () => {
  describe(".set / .get", () => {
    it("stores and retrieves values", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      const result = cache.get("key");
      assert.equal(result.isSome, true);
      assert.equal(result.unwrap(), "value");
    });

    it("returns None for missing keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      const result = cache.get("missing");
      assert.equal(result.isNone, true);
    });
  });

  describe("TTL expiration", () => {
    it("expired entries return None", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("key", "value");

      assert.equal(cache.get("key").isSome, true);

      await sleep(50);
      assert.equal(cache.get("key").isNone, true);
    });
  });

  describe("LRU eviction", () => {
    it("evicts oldest when maxSize exceeded", () => {
      const cache = Cache.create({
        ttl: Duration.seconds(10),
        maxSize: 2,
      });

      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3); // This should evict "a"

      assert.equal(cache.get("a").isNone, true);
      assert.equal(cache.get("b").isSome, true);
      assert.equal(cache.get("c").isSome, true);
    });

    it("accessing a key moves it to most-recent (avoids eviction)", () => {
      const cache = Cache.create({
        ttl: Duration.seconds(10),
        maxSize: 2,
      });

      cache.set("a", 1);
      cache.set("b", 2);

      // Access "a" to make it most recently used
      cache.get("a");

      // Insert "c": should evict "b" (least recently used), not "a"
      cache.set("c", 3);

      assert.equal(cache.get("a").isSome, true);
      assert.equal(cache.get("b").isNone, true);
      assert.equal(cache.get("c").isSome, true);
    });
  });

  describe(".has", () => {
    it("returns true for present keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      assert.equal(cache.has("key"), true);
    });

    it("returns false for missing keys", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      assert.equal(cache.has("missing"), false);
    });

    it("returns false for expired keys", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("key", "value");
      await sleep(50);
      assert.equal(cache.has("key"), false);
    });
  });

  describe(".delete", () => {
    it("removes an entry", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "value");
      assert.equal(cache.delete("key"), true);
      assert.equal(cache.get("key").isNone, true);
    });

    it("returns false when deleting non-existent key", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      assert.equal(cache.delete("missing"), false);
    });
  });

  describe(".clear", () => {
    it("empties the cache", () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.clear();
      assert.equal(cache.size(), 0);
      assert.equal(cache.get("a").isNone, true);
    });
  });

  describe(".size", () => {
    it("counts non-expired entries", async () => {
      const cache = Cache.create({ ttl: Duration.milliseconds(30) });
      cache.set("a", 1);
      cache.set("b", 2);
      assert.equal(cache.size(), 2);

      await sleep(50);
      assert.equal(cache.size(), 0);
    });
  });

  describe(".getOrElse", () => {
    it("returns cached value on hit", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });
      cache.set("key", "cached");

      let taskRan = false;
      const task = mkTask(async () => {
        taskRan = true;
        return Ok("computed");
      });

      const result = await cache.getOrElse("key", task).run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "cached");
      assert.equal(taskRan, false);
    });

    it("runs task on miss and caches the result", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      const task = mkTask(async () => Ok("computed"));
      const result = await cache.getOrElse("key", task).run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "computed");

      // Value should now be cached
      assert.equal(cache.get("key").unwrap(), "computed");
    });

    it("does not cache on task error", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      const task = mkTask(async () => Err("fail"));
      const result = await cache.getOrElse("key", task).run();
      assert.equal(result.isErr, true);
      assert.equal(cache.has("key"), false);
    });
  });

  describe(".setWithTTL", () => {
    it("uses custom TTL for the entry", async () => {
      const cache = Cache.create({ ttl: Duration.seconds(10) });

      // Set with a short custom TTL
      cache.setWithTTL("short", "value", Duration.milliseconds(30));
      assert.equal(cache.get("short").isSome, true);

      await sleep(50);
      assert.equal(cache.get("short").isNone, true);
    });
  });
});

// =============================================================================
// 7. Channel
// =============================================================================

describe("Channel", () => {
  describe("bounded", () => {
    it("send/receive basic flow", async () => {
      const ch = Channel.bounded(10);
      await ch.send(1);
      await ch.send(2);
      await ch.send(3);
      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      assert.deepEqual(received, [1, 2, 3]);
    });

    it("send blocks when buffer is full", async () => {
      const ch = Channel.bounded(1);
      const order = [];

      // First send buffers immediately
      await ch.send(1);
      order.push("sent-1");
      assert.equal(ch.size(), 1);

      // Second send should block until receiver drains
      const sendPromise = ch.send(2).then(ok => {
        order.push("sent-2");
        return ok;
      });

      // Let microtasks run, send-2 should still be blocked
      await sleep(5);
      assert.equal(order.length, 1);

      // Now consume one value to unblock
      const iter = ch.receive()[Symbol.asyncIterator]();
      const first = await iter.next();
      assert.equal(first.value, 1);

      await sendPromise;
      assert.equal(order.length, 2);

      // Clean up
      ch.close();
    });
  });

  describe("close", () => {
    it("subsequent sends return false", async () => {
      const ch = Channel.bounded(10);
      ch.close();
      const result = await ch.send(42);
      assert.equal(result, false);
    });

    it("receivers get done", async () => {
      const ch = Channel.bounded(10);
      await ch.send(1);
      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      assert.deepEqual(received, [1]);
    });

    it("waiting receivers resolve done on close", async () => {
      const ch = Channel.bounded(10);
      const iter = ch.receive()[Symbol.asyncIterator]();

      // Start waiting for a value
      const nextPromise = iter.next();

      // Close the channel
      ch.close();

      const result = await nextPromise;
      assert.equal(result.done, true);
    });
  });

  describe("unbounded", () => {
    it("never blocks on send", async () => {
      const ch = Channel.unbounded();

      // Send many values rapidly without blocking
      for (let i = 0; i < 100; i++) {
        const ok = await ch.send(i);
        assert.equal(ok, true);
      }

      ch.close();

      const received = [];
      for await (const v of ch.receive()) {
        received.push(v);
      }
      assert.equal(received.length, 100);
      assert.equal(received[0], 0);
      assert.equal(received[99], 99);
    });
  });

  describe(".isClosed / .size", () => {
    it(".isClosed reflects state", () => {
      const ch = Channel.bounded(10);
      assert.equal(ch.isClosed(), false);
      ch.close();
      assert.equal(ch.isClosed(), true);
    });

    it(".size reflects buffered count", async () => {
      const ch = Channel.bounded(10);
      assert.equal(ch.size(), 0);
      await ch.send(1);
      assert.equal(ch.size(), 1);
      await ch.send(2);
      assert.equal(ch.size(), 2);
    });
  });
});

// =============================================================================
// 8. Env
// =============================================================================

describe("Env", () => {
  describe("Env.of", () => {
    it("wraps a value and ignores the environment", async () => {
      const env = Env.of(42);
      const result = await env.run({ anything: true });
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), 42);
    });

    it("works with any environment type", async () => {
      const env = Env.of("hello");
      const result = await env.run(null);
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "hello");
    });
  });

  describe("Env.access", () => {
    it("returns the environment as the produced value", async () => {
      const env = Env.access();
      const result = await env.run({ db: "postgres", port: 5432 });
      assert.equal(result.isOk, true);
      assert.deepEqual(result.unwrap(), { db: "postgres", port: 5432 });
    });
  });

  describe(".map", () => {
    it("transforms the produced value", async () => {
      const env = Env.of(10).map(n => n * 3);
      const result = await env.run({});
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), 30);
    });

    it("does not transform errors", async () => {
      const env = Env.from(async () => Err("fail")).map(() => "should not run");
      const result = await env.run({});
      assert.equal(result.isErr, true);
      assert.equal(result.unwrapErr(), "fail");
    });
  });

  describe(".flatMap", () => {
    it("chains computations with the same environment", async () => {
      const getPort = Env.access().map(env => env.port);
      const getHost = Env.access().map(env => env.host);

      const combined = getPort.flatMap(port => getHost.map(host => `${host}:${port}`));

      const result = await combined.run({ host: "localhost", port: 8080 });
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "localhost:8080");
    });

    it("short-circuits on error", async () => {
      let secondRan = false;
      const failing = Env.from(async () => Err("oops"));
      const chained = failing.flatMap(() => {
        secondRan = true;
        return Env.of("never");
      });

      const result = await chained.run({});
      assert.equal(result.isErr, true);
      assert.equal(secondRan, false);
    });
  });

  describe(".provide", () => {
    it("narrows the environment by transforming outer to inner", async () => {
      // Inner env expects { db: string }
      const inner = Env.access().map(env => env.db);

      // Provide transforms { config: { database: string } } -> { db: string }
      const outer = inner.provide(env => ({ db: env.config.database }));

      const result = await outer.run({ config: { database: "mydb" } });
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "mydb");
    });
  });

  describe(".provideAll", () => {
    it("converts to a Task-like by supplying the full environment", async () => {
      const env = Env.access().map(e => e.name);
      const taskLike = env.provideAll({ name: "Alice" });

      // taskLike has .run() that takes no arguments
      const result = await taskLike.run();
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "Alice");
    });
  });

  describe(".tap", () => {
    it("runs side effect without changing result", async () => {
      let sideEffect = null;
      const env = Env.of("value").tap(v => {
        sideEffect = v;
      });

      const result = await env.run({});
      assert.equal(result.isOk, true);
      assert.equal(result.unwrap(), "value");
      assert.equal(sideEffect, "value");
    });

    it("does not run side effect on error", async () => {
      let sideEffect = null;
      const env = Env.from(async () => Err("fail")).tap(v => {
        sideEffect = v;
      });

      const result = await env.run({});
      assert.equal(result.isErr, true);
      assert.equal(sideEffect, null);
    });
  });
});

// =============================================================================
// 10. Stream reactive operators
// =============================================================================

// Helper: create an async iterable from timed steps (for debounce tests)
const timedSource = steps => {
  let i = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          while (i < steps.length) {
            const step = steps[i++];
            if (step.delay > 0) {
              await sleep(step.delay);
            }
            if (step.value !== null) {
              return { value: step.value, done: false };
            }
          }
          return { value: undefined, done: true };
        },
      };
    },
  };
};

describe("Stream.debounce", () => {
  it("emits only the last value after a burst", async () => {
    // Source emits 1, 2, 3 rapidly (no delay between them), then stops.
    // Debounce of 50ms should only emit the last value (3).
    const s = Stream(() => {
      let i = 0;
      const values = [Ok(1), Ok(2), Ok(3)];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i < values.length) {
                return { value: values[i++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      };
    }).debounce(50);

    const result = await s.collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [3]);
  });

  it("emits multiple values when there are pauses between bursts", async () => {
    // Emit 1, 2 rapidly, then wait, then emit 3, 4 rapidly.
    // Debounce of 30ms should emit 2 (end of first burst) and 4 (end of second burst).
    const s = Stream(() => {
      return timedSource([
        { value: Ok(1), delay: 0 },
        { value: Ok(2), delay: 0 },
        { value: null, delay: 80 }, // pause
        { value: Ok(3), delay: 0 },
        { value: Ok(4), delay: 0 },
      ]);
    }).debounce(30);

    const result = await s.collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [2, 4]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().debounce(50).collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("handles single value", async () => {
    const result = await Stream.of(42).debounce(30).collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [42]);
  });
});

describe("Stream.throttle", () => {
  it("lets the first value through immediately", async () => {
    const result = await Stream.of(1, 2, 3).throttle(1000).collect().run();
    assert.equal(result.isOk, true);
    // Only the first value passes because the others arrive within the same ms window
    assert.ok(result.unwrap().length > 0);
    assert.equal(result.unwrap()[0], 1);
  });

  it("drops values within the throttle window", async () => {
    // All values are emitted synchronously, so only the first passes a 100ms throttle
    const result = await Stream.of(1, 2, 3, 4, 5).throttle(100).collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1]);
  });

  it("emits values that arrive after the window expires", async () => {
    // Create a stream with delays: value, pause, value
    const s = Stream(() => {
      const steps = [
        { value: Ok(1), delay: 0 },
        { value: Ok(2), delay: 60 },
        { value: Ok(3), delay: 60 },
      ];
      let i = 0;
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= steps.length) {
                return { value: undefined, done: true };
              }
              const step = steps[i++];
              if (step.delay > 0) {
                await sleep(step.delay);
              }
              return { value: step.value, done: false };
            },
          };
        },
      };
    }).throttle(50);

    const result = await s.collect().run();
    assert.equal(result.isOk, true);
    // First value passes, second arrives after 60ms (> 50ms window), third arrives after another 60ms
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().throttle(100).collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("passes errors through without throttling", async () => {
    const s = Stream(() => {
      let i = 0;
      const values = [Ok(1), Err("oops")];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i < values.length) {
                return { value: values[i++], done: false };
              }
              return { value: undefined, done: true };
            },
          };
        },
      };
    }).throttle(1000);

    const result = await s.collect().run();
    // collect() short-circuits on first Err
    assert.equal(result.isErr, true);
  });
});

describe("Stream.distinctUntilChanged", () => {
  it("removes consecutive duplicates with default equality", async () => {
    const result = await Stream.of(1, 1, 2, 2, 3, 3, 1).distinctUntilChanged().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3, 1]);
  });

  it("passes all values when no consecutive duplicates exist", async () => {
    const result = await Stream.of(1, 2, 3, 4).distinctUntilChanged().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3, 4]);
  });

  it("handles single-element stream", async () => {
    const result = await Stream.of(42).distinctUntilChanged().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [42]);
  });

  it("handles empty stream", async () => {
    const result = await Stream.empty().distinctUntilChanged().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("uses custom equality function", async () => {
    // Compare objects by their 'id' field
    const items = [
      { id: 1, name: "a" },
      { id: 1, name: "b" },
      { id: 2, name: "c" },
      { id: 2, name: "d" },
      { id: 3, name: "e" },
    ];
    const result = await Stream.fromArray(items)
      .distinctUntilChanged((a, b) => a.id === b.id)
      .collect()
      .run();
    assert.equal(result.isOk, true);
    const values = result.unwrap();
    assert.equal(values.length, 3);
    assert.equal(values[0].name, "a");
    assert.equal(values[1].name, "c");
    assert.equal(values[2].name, "e");
  });

  it("handles all identical values", async () => {
    const result = await Stream.of(5, 5, 5, 5).distinctUntilChanged().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [5]);
  });
});

describe("Stream.merge", () => {
  it("combines values from multiple streams", async () => {
    const a = Stream.of(1, 2, 3);
    const b = Stream.of(4, 5, 6);
    const result = await Stream.merge(a, b).collect().run();
    assert.equal(result.isOk, true);
    const values = result.unwrap();
    // All values should be present (order may vary due to concurrency)
    assert.equal(values.length, 6);
    assert.equal(values.includes(1), true);
    assert.equal(values.includes(2), true);
    assert.equal(values.includes(3), true);
    assert.equal(values.includes(4), true);
    assert.equal(values.includes(5), true);
    assert.equal(values.includes(6), true);
  });

  it("handles single stream", async () => {
    const result = await Stream.merge(Stream.of(1, 2, 3))
      .collect()
      .run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), [1, 2, 3]);
  });

  it("handles empty streams", async () => {
    const result = await Stream.merge(Stream.empty(), Stream.empty()).collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });

  it("handles mix of empty and non-empty streams", async () => {
    const result = await Stream.merge(Stream.empty(), Stream.of(1, 2), Stream.empty())
      .collect()
      .run();
    assert.equal(result.isOk, true);
    const values = result.unwrap();
    assert.equal(values.length, 2);
    assert.equal(values.includes(1), true);
    assert.equal(values.includes(2), true);
  });

  it("interleaves streams with different speeds", async () => {
    // Stream a emits immediately, stream b emits with delays
    const a = Stream.of(1, 2);
    const b = Stream(() => {
      let i = 0;
      const values = [Ok(10), Ok(20)];
      return {
        [Symbol.asyncIterator]() {
          return {
            async next() {
              if (i >= values.length) {
                return { value: undefined, done: true };
              }
              await sleep(20);
              return { value: values[i++], done: false };
            },
          };
        },
      };
    });

    const result = await Stream.merge(a, b).collect().run();
    assert.equal(result.isOk, true);
    const values = result.unwrap();
    assert.equal(values.length, 4);
    assert.equal(values.includes(1), true);
    assert.equal(values.includes(2), true);
    assert.equal(values.includes(10), true);
    assert.equal(values.includes(20), true);
  });

  it("handles zero streams (no arguments)", async () => {
    const result = await Stream.merge().collect().run();
    assert.equal(result.isOk, true);
    assert.deepEqual(result.unwrap(), []);
  });
});

// =============================================================================
// 10. StateMachine
// =============================================================================

describe("StateMachine", () => {
  const machine = StateMachine({
    initial: "idle",
    states: { idle: {}, loading: {}, success: {}, error: {} },
    transitions: {
      idle: { FETCH: "loading" },
      loading: { RESOLVE: "success", REJECT: "error" },
      success: { RESET: "idle" },
      error: { RETRY: "loading", RESET: "idle" },
    },
  });

  it("initial: returns the initial state", () => {
    assert.equal(machine.initial, "idle");
  });

  it("states: returns frozen array of state names", () => {
    assert.deepEqual(machine.states, ["idle", "loading", "success", "error"]);
    assert.throws(() => {
      machine.states[0] = "x";
    }, TypeError);
  });

  it("events: returns valid events for a state", () => {
    assert.deepEqual(machine.events("idle"), ["FETCH"]);
    assert.deepEqual(machine.events("loading"), ["RESOLVE", "REJECT"]);
  });

  it("events: returns empty for state with no transitions", () => {
    assert.deepEqual(machine.events("nonexistent"), []);
  });

  it("transition: valid transition returns [nextState, ctx]", () => {
    const [next, ctx] = machine.transition("idle", undefined, "FETCH");
    assert.equal(next, "loading");
    assert.equal(ctx, undefined);
  });

  it("transition: chained transitions", () => {
    const [s1] = machine.transition("idle", undefined, "FETCH");
    const [s2] = machine.transition(s1, undefined, "RESOLVE");
    assert.equal(s2, "success");
  });

  it("send: valid transition returns Ok", () => {
    const result = machine.send("idle", undefined, "FETCH");
    assert.equal(result.isOk, true);
    assert.equal(result.value[0], "loading");
  });

  it("send: invalid event returns Err(InvalidTransition)", () => {
    const result = machine.send("idle", undefined, "RESOLVE");
    assert.equal(result.isErr, true);
    assert.equal(result.error.tag, "InvalidTransition");
  });

  it("send: invalid state returns Err", () => {
    const result = machine.send("nonexistent", undefined, "FETCH");
    assert.equal(result.isErr, true);
  });

  it("canTransition: returns true for valid", () => {
    assert.equal(machine.canTransition("idle", "FETCH"), true);
  });

  it("canTransition: returns false for invalid", () => {
    assert.equal(machine.canTransition("idle", "RESOLVE"), false);
  });

  it("machine object is frozen", () => {
    assert.throws(() => {
      machine.initial = "x";
    }, TypeError);
  });
});

describe("StateMachine with guards and actions", () => {
  it("guard blocks transition", () => {
    const m = StateMachine({
      initial: "locked",
      states: { locked: {}, unlocked: {} },
      transitions: {
        locked: { UNLOCK: { target: "unlocked", guard: ctx => ctx.hasKey } },
        unlocked: { LOCK: "locked" },
      },
    });
    const blocked = m.send("locked", { hasKey: false }, "UNLOCK");
    assert.equal(blocked.isErr, true);
    assert.ok(blocked.error.message.includes("Guard"));

    const allowed = m.send("locked", { hasKey: true }, "UNLOCK");
    assert.equal(allowed.isOk, true);
    assert.equal(allowed.value[0], "unlocked");
  });

  it("action transforms context", () => {
    const m = StateMachine({
      initial: "idle",
      states: { idle: {}, active: {} },
      transitions: {
        idle: { START: { target: "active", action: ctx => ({ ...ctx, count: ctx.count + 1 }) } },
        active: { STOP: "idle" },
      },
    });
    const result = m.send("idle", { count: 0 }, "START");
    assert.equal(result.isOk, true);
    assert.equal(result.value[1].count, 1);
  });

  it("entry/exit hooks fire in correct order", () => {
    const log = [];
    const m = StateMachine({
      initial: "a",
      states: {
        a: {
          onExit: ctx => {
            log.push("exit-a");
            return ctx;
          },
        },
        b: {
          onEntry: ctx => {
            log.push("enter-b");
            return ctx;
          },
        },
      },
      transitions: {
        a: {
          GO: {
            target: "b",
            action: ctx => {
              log.push("action");
              return ctx;
            },
          },
        },
        b: { BACK: "a" },
      },
    });
    m.send("a", undefined, "GO");
    assert.deepEqual(log, ["exit-a", "action", "enter-b"]);
  });
});
