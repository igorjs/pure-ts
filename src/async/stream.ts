/**
 * @module stream
 *
 * Lazy, pull-based async sequences that carry errors as values.
 *
 * **Why Stream in addition to Task?**
 * Task handles a single async computation. Stream handles sequences:
 * SSE events, file lines, database cursors, paginated APIs. Like Task,
 * Stream is lazy (nothing executes until collected) and carries errors
 * in the type system via `Result<T, E>`.
 *
 * **Pull-based means backpressure is free.**
 * The consumer drives iteration via `for await`. The producer only
 * generates the next value when the consumer asks for it. No buffering,
 * no overflow, no lost events.
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { castErr, castOk, Err, Ok } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";

// ── Stream interface ────────────────────────────────────────────────────────

/** Task-like for collection operations, avoiding direct Task import. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

/**
 * A lazy async sequence that produces `Result<T, E>` values.
 *
 * Transformations (map, filter, take) are lazy and produce new Streams.
 * Collection operations (collect, forEach, reduce) return Task-like
 * computations that execute the pipeline.
 */
export interface Stream<T, E> {
  readonly map: <U>(fn: (value: T) => U) => Stream<U, E>;
  readonly flatMap: <U>(fn: (value: T) => Stream<U, E>) => Stream<U, E>;
  readonly filter: (predicate: (value: T) => boolean) => Stream<T, E>;
  readonly take: (n: number) => Stream<T, E>;
  readonly drop: (n: number) => Stream<T, E>;
  readonly takeWhile: (predicate: (value: T) => boolean) => Stream<T, E>;
  readonly chunk: (size: number) => Stream<readonly T[], E>;
  readonly mapErr: <F>(fn: (error: E) => F) => Stream<T, F>;
  readonly tap: (fn: (value: T) => void) => Stream<T, E>;
  readonly collect: () => TaskLike<readonly T[], E>;
  readonly forEach: (fn: (value: T) => void) => TaskLike<void, E>;
  readonly reduce: <U>(fn: (acc: U, value: T) => U, init: U) => TaskLike<U, E>;
  readonly first: () => TaskLike<Option<T>, E>;
  readonly concat: (other: Stream<T, E>) => Stream<T, E>;
  readonly zip: <U>(other: Stream<U, E>) => Stream<[T, U], E>;
  /** Sliding window of fixed size over the stream. */
  readonly window: (size: number) => Stream<readonly T[], E>;
  /** Group all elements by key, collecting into a record of arrays. */
  readonly groupBy: <K extends string>(
    fn: (value: T) => K,
  ) => TaskLike<Readonly<Record<K, readonly T[]>>, E>;
  /** Scan (running fold) producing intermediate accumulated values. */
  readonly scan: <U>(fn: (acc: U, value: T) => U, init: U) => Stream<U, E>;
  /** Emit value only after `ms` milliseconds of silence. Resets timer on each new value. */
  readonly debounce: (ms: number) => Stream<T, E>;
  /** Emit at most one value per `ms` milliseconds. First value passes immediately. */
  readonly throttle: (ms: number) => Stream<T, E>;
  /** Skip consecutive duplicate values. Uses `===` when no equality function provided. */
  readonly distinctUntilChanged: (eq?: (a: T, b: T) => boolean) => Stream<T, E>;
  readonly run: () => AsyncIterable<Result<T, E>>;
}

// ── Async iterable helpers (avoids async generators' Awaited<T> issue) ──────

/**
 * TypeScript wraps async generator yield types with Awaited<T>, which
 * breaks generic type parameters. These helpers build AsyncIterables
 * by bridging the generator's inferred type to the correct one.
 * Runtime behavior is identical; the cast is purely a type-level fix.
 */
const gen = <T, E>(
  fn: () => AsyncGenerator<Result<T, E>, void, undefined>,
): (() => AsyncIterable<Result<T, E>>) => fn as () => AsyncIterable<Result<T, E>>;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Zip two async iterables of Results, pairing elements 1:1. */
async function* zipIterators<T, U, E>(
  a: AsyncIterable<Result<T, E>>,
  b: AsyncIterable<Result<U, E>>,
): AsyncGenerator<Result<[T, U], E>> {
  const iterA = a[Symbol.asyncIterator]();
  const iterB = b[Symbol.asyncIterator]();
  while (true) {
    const [nextA, nextB] = await Promise.all([iterA.next(), iterB.next()]);
    if (nextA.done || nextB.done) break;
    const rA = nextA.value;
    const rB = nextB.value;
    if (rA.isErr) {
      yield castErr(rA);
      continue;
    }
    if (rB.isErr) {
      yield castErr(rB);
      continue;
    }
    yield Ok([rA.value, rB.value] as [T, U]);
  }
}

// ── Async queue for push-to-pull bridging ───────────────────────────────────

