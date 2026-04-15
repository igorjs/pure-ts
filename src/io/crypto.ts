/**
 * @module io/crypto
 *
 * Type-safe wrappers for the Web Crypto API (globalThis.crypto).
 *
 * **Why wrap crypto?**
 * `crypto.subtle.digest` returns a raw ArrayBuffer via Promise and
 * `crypto.getRandomValues` can throw on invalid length. Wrapping these
 * in Result/Task makes failure paths explicit and keeps the API
 * consistent with the rest of pure-ts. Uses only web standard APIs
 * available in Node 22+, Deno, and Bun with no imports required.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Cryptographic operation failed. */
export const CryptoError: ErrTypeConstructor<"CryptoError", string> = ErrType("CryptoError");

// ── Structural type for Web Crypto API ──────────────────────────────────────
// Why: tsconfig uses "lib": ["es2024"] without DOM types. Access crypto
// structurally to avoid requiring @types/node or DOM lib.

interface SubtleCrypto {
  digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
}

interface WebCrypto {
  randomUUID(): string;
  getRandomValues(array: Uint8Array): Uint8Array;
  readonly subtle: SubtleCrypto;
}

/** Access globalThis.crypto structurally. */
const getCrypto = (): WebCrypto => (globalThis as unknown as { crypto: WebCrypto }).crypto;

// ── Crypto ──────────────────────────────────────────────────────────────────

/**
 * Type-safe cryptographic operations using the Web Crypto API.
 *
 * All methods use `globalThis.crypto` which is available in Node 22+,
 * Deno, and Bun without any imports.
 *
 * @example
 * ```ts
 * const id = Crypto.uuid();              // 'f47ac10b-58cc-...'
 * const bytes = Crypto.randomBytes(32);  // Ok(Uint8Array[32])
 *
 * const digest = await Crypto.hash('SHA-256', 'hello').run();
 * // Ok(Uint8Array[32])
 *
 * Crypto.timingSafeEqual(a, b);          // true/false
 * ```
 */
export const Crypto: {
  /** Generate a random UUID v4. Never fails. */
  readonly uuid: () => string;
  /** Generate cryptographically random bytes. */
  readonly randomBytes: (length: number) => Result<Uint8Array, ErrType<"CryptoError">>;
  /** Hash data using a digest algorithm. Returns Task since the operation is async. */
  readonly hash: (
    algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512",
    data: string | Uint8Array,
  ) => TaskLike<Uint8Array, ErrType<"CryptoError">>;
  /** Constant-time comparison of two byte arrays to prevent timing attacks. */
  readonly timingSafeEqual: (a: Uint8Array, b: Uint8Array) => boolean;
} = {
  uuid: (): string => getCrypto().randomUUID(),

  randomBytes: (length: number): Result<Uint8Array, ErrType<"CryptoError">> => {
    try {
      return Ok(getCrypto().getRandomValues(new Uint8Array(length)));
    } catch (e) {
      return Err(CryptoError(e instanceof Error ? e.message : String(e)));
    }
  },

  hash: (algorithm: "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512", data: string | Uint8Array) =>
    makeTask(async () => {
      try {
        const input = typeof data === "string" ? new TextEncoder().encode(data) : data;
        const buffer = await getCrypto().subtle.digest(algorithm, input);
        return Ok(new Uint8Array(buffer));
      } catch (e) {
        return Err(CryptoError(e instanceof Error ? e.message : String(e)));
      }
    }),

  timingSafeEqual: (a: Uint8Array, b: Uint8Array): boolean => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      // Bitwise OR accumulates differences without branching,
      // ensuring the loop runs in constant time regardless of content.
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    return diff === 0;
  },
};
