/**
 * @module io/encoding
 *
 * Type-safe binary encoding/decoding for base64, hex, and UTF-8.
 *
 * **Why wrap TextEncoder / atob / btoa?**
 * `atob` throws on invalid base64 input. `TextDecoder` can throw on
 * malformed byte sequences. Hex encoding has no built-in API at all.
 * Wrapping these in Result makes failure paths explicit. Uses only
 * web standard APIs (TextEncoder, TextDecoder, atob, btoa) available
 * in all modern runtimes.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Encoding or decoding operation failed. */
export const EncodingError: ErrTypeConstructor<"EncodingError", string> = ErrType("EncodingError");

// ── Internal helpers ────────────────────────────────────────────────────────

/** Hex lookup table for encoding. Pre-computed for performance. */
const HEX_CHARS = "0123456789abcdef";

/** Shared TextEncoder instance. */
const encoder = new TextEncoder();

/**
 * Create a TextDecoder with fatal error mode.
 * Why: the es2024 lib's TextDecoder constructor signature accepts only
 * a label, not options. Access the options form structurally.
 */
const mkFatalDecoder = (): { decode(input: Uint8Array): string } => {
  const Ctor = TextDecoder as unknown as {
    new (label: string, options: { fatal: boolean }): { decode(input: Uint8Array): string };
  };
  return new Ctor("utf-8", { fatal: true });
};

const decoder = mkFatalDecoder();

// ── Encoding ────────────────────────────────────────────────────────────────

/**
 * Type-safe binary encoding and decoding.
 *
 * Supports base64, hex, and UTF-8 conversions. Encoding never fails;
 * decoding returns Result to surface invalid input.
 *
 * @example
 * ```ts
 * const bytes = Encoding.utf8.encode('hello');   // Uint8Array
 * const b64 = Encoding.base64.encode(bytes);     // 'aGVsbG8='
 * const hex = Encoding.hex.encode(bytes);         // '68656c6c6f'
 *
 * Encoding.base64.decode('aGVsbG8=');             // Ok(Uint8Array)
 * Encoding.base64.decode('!!!');                  // Err(EncodingError('...'))
 * ```
 */
export const Encoding: {
  /** Base64 encoding and decoding using atob/btoa. */
  readonly base64: {
    /** Encode bytes to a base64 string. */
    readonly encode: (data: Uint8Array) => string;
    /** Decode a base64 string to bytes. Returns Result on invalid input. */
    readonly decode: (str: string) => Result<Uint8Array, ErrType<"EncodingError">>;
  };
  /** Hexadecimal encoding and decoding. */
  readonly hex: {
    /** Encode bytes to a lowercase hex string. */
    readonly encode: (data: Uint8Array) => string;
    /** Decode a hex string to bytes. Returns Result on invalid input. */
    readonly decode: (str: string) => Result<Uint8Array, ErrType<"EncodingError">>;
  };
  /** UTF-8 encoding and decoding using TextEncoder/TextDecoder. */
  readonly utf8: {
    /** Encode a string to UTF-8 bytes. */
    readonly encode: (str: string) => Uint8Array;
    /** Decode UTF-8 bytes to a string. Returns Result on malformed input. */
    readonly decode: (data: Uint8Array) => Result<string, ErrType<"EncodingError">>;
  };
} = {
  base64: {
    encode: (data: Uint8Array): string => {
      // Build a binary string from byte values, then encode to base64.
      // This avoids spread (...data) which can blow the call stack on large arrays.
      let binary = "";
      for (const byte of data) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    },

    decode: (str: string): Result<Uint8Array, ErrType<"EncodingError">> => {
      try {
        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return Ok(bytes);
      } catch (e) {
        return Err(EncodingError(e instanceof Error ? e.message : String(e)));
      }
    },
  },

  hex: {
    encode: (data: Uint8Array): string => {
      let hex = "";
      for (const byte of data) {
        hex += HEX_CHARS[byte >> 4];
        hex += HEX_CHARS[byte & 0x0f];
      }
      return hex;
    },

    decode: (str: string): Result<Uint8Array, ErrType<"EncodingError">> => {
      if (str.length % 2 !== 0) {
        return Err(EncodingError("Hex string must have even length"));
      }
      try {
        const bytes = new Uint8Array(str.length / 2);
        for (let i = 0; i < str.length; i += 2) {
          const high = Number.parseInt(str[i] ?? "0", 16);
          const low = Number.parseInt(str[i + 1] ?? "0", 16);
          if (Number.isNaN(high) || Number.isNaN(low)) {
            return Err(EncodingError(`Invalid hex character at position ${i}`));
          }
          bytes[i / 2] = (high << 4) | low;
        }
        return Ok(bytes);
      } catch (e) {
        return Err(EncodingError(e instanceof Error ? e.message : String(e)));
      }
    },
  },

  utf8: {
    encode: (str: string): Uint8Array => encoder.encode(str),

    decode: (data: Uint8Array): Result<string, ErrType<"EncodingError">> => {
      try {
        return Ok(decoder.decode(data));
      } catch (e) {
        return Err(EncodingError(e instanceof Error ? e.message : String(e)));
      }
    },
  },
};