/** Simple async queue: producers push, consumers await next value. */
interface AsyncQueue<T> {
  push(value: T): void;
  done(): void;
  next(): Promise<IteratorResult<T>>;
}

const createAsyncQueue = <T>(): AsyncQueue<T> => {
  const items: T[] = [];
  let finished = false;
  let notify: (() => void) | null = null;

  const wake = (): void => {
    if (notify !== null) {
      notify();
      notify = null;
    }
  };

  return {
    push(value: T): void {
      items.push(value);
      wake();
    },
    done(): void {
      finished = true;
      wake();
    },
    next(): Promise<IteratorResult<T>> {
      if (items.length > 0) {
        return Promise.resolve({ value: items.shift()!, done: false });
      }
      if (finished) {
        return Promise.resolve({ value: undefined as T, done: true });
      }
      return new Promise<IteratorResult<T>>(r => {
        notify = () => {
          if (items.length > 0) {
            r({ value: items.shift()!, done: false });
          } else if (finished) {
            r({ value: undefined as T, done: true });
          }
        };
      });
    },
  };
};

// ── Debounce pump (extracted for complexity) ────────────────────────────────

/** Eagerly consume an async iterator, debouncing Ok values into a queue. */
const pumpDebounce = <T, E>(
  iter: AsyncIterator<Result<T, E>>,
  ms: number,
  q: AsyncQueue<Result<T, E>>,
): void => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let sourceExhausted = false;
  const pull = (): void => {
    iter.next().then(next => {
      if (next.done) {
        sourceExhausted = true;
        // If no debounce timer is pending, mark the queue as done immediately.
        // Otherwise the timer callback will call q.done() after flushing.
        if (timer === null) {
          q.done();
        }
        return;
      }
      if (next.value.isErr) {
        q.push(next.value);
        pull();
        return;
      }
      if (timer !== null) {
        clearTimeout(timer);
      }
      const latest = next.value;
      timer = setTimeout(() => {
        timer = null;
        q.push(latest);
        // Why: if the source finished while we were debouncing,
        // signal completion now that the final value has been flushed.
        if (sourceExhausted) {
          q.done();
        }
      }, ms);
      pull();
    });
  };
  pull();
};

// ── Implementation ──────────────────────────────────────────────────────────

