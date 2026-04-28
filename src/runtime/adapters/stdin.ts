/**
 * @module runtime/adapters/stdin
 *
 * Stdin/stdout adapter implementations for Deno and Node/Bun.
 */

import { getDeno, getNodeProcess, importNode } from "./detect.js";
import type { Stdin, Stdout } from "./types.js";

// ── Node structural types ───────────────────────────────────────────────────

interface NodeReadlineModule {
  createInterface(opts: { input: unknown; output?: unknown; terminal?: boolean }): {
    question(query: string, cb: (answer: string) => void): void;
    close(): void;
    on(event: string, cb: (...args: readonly unknown[]) => void): unknown;
  };
}

const getNodeReadline = importNode<NodeReadlineModule>("node:readline");

// ── Helpers ─────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ── Deno read-line helper ───────────────────────────────────────────────────

const denoReadLine = async (stdin: {
  read(buf: Uint8Array): Promise<number | null>;
}): Promise<string | null> => {
  const buf = new Uint8Array(4096);
  const chunks: Uint8Array[] = [];
  let totalLen = 0;

  while (true) {
    const n = await stdin.read(buf);
    if (n === null) return totalLen === 0 ? null : decoder.decode(concat(chunks, totalLen));

    const slice = buf.subarray(0, n);
    const nlIdx = slice.indexOf(10);
    if (nlIdx !== -1) {
      chunks.push(slice.subarray(0, nlIdx));
      totalLen += nlIdx;
      let line = decoder.decode(concat(chunks, totalLen));
      if (line.endsWith("\r")) line = line.slice(0, -1);
      return line;
    }

    chunks.push(new Uint8Array(slice));
    totalLen += n;
  }
};

// ── Deno stdin adapter ──────────────────────────────────────────────────────

const createDenoStdin = (): Stdin | undefined => {
  const deno = getDeno();
  if (deno === undefined) return undefined;

  return {
    isTTY: deno.stdin.isTerminal(),

    readLine: async prompt => {
      if (prompt.length > 0) deno.stdout.writeSync(encoder.encode(prompt));
      return denoReadLine(deno.stdin);
    },

    readAll: async () => {
      if (deno.stdin.isTerminal()) return "";

      const chunks: Uint8Array[] = [];
      const buf = new Uint8Array(65536);
      let totalLen = 0;

      while (true) {
        const n = await deno.stdin.read(buf);
        if (n === null) break;
        chunks.push(new Uint8Array(buf.subarray(0, n)));
        totalLen += n;
      }

      return decoder.decode(concat(chunks, totalLen));
    },

    setRawMode: mode => deno.stdin.setRaw(mode),
    readRaw: buf => deno.stdin.read(buf),
  };
};

// ── Node/Bun stdin adapter ──────────────────────────────────────────────────

const createNodeStdin = (): Stdin | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  const base: Stdin = {
    isTTY: proc.stdin.isTTY === true,

    readLine: async prompt => {
      const rl = await getNodeReadline();
      if (rl === null) return null;

      const iface = rl.createInterface({
        input: proc.stdin,
        output: proc.stdout,
        terminal: proc.stdin.isTTY === true,
      });

      return new Promise<string | null>(resolve => {
        let settled = false;
        iface.question(prompt, answer => {
          if (!settled) {
            settled = true;
            iface.close();
            resolve(answer);
          }
        });
        iface.on("close", () => {
          if (!settled) {
            settled = true;
            resolve(null);
          }
        });
      });
    },

    readAll: async () => {
      if (proc.stdin.isTTY === true) return "";

      if (proc.stdin.setEncoding !== undefined) proc.stdin.setEncoding("utf8");
      proc.stdin.resume();

      const chunks: string[] = [];

      return new Promise<string>((resolve, reject) => {
        proc.stdin.on("data", (chunk: unknown) => chunks.push(String(chunk)));
        proc.stdin.on("end", () => resolve(chunks.join("")));
        proc.stdin.on("error", (err: unknown) =>
          reject(err instanceof Error ? err : new Error(String(err))),
        );
      });
    },

    onData: cb => {
      const handler = (chunk: unknown): void => cb(String(chunk));
      proc.stdin.on("data", handler);
      return () => proc.stdin.removeListener("data", handler);
    },
  };

  if (proc.stdin.setRawMode !== undefined) {
    base.setRawMode = mode => {
      proc.stdin.setRawMode!(mode);
      if (mode) {
        if (proc.stdin.setEncoding !== undefined) proc.stdin.setEncoding("utf8");
        proc.stdin.resume();
      } else {
        proc.stdin.pause();
      }
    };
  }

  return base;
};

// ── Stdout adapters ─────────────────────────────────────────────────────────

const createDenoStdout = (): Stdout | undefined => {
  const deno = getDeno();
  if (deno === undefined) return undefined;

  let columns: number | undefined;
  let rows: number | undefined;
  try {
    const size = deno.consoleSize?.();
    columns = size?.columns;
    rows = size?.rows;
  } catch {
    // consoleSize throws ENOTTY when no terminal is attached (e.g. CI)
  }

  return {
    write: text => deno.stdout.writeSync(encoder.encode(text)),
    columns,
    rows,
  };
};

const createNodeStdout = (): Stdout | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  return {
    write: text => proc.stdout.write(text),
    columns: proc.stdout.columns,
    rows: proc.stdout.rows,
  };
};

const createNodeStderr = (): Stdout | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;
  return { write: text => proc.stderr.write(text) };
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const concat = (chunks: Uint8Array[], totalLen: number): Uint8Array => {
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the stdin adapter for the current runtime. */
export const resolveStdin = (): Stdin | undefined => createDenoStdin() ?? createNodeStdin();

/** Resolve the stdout adapter for the current runtime. */
export const resolveStdout = (): Stdout | undefined => createDenoStdout() ?? createNodeStdout();

/** Resolve the stderr adapter for the current runtime. */
export const resolveStderr = (): Stdout | undefined => createNodeStderr() ?? createDenoStdout();
