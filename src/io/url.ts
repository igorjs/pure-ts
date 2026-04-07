/**
 * @module io/url
 *
 * Type-safe URL parsing and query string operations.
 *
 * **Why wrap URL / URLSearchParams?**
 * `new URL()` throws TypeError on invalid input, forcing try/catch at
 * every call site. Wrapping in Result makes the failure path explicit.
 * URLSearchParams construction never throws but its API is awkward for
 * building and parsing plain objects. These helpers bridge the gap.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** URL parsing or construction failed. */
export const UrlError: ErrTypeConstructor<"UrlError", string> = ErrType("UrlError");

// ── Url ─────────────────────────────────────────────────────────────────────

/**
 * Type-safe URL parsing and query string utilities.
 *
 * Uses the web standard `URL` and `URLSearchParams` APIs available
 * in all modern runtimes.
 *
 * @example
 * ```ts
 * Url.parse('https://example.com/path');
 * // Ok(URL { href: 'https://example.com/path' })
 *
 * Url.parse('not a url');
 * // Err(UrlError('Invalid URL: not a url'))
 *
 * Url.searchParams({ page: '1', q: 'hello' });
 * // 'page=1&q=hello'
 *
 * Url.parseSearchParams('page=1&q=hello');
 * // { page: '1', q: 'hello' }
 * ```
 */
export const Url: {
  /** Parse a URL string, optionally relative to a base. */
  readonly parse: (input: string, base?: string) => Result<URL, ErrType<"UrlError">>;
  /** Build a query string from a plain object. */
  readonly searchParams: (params: Record<string, string>) => string;
  /** Parse a query string into a plain object. */
  readonly parseSearchParams: (query: string) => Record<string, string>;
} = {
  parse: (input: string, base?: string): Result<URL, ErrType<"UrlError">> => {
    try {
      return Ok(new URL(input, base));
    } catch (e) {
      return Err(UrlError(e instanceof Error ? e.message : String(e)));
    }
  },

  searchParams: (params: Record<string, string>): string => new URLSearchParams(params).toString(),

  parseSearchParams: (query: string): Record<string, string> => {
    // Strip leading '?' if present for convenience.
    const cleaned = query.startsWith("?") ? query.slice(1) : query;
    const result: Record<string, string> = {};
    for (const [key, value] of new URLSearchParams(cleaned)) {
      result[key] = value;
    }
    return result;
  },
};
