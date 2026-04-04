/**
 * @module channel
 *
 * Async producer/consumer channels with backpressure.
 *
 * **Why Channel?**
 * Stream is pull-based: the consumer drives iteration. But some sources
 * are push-based: events, WebSocket messages, database change streams.
 * Channel bridges push to pull: producers `send` values into the channel,
 * consumers `receive` them as a Stream. Bounded channels provide
 * backpressure: send blocks when the buffer is full.
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
// No Result imports needed: Channel operates at the value level, not Result level.

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A bounded async channel for producer/consumer communication.
 *
 * @example
 * ```ts
 * const ch = Channel.bounded<number>(10);
 *
 * // Producer
 * await ch.send(1);
 * await ch.send(2);
 * ch.close();
 *
 * // Consumer (as async iterable)
 * for await (const value of ch.receive()) {
 *   console.log(value);  // 1, 2
 * }
 * ```
 */
export interface Channel<T> {
  /** Send a value into the channel. Blocks if the buffer is full. */
  readonly send: (value: T) => Promise<boolean>;
  /** Receive values as an async iterable. Completes when channel is closed. */
  readonly receive: () => AsyncIterable<T>;
  /** Close the channel. No more values can be sent. */
  readonly close: () => void;
  /** Whether the channel has been closed. */
  readonly isClosed: () => boolean;
  /** Number of values currently buffered. */
  readonly size: () => number;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createBoundedChannel = <T>(capacity: number): Channel<T> => {
  const buffer: T[] = [];
  let closed = false;

  // Waiters for send (blocked because buffer is full)
  const sendWaiters: Array<{ value: T; resolve: (ok: boolean) => void }> = [];
  // Waiters for receive (blocked because buffer is empty)
  const receiveWaiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
  }> = [];

  const trySendToWaiter = (value: T): boolean => {
    const waiter = receiveWaiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value });
      return true;
    }
    return false;
  };

  const tryReceiveFromBuffer = (): Option<T> => {
    if (buffer.length === 0) return None;
    const value = buffer.shift()!;
    // If senders are waiting, move one into the buffer
    const sender = sendWaiters.shift();
    if (sender !== undefined) {
      buffer.push(sender.value);
      sender.resolve(true);
    }
    return Some(value);
  };

  return Object.freeze({
    send: (value: T): Promise<boolean> => {
      if (closed) return Promise.resolve(false);

      // Try to deliver directly to a waiting receiver
      if (trySendToWaiter(value)) return Promise.resolve(true);

      // Try to buffer
      if (buffer.length < capacity) {
        buffer.push(value);
        return Promise.resolve(true);
      }

      // Buffer full: wait
      return new Promise<boolean>(resolve => {
        sendWaiters.push({ value, resolve });
      });
    },

    receive: (): AsyncIterable<T> => ({
      [Symbol.asyncIterator](): AsyncIterator<T> {
        return {
          next(): Promise<IteratorResult<T>> {
            // Try to read from buffer
            const buffered = tryReceiveFromBuffer();
            if (buffered.isSome) {
              return Promise.resolve({ done: false, value: buffered.value });
            }

            // Buffer empty and closed: done
            if (closed && sendWaiters.length === 0) {
              return Promise.resolve({ done: true, value: undefined });
            }

            // Wait for a value
            return new Promise<IteratorResult<T>>(resolve => {
              receiveWaiters.push({ resolve });
            });
          },
        };
      },
    }),

    close: (): void => {
      closed = true;
      // Reject all pending senders
      for (const waiter of sendWaiters) {
        waiter.resolve(false);
      }
      sendWaiters.length = 0;
      // Signal all waiting receivers that we're done
      for (const waiter of receiveWaiters) {
        waiter.resolve({ done: true, value: undefined });
      }
      receiveWaiters.length = 0;
    },

    isClosed: () => closed,
    size: () => buffer.length,
  });
};

const createUnboundedChannel = <T>(): Channel<T> => createBoundedChannel(Number.MAX_SAFE_INTEGER);

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create async channels for producer/consumer communication.
 *
 * @example
 * ```ts
 * // Bounded: backpressure when buffer fills
 * const ch = Channel.bounded<string>(100);
 *
 * // Unbounded: never blocks on send (use with caution)
 * const ch = Channel.unbounded<string>();
 *
 * // Bridge push source to Stream
 * const stream = Stream.from(ch.receive());
 * ```
 */
export const Channel: {
  readonly bounded: <T>(capacity: number) => Channel<T>;
  readonly unbounded: <T>() => Channel<T>;
} = {
  bounded: createBoundedChannel,
  unbounded: createUnboundedChannel,
};
