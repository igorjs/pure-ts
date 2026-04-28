/**
 * @module runtime/adapters/process-adapter
 *
 * Process information adapter implementations for Deno and Node/Bun.
 */

import { getDeno, getNodeProcess } from "./detect.js";
import type { ProcessInfo, ProcessMemory } from "./types.js";

// ── Deno adapter ────────────────────────────────────────────────────────────

const createDenoProcessInfo = (): ProcessInfo | undefined => {
  const deno = getDeno();
  if (deno === undefined) return undefined;

  const denoEnv = (deno as unknown as { env?: { get?(key: string): string | undefined } }).env;

  return {
    cwd: () => deno.cwd(),
    pid: deno.pid,
    argv: deno.args,
    env: key => {
      try {
        return denoEnv?.get?.(key);
      } catch {
        return undefined;
      }
    },
    exit: (code?) => deno.exit(code),
  };
};

// ── Node/Bun adapter ────────────────────────────────────────────────────────

const createNodeProcessInfo = (): ProcessInfo | undefined => {
  const proc = getNodeProcess();
  if (proc === undefined) return undefined;

  return {
    cwd: () => proc.cwd(),
    pid: proc.pid,
    argv: proc.argv.slice(2),
    env: key => proc.env[key],
    exit: (code?) => proc.exit(code),
    uptime: () => proc.uptime(),
    memoryUsage: (): ProcessMemory => {
      const mem = proc.memoryUsage();
      return { heapUsed: mem.heapUsed, heapTotal: mem.heapTotal, rss: mem.rss };
    },
  };
};

// ── Resolve ─────────────────────────────────────────────────────────────────

/** Resolve the process info adapter for the current runtime. */
export const resolveProcessInfo = (): ProcessInfo | undefined =>
  createDenoProcessInfo() ?? createNodeProcessInfo();
