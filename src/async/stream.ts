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
        const iterA = source()[Symbol.asyncIterator]();
        const iterB = other.run()[Symbol.asyncIterator]();
        while (true) {
          const [a, b] = await Promise.all([iterA.next(), iterB.next()]);
          if (a.done || b.done) break;
          const rA = a.value;
          const rB = b.value;
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
  },
);