const createStream = <T, E>(source: () => AsyncIterable<Result<T, E>>): Stream<T, E> => ({
  map: <U>(fn: (value: T) => U): Stream<U, E> =>
    createStream(
      gen<U, E>(async function* () {
        for await (const r of source()) {
          yield r.isOk ? Ok(fn(r.value)) : castErr(r);
        }
      }),
    ),

  flatMap: <U>(fn: (value: T) => Stream<U, E>): Stream<U, E> =>
    createStream(
      gen<U, E>(async function* () {
        for await (const r of source()) {
          if (r.isErr) {
            yield castErr(r);
            continue;
          }
          for await (const inner of fn(r.value).run()) {
            yield inner;
          }
        }
      }),
    ),

  filter: (predicate: (value: T) => boolean): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        for await (const r of source()) {
          if (r.isErr || predicate(r.value)) yield r;
        }
      }),
    ),

  take: (n: number): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        let count = 0;
        for await (const r of source()) {
          if (count >= n) break;
          yield r;
          if (r.isOk) count++;
        }
      }),
    ),

  drop: (n: number): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        let skipped = 0;
        for await (const r of source()) {
          if (r.isErr) {
            yield r;
            continue;
          }
          if (skipped < n) {
            skipped++;
            continue;
          }
          yield r;
        }
      }),
    ),

  takeWhile: (predicate: (value: T) => boolean): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        for await (const r of source()) {
          if (r.isErr) {
            yield r;
            continue;
          }
          if (!predicate(r.value)) break;
          yield r;
        }
      }),
    ),

  chunk: (size: number): Stream<readonly T[], E> =>
    createStream(
      gen<readonly T[], E>(async function* () {
        let buffer: T[] = [];
        for await (const r of source()) {
          if (r.isErr) {
            yield castErr(r);
            continue;
          }
          buffer.push(r.value);
          if (buffer.length >= size) {
            yield Ok(buffer as readonly T[]);
            buffer = [];
          }
        }
        if (buffer.length > 0) {
          yield Ok(buffer as readonly T[]);
        }
      }),
    ),

  mapErr: <F>(fn: (error: E) => F): Stream<T, F> =>
    createStream(
      gen<T, F>(async function* () {
        for await (const r of source()) {
          if (r.isErr) {
            yield Err(fn(r.error));
          } else {
            yield castOk(r);
          }
        }
      }),
    ),

  tap: (fn: (value: T) => void): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        for await (const r of source()) {
          if (r.isOk) fn(r.value);
          yield r;
        }
      }),
    ),

  collect: (): TaskLike<readonly T[], E> =>
    mkTask(async () => {
      const values: T[] = [];
      for await (const r of source()) {
        if (r.isErr) return castErr(r);
        values.push(r.value);
      }
      return Ok(values as readonly T[]);
    }),

  forEach: (fn: (value: T) => void): TaskLike<void, E> =>
    mkTask(async () => {
      for await (const r of source()) {
        if (r.isErr) return castErr(r);
        fn(r.value);
      }
      return Ok(undefined);
    }),

  reduce: <U>(fn: (acc: U, value: T) => U, init: U): TaskLike<U, E> =>
    mkTask(async () => {
      let acc = init;
      for await (const r of source()) {
        if (r.isErr) return castErr(r);
        acc = fn(acc, r.value);
      }
      return Ok(acc);
    }),

  first: (): TaskLike<Option<T>, E> =>
    mkTask(async () => {
      for await (const r of source()) {
        if (r.isErr) return castErr(r);
        return Ok(Some(r.value));
      }
      return Ok(None as Option<T>);
    }),

  concat: (other: Stream<T, E>): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        yield* source();
        yield* other.run();
      }),
    ),

  zip: <U>(other: Stream<U, E>): Stream<[T, U], E> =>
    createStream(
      gen<[T, U], E>(async function* () {
        yield* zipIterators(source(), other.run());
      }),
    ),

  window: (size: number): Stream<readonly T[], E> =>
    createStream(
      gen<readonly T[], E>(async function* () {
        const buffer: T[] = [];
        for await (const r of source()) {
          if (r.isErr) {
            yield castErr(r);
            continue;
          }
          buffer.push(r.value);
          if (buffer.length >= size) {
            yield Ok(buffer.slice() as readonly T[]);
            buffer.shift();
          }
        }
      }),
    ),

  groupBy: <K extends string>(
    fn: (value: T) => K,
  ): TaskLike<Readonly<Record<K, readonly T[]>>, E> =>
    mkTask(async () => {
      const groups: Record<string, T[]> = {};
      for await (const r of source()) {
        if (r.isErr) return castErr(r);
        const key = fn(r.value);
        let group = groups[key];
        if (group === undefined) {
          group = [];
          groups[key] = group;
        }
        group.push(r.value);
      }
      // Why: groups is Record<string, T[]> but we need Record<K, readonly T[]>.
      // K is a subtype of string (from the key function), and T[] is readonly T[] compatible.
      // TS can't narrow the index signature from string to K.
      return Ok(groups as unknown as Readonly<Record<K, readonly T[]>>);
    }),

  scan: <U>(fn: (acc: U, value: T) => U, init: U): Stream<U, E> =>
    createStream(
      gen<U, E>(async function* () {
        let acc = init;
        for await (const r of source()) {
          if (r.isErr) {
            yield castErr(r);
            continue;
          }
          acc = fn(acc, r.value);
          yield Ok(acc);
        }
      }),
    ),

  debounce: (ms: number): Stream<T, E> =>
    createStream(() => {
      const q = createAsyncQueue<Result<T, E>>();
      let started = false;

      const start = (): void => {
        pumpDebounce(source()[Symbol.asyncIterator](), ms, q);
      };

      return {
        [Symbol.asyncIterator]() {
          if (!started) {
            started = true;
            start();
          }
          return { next: () => q.next() };
        },
      };
    }),

  throttle: (ms: number): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        let lastEmitTime = 0;
        for await (const r of source()) {
          if (r.isErr) {
            yield r;
            continue;
          }
          const now = Date.now();
          if (now - lastEmitTime >= ms) {
            lastEmitTime = now;
            yield r;
          }
        }
      }),
    ),

  distinctUntilChanged: (eq?: (a: T, b: T) => boolean): Stream<T, E> =>
    createStream(
      gen<T, E>(async function* () {
        const isEqual = eq ?? ((a: T, b: T) => a === b);
        let hasPrev = false;
        let prev: T | undefined;
        for await (const r of source()) {
          if (r.isErr) {
            yield r;
            continue;
          }
          if (!hasPrev || !isEqual(prev as T, r.value)) {
            hasPrev = true;
            prev = r.value;
            yield r;
          }
        }
      }),
    ),

  run: source,
});

// ── Sleep helper ────────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> => new Promise<void>(resolve => setTimeout(resolve, ms));

// ── Public factory (const/type merge) ───────────────────────────────────────

/**
 * Create lazy async streams.
 *
 * @example
 * ```ts
 * const nums = Stream.of(1, 2, 3);
 * const result = await nums
 *   .map(n => n * 2)
 *   .filter(n => n > 2)
 *   .collect()
 *   .run();
 * // Ok([4, 6])
 *
 * const ticks = Stream.interval(Duration.seconds(1)).take(5);
 * ```
 */
