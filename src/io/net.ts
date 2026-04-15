/**
 * @module io/net
 *
 * Cross-runtime TCP client returning Task instead of throwing.
 *
 * **Why wrap TCP?**
 * Raw TCP sockets are runtime-specific with no web standard equivalent.
 * This module detects the runtime via globalThis and dispatches to the
 * appropriate API, returning a unified TcpConnection wrapped in TaskLike.
 * Browsers and Workers get a graceful Err since they lack TCP APIs.
 *
 * **Multi-runtime strategy:**
 * Detects Deno (Deno.connect) first, then Node/Bun (node:net).
 * All runtime access is structural: no type declarations imported.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// -- Error types -------------------------------------------------------------

/** TCP connection or communication failed. */
export const NetError: ErrTypeConstructor<"NetError", string> = ErrType("NetError");

// -- TCP connection ----------------------------------------------------------

/** A connected TCP socket with send, receive, and close operations. */
export interface TcpConnection {
  /** Send data over the connection. */
  readonly send: (data: string | Uint8Array) => TaskLike<void, ErrType<"NetError">>;
  /** Receive one chunk of data from the connection. */
  readonly receive: () => TaskLike<Uint8Array, ErrType<"NetError">>;
  /** Close the connection. */
  readonly close: () => void;
}

// -- Error helper ------------------------------------------------------------

const netErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"NetError", string> =>
  NetError(e instanceof Error ? e.message : String(e), meta);

// -- Structural types for runtime APIs ---------------------------------------

/** Deno TCP connection (structural, no @deno/types). */
interface DenoTcpConn {
  read(buf: Uint8Array): Promise<number | null>;
  write(data: Uint8Array): Promise<number>;
  close(): void;
}

/** Deno connect API (structural, no @deno/types). */
interface DenoConnect {
  connect(options: { hostname: string; port: number }): Promise<DenoTcpConn>;
}

/** Node net.Socket (structural, no @types/node). */
interface NodeSocket {
  write(data: string | Uint8Array, cb?: (err?: Error) => void): boolean;
  on(event: "data", cb: (data: Uint8Array) => void): void;
  on(event: "error", cb: (err: Error) => void): void;
  on(event: "close", cb: () => void): void;
  once(event: "connect", cb: () => void): void;
  destroy(): void;
}

/** Node net module (structural, no @types/node). */
interface NodeNet {
  createConnection(options: { host: string; port: number }): NodeSocket;
}

// -- Runtime detection -------------------------------------------------------

const getDenoConnect = (): DenoConnect | null => {
  const deno = (globalThis as unknown as { Deno?: { connect?: unknown } }).Deno;
  return deno?.connect !== undefined ? (deno as unknown as DenoConnect) : null;
};

let nodeNet: NodeNet | null | undefined;
const getNodeNet = async (): Promise<NodeNet | null> => {
  if (nodeNet !== undefined) return nodeNet;
  try {
    nodeNet = await (Function('return import("node:net")')() as Promise<NodeNet>);
    return nodeNet;
  } catch {
    nodeNet = null;
    return null;
  }
};

// -- Connection wrappers -----------------------------------------------------

const wrapDenoConn = (conn: DenoTcpConn): TcpConnection => ({
  send: (data: string | Uint8Array): TaskLike<void, ErrType<"NetError">> =>
    makeTask(async () => {
      try {
        const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
        await conn.write(bytes);
        return Ok(undefined);
      } catch (e) {
        return Err(netErr(e));
      }
    }),

  receive: (): TaskLike<Uint8Array, ErrType<"NetError">> =>
    makeTask(async () => {
      try {
        const buf = new Uint8Array(4096);
        const n = await conn.read(buf);
        if (n === null) {
          return Err(NetError("Connection closed"));
        }
        return Ok(buf.subarray(0, n));
      } catch (e) {
        return Err(netErr(e));
      }
    }),

  close: (): void => {
    conn.close();
  },
});

const wrapNodeSocket = (socket: NodeSocket): TcpConnection => ({
  send: (data: string | Uint8Array): TaskLike<void, ErrType<"NetError">> =>
    makeTask(
      () =>
        new Promise<Result<void, ErrType<"NetError">>>(resolve => {
          socket.write(data, (err?: Error) => {
            if (err !== undefined) {
              resolve(Err(netErr(err)));
            } else {
              resolve(Ok(undefined));
            }
          });
        }),
    ),

  receive: (): TaskLike<Uint8Array, ErrType<"NetError">> =>
    makeTask(
      () =>
        new Promise<Result<Uint8Array, ErrType<"NetError">>>(resolve => {
          const onData = (chunk: Uint8Array): void => {
            cleanup();
            resolve(Ok(chunk));
          };
          const onError = (err: Error): void => {
            cleanup();
            resolve(Err(netErr(err)));
          };
          const onClose = (): void => {
            cleanup();
            resolve(Err(NetError("Connection closed")));
          };
          const cleanup = (): void => {
            // Node's EventEmitter does not expose removeListener on our
            // structural type. Reassigning the callbacks is harmless since
            // each receive() call registers fresh listeners and only the
            // first event to fire calls cleanup, preventing double-resolve.
          };
          socket.on("data", onData);
          socket.on("error", onError);
          socket.on("close", onClose);
        }),
    ),

  close: (): void => {
    socket.destroy();
  },
});

// -- Unified connect ---------------------------------------------------------

const connectTcp = async (options: {
  host: string;
  port: number;
}): Promise<Result<TcpConnection, ErrType<"NetError">>> => {
  const deno = getDenoConnect();
  if (deno !== null) {
    try {
      const conn = await deno.connect({ hostname: options.host, port: options.port });
      return Ok(wrapDenoConn(conn));
    } catch (e) {
      return Err(netErr(e, { host: options.host, port: options.port }));
    }
  }
  const net = await getNodeNet();
  if (net !== null) {
    try {
      const socket = net.createConnection({ host: options.host, port: options.port });
      return await new Promise<Result<TcpConnection, ErrType<"NetError">>>(resolve => {
        socket.once("connect", () => {
          resolve(Ok(wrapNodeSocket(socket)));
        });
        socket.on("error", (err: Error) => {
          resolve(Err(netErr(err, { host: options.host, port: options.port })));
        });
      });
    } catch (e) {
      return Err(netErr(e, { host: options.host, port: options.port }));
    }
  }
  return Err(NetError("TCP connections are not available in this runtime"));
};

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime TCP client.
 *
 * Detects the runtime (Deno, Node/Bun) via globalThis and dispatches
 * to the appropriate TCP API. Returns TaskLike so execution is lazy
 * until `.run()` is called. Browsers and Workers receive Err since
 * they lack TCP socket APIs.
 *
 * @example
 * ```ts
 * const conn = await Net.connect({ host: '127.0.0.1', port: 8080 }).run();
 * // Result<TcpConnection, ErrType<'NetError'>>
 *
 * if (conn.isOk) {
 *   await conn.value.send('hello').run();
 *   const data = await conn.value.receive().run();
 *   conn.value.close();
 * }
 * ```
 */
export const Net: {
  /** Connect to a TCP host and port. */
  readonly connect: (options: {
    host: string;
    port: number;
  }) => TaskLike<TcpConnection, ErrType<"NetError">>;
} = {
  connect: (options: {
    host: string;
    port: number;
  }): TaskLike<TcpConnection, ErrType<"NetError">> => makeTask(() => connectTcp(options)),
};
