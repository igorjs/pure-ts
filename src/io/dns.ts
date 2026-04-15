/**
 * @module io/dns
 *
 * Cross-runtime DNS resolution returning Task instead of throwing.
 *
 * **Why wrap DNS?**
 * DNS resolution is inherently platform-specific with no web standard
 * equivalent. This module detects the runtime via globalThis and
 * dispatches to the appropriate API, returning a unified DnsRecord
 * or string array wrapped in TaskLike. Browsers and Workers get a
 * graceful Err since they lack DNS APIs.
 *
 * **Multi-runtime strategy:**
 * Detects Deno (Deno.resolveDns) first, then Node/Bun (node:dns/promises).
 * All runtime access is structural: no type declarations imported.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// -- Error types -------------------------------------------------------------

/** DNS resolution failed. */
export const DnsError: ErrTypeConstructor<"DnsError", string> = ErrType("DnsError");

// -- DNS record --------------------------------------------------------------

/** A resolved DNS address with IP family. */
export interface DnsRecord {
  /** The resolved IP address. */
  readonly address: string;
  /** The IP address family (4 for IPv4, 6 for IPv6). */
  readonly family: 4 | 6;
}

// -- Error helper ------------------------------------------------------------

const dnsErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"DnsError", string> =>
  DnsError(e instanceof Error ? e.message : String(e), meta);

// -- Structural types for runtime APIs ---------------------------------------

/** Deno DNS resolution API (structural, no @deno/types). */
interface DenoDns {
  resolveDns(hostname: string, type: "A" | "AAAA" | "CNAME" | "MX" | "TXT"): Promise<string[]>;
}

/** Node dns/promises API (structural, no @types/node). */
interface NodeDns {
  lookup(hostname: string): Promise<{ address: string; family: number }>;
  resolve(hostname: string, rrtype: string): Promise<string[]>;
}

// -- Runtime detection -------------------------------------------------------

const getDenoDns = (): DenoDns | null => {
  const deno = (globalThis as unknown as { Deno?: { resolveDns?: unknown } }).Deno;
  return deno?.resolveDns !== undefined ? (deno as unknown as DenoDns) : null;
};

let nodeDns: NodeDns | null | undefined;
const getNodeDns = async (): Promise<NodeDns | null> => {
  if (nodeDns !== undefined) return nodeDns;
  try {
    nodeDns = await (Function('return import("node:dns/promises")')() as Promise<NodeDns>);
    return nodeDns;
  } catch {
    nodeDns = null;
    return null;
  }
};

// -- Unified operations ------------------------------------------------------

/** DNS record type for resolution queries. */
export type DnsType = "A" | "AAAA" | "CNAME" | "MX" | "TXT";

const lookupHost = async (hostname: string): Promise<Result<DnsRecord, ErrType<"DnsError">>> => {
  const deno = getDenoDns();
  if (deno !== null) {
    try {
      const addresses = await deno.resolveDns(hostname, "A");
      const first = addresses[0];
      if (first === undefined) {
        return Err(DnsError("No addresses found", { hostname }));
      }
      return Ok({ address: first, family: 4 });
    } catch (e) {
      return Err(dnsErr(e, { hostname }));
    }
  }
  const node = await getNodeDns();
  if (node !== null) {
    try {
      const result = await node.lookup(hostname);
      return Ok({ address: result.address, family: result.family === 6 ? 6 : 4 });
    } catch (e) {
      return Err(dnsErr(e, { hostname }));
    }
  }
  return Err(DnsError("DNS resolution is not available in this runtime"));
};

const resolveRecords = async (
  hostname: string,
  type: DnsType,
): Promise<Result<readonly string[], ErrType<"DnsError">>> => {
  const deno = getDenoDns();
  if (deno !== null) {
    try {
      return Ok(await deno.resolveDns(hostname, type));
    } catch (e) {
      return Err(dnsErr(e, { hostname, type }));
    }
  }
  const node = await getNodeDns();
  if (node !== null) {
    try {
      return Ok(await node.resolve(hostname, type));
    } catch (e) {
      return Err(dnsErr(e, { hostname, type }));
    }
  }
  return Err(DnsError("DNS resolution is not available in this runtime"));
};

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime DNS resolution.
 *
 * Detects the runtime (Deno, Node/Bun) via globalThis and dispatches
 * to the appropriate DNS API. Returns TaskLike so execution is lazy
 * until `.run()` is called. Browsers and Workers receive Err since
 * they lack DNS resolution APIs.
 *
 * @example
 * ```ts
 * const record = await Dns.lookup('example.com').run();
 * // Result<DnsRecord, ErrType<'DnsError'>>
 *
 * const mx = await Dns.resolve('example.com', 'MX').run();
 * // Result<readonly string[], ErrType<'DnsError'>>
 * ```
 */
export const Dns: {
  /** Resolve a hostname to an address and IP family. */
  readonly lookup: (hostname: string) => TaskLike<DnsRecord, ErrType<"DnsError">>;
  /** Resolve DNS records of a specific type. */
  readonly resolve: (
    hostname: string,
    type?: DnsType,
  ) => TaskLike<readonly string[], ErrType<"DnsError">>;
} = {
  lookup: (hostname: string): TaskLike<DnsRecord, ErrType<"DnsError">> =>
    makeTask(() => lookupHost(hostname)),
  resolve: (hostname: string, type?: DnsType): TaskLike<readonly string[], ErrType<"DnsError">> =>
    makeTask(() => resolveRecords(hostname, type ?? "A")),
};