export const Stream: {
  <T, E>(source: () => AsyncIterable<Result<T, E>>): Stream<T, E>;
  readonly from: <T>(iterable: AsyncIterable<T>) => Stream<T, never>;
  readonly of: <T>(...values: readonly T[]) => Stream<T, never>;
  readonly fromArray: <T>(items: readonly T[]) => Stream<T, never>;
  readonly empty: <T = never, E = never>() => Stream<T, E>;
  readonly unfold: <T, S>(seed: S, fn: (state: S) => Option<[T, S]>) => Stream<T, never>;
  readonly interval: (period: Duration) => Stream<number, never>;
  /** Bridge a web standard ReadableStream into a pull-based Stream. */
  readonly fromReadable: <E = never>(readable: ReadableStream<Uint8Array>) => Stream<Uint8Array, E>;
  /** Merge multiple streams, interleaving values as they arrive. */
  readonly merge: <T, E>(...streams: readonly Stream<T, E>[]) => Stream<T, E>;
} = Object.assign(
  <T, E>(source: () => AsyncIterable<Result<T, E>>): Stream<T, E> => createStream(source),
  {
    from: <T>(iterable: AsyncIterable<T>): Stream<T, never> =>
      createStream(
        gen<T, never>(async function* () {
          for await (const value of iterable) {
            yield Ok(value);
          }
        }),
      ),

    of: <T>(...values: readonly T[]): Stream<T, never> =>
      createStream(
        gen<T, never>(async function* () {
          for (const value of values) {
            yield Ok(value);
          }
        }),
      ),

    fromArray: <T>(items: readonly T[]): Stream<T, never> =>
      createStream(
        gen<T, never>(async function* () {
          for (const item of items) {
            yield Ok(item);
          }
        }),
      ),

    empty: <T = never, E = never>(): Stream<T, E> =>
      createStream(
        gen<T, E>(async function* () {
          // empty stream
        }),
      ),

    unfold: <T, S>(seed: S, fn: (state: S) => Option<[T, S]>): Stream<T, never> =>
      createStream(
        gen<T, never>(async function* () {
          let state = seed;
          while (true) {
            const result = fn(state);
            if (result.isNone) break;
            const [value, nextState] = result.value;
            yield Ok(value);
            state = nextState;
          }
        }),
      ),

    interval: (period: Duration): Stream<number, never> =>
      createStream(
        gen<number, never>(async function* () {
          const ms = D.toMilliseconds(period);
          let i = 0;
          while (true) {
            yield Ok(i);
            i++;
            await sleep(ms);
          }
        }),
      ),

    fromReadable: <E = never>(readable: ReadableStream<Uint8Array>): Stream<Uint8Array, E> =>
      createStream(
        gen<Uint8Array, E>(async function* () {
          const reader = readable.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              yield Ok(value);
            }
          } finally {
            reader.releaseLock();
          }
        }),
      ),

    merge: <T, E>(...streams: readonly Stream<T, E>[]): Stream<T, E> =>
      createStream(() => {
        const queue: Result<T, E>[] = [];
        let resolve: ((v: IteratorResult<Result<T, E>>) => void) | null = null;
        let remaining = streams.length;

        const wake = (): void => {
          if (resolve === null) {
            return;
          }
          if (queue.length > 0) {
            const r = resolve;
            resolve = null;
            r({ value: queue.shift()!, done: false });
          } else if (remaining === 0) {
            const r = resolve;
            resolve = null;
            r({ value: undefined as unknown as Result<T, E>, done: true });
          }
          // Why: if neither condition is met (queue empty, sources still active),
          // leave resolve in place so the next wake() call can try again.
        };

        // Why: consume all source streams concurrently in the background,
        // pushing results into a shared queue as they arrive.
        const start = (): void => {
          for (const stream of streams) {
            const iter = stream.run()[Symbol.asyncIterator]();
            const pull = (): void => {
              iter.next().then(next => {
                if (next.done) {
                  remaining--;
                  wake();
                  return;
                }
                queue.push(next.value);
                wake();
                pull();
              });
            };
            pull();
          }
        };

        let started = false;

        return {
          [Symbol.asyncIterator]() {
            if (!started) {
              started = true;
              start();
            }
            return {
              next(): Promise<IteratorResult<Result<T, E>>> {
                if (queue.length > 0) {
                  return Promise.resolve({ value: queue.shift()!, done: false });
                }
                if (remaining === 0 && queue.length === 0) {
                  return Promise.resolve({
                    value: undefined as unknown as Result<T, E>,
                    done: true,
                  });
                }
                return new Promise<IteratorResult<Result<T, E>>>(r => {
                  resolve = r;
                });
              },
            };
          },
        };
      }),
  },
);
