/**
 * @module client
 *
 * Type-safe HTTP client built on Task.
 *
 * **Why Client instead of raw fetch?**
 * `fetch` throws on network errors, returns 404/500 as "success", and
 * gives you untyped `Response`. Client wraps fetch in Task: network
 * errors become `Err(HttpError)`, non-2xx responses are explicit errors,
 * and response parsing uses Codec/Schema for typed output. Integrates
 * with Retry, CircuitBreaker, and RateLimiter.
 */

import type { Result } from "./core/result.js";
import { castErr, Err, Ok } from "./core/result.js";
import { ErrType, type ErrTypeConstructor } from "./types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Network-level failure (DNS, timeout, connection refused). */
export const NetworkError: ErrTypeConstructor<"NetworkError", string> = ErrType("NetworkError");

/** Server returned a non-2xx status code. */
export const HttpError: ErrTypeConstructor<"HttpError", string> = ErrType("HttpError");

/** Response body could not be parsed (JSON, text, etc.). */
export const ParseError: ErrTypeConstructor<"ParseError", string> = ErrType("ParseError");

/** Union of all client error types. */
export type ClientError = ErrType<"NetworkError"> | ErrType<"HttpError"> | ErrType<"ParseError">;

// ── Types ───────────────────────────────────────────────────────────────────

/** Task-like interface. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

/** Request options for the client. */
interface ClientRequestOptions {
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | ReadableStream<Uint8Array> | null;
  readonly signal?: AbortSignal;
}

/** A typed HTTP response wrapper. */
export interface ClientResponse {
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly raw: Response;
  /** Parse body as JSON. Returns Result. */
  readonly json: <T = unknown>() => Promise<Result<T, ErrType<"ParseError">>>;
  /** Read body as text. Returns Result. */
  readonly text: () => Promise<Result<string, ErrType<"ParseError">>>;
}

// ── Response wrapper ────────────────────────────────────────────────────────

const wrapResponse = (raw: Response): ClientResponse =>
  Object.freeze({
    status: raw.status,
    statusText: raw.statusText,
    headers: raw.headers,
    raw,
    json: async <T = unknown>(): Promise<Result<T, ErrType<"ParseError">>> => {
      try {
        return Ok((await raw.json()) as T);
      } catch (e) {
        return Err(ParseError(e instanceof Error ? e.message : String(e)));
      }
    },
    text: async (): Promise<Result<string, ErrType<"ParseError">>> => {
      try {
        return Ok(await raw.text());
      } catch (e) {
        return Err(ParseError(e instanceof Error ? e.message : String(e)));
      }
    },
  });

// ── Client implementation ───────────────────────────────────────────────────

/** Configuration for creating a Client. */
export interface ClientOptions {
  /** Base URL prepended to all request paths. */
  readonly baseUrl?: string;
  /** Default headers included in every request. */
  readonly headers?: Readonly<Record<string, string>>;
  /** Custom fetch implementation (for testing or polyfills). */
  readonly fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

/**
 * An HTTP client instance.
 *
 * @example
 * ```ts
 * const api = Client.create({ baseUrl: 'https://api.example.com' });
 *
 * const users = api.get('/users')
 *   .map(res => res.json())
 *   .flatMap(task => task);
 *
 * await users.run();  // Result<User[], ClientError>
 * ```
 */
export interface ClientInstance {
  readonly get: (
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
  readonly post: (
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
  readonly put: (
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
  readonly patch: (
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
  readonly delete: (
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
  readonly request: (
    method: string,
    path: string,
    options?: ClientRequestOptions,
  ) => TaskLike<ClientResponse, ClientError>;
}

const createClient = (config: ClientOptions = {}): ClientInstance => {
  // Why: globalThis doesn't always declare fetch. Access structurally.
  const defaultFetch = (
    globalThis as unknown as {
      fetch?: (input: string | URL, init?: RequestInit) => Promise<Response>;
    }
  ).fetch;
  const fetchFn = config.fetch ?? defaultFetch;
  if (fetchFn === undefined) {
    throw new Error("fetch is not available. Provide a custom fetch in ClientOptions.");
  }
  const baseUrl = config.baseUrl ?? "";
  const baseHeaders = config.headers ?? {};

  /** Build RequestInit from method, headers, and options. */
  const buildInit = (
    method: string,
    headers: Record<string, string>,
    options?: ClientRequestOptions,
  ): RequestInit => {
    const init: RequestInit = { method, headers };
    if (options?.body !== undefined && options.body !== null) {
      (init as { body: string | ReadableStream<Uint8Array> }).body = options.body;
    }
    if (options?.signal !== undefined) {
      (init as { signal: AbortSignal }).signal = options.signal;
    }
    return init;
  };

  /** Execute fetch, mapping errors to Result. */
  const executeFetch = async (
    url: string,
    init: RequestInit,
  ): Promise<Result<Response, ClientError>> => {
    try {
      return Ok(await fetchFn(url, init));
    } catch (e) {
      return Err(NetworkError(e instanceof Error ? e.message : String(e)));
    }
  };

  const request = (
    method: string,
    path: string,
    options?: ClientRequestOptions,
  ): TaskLike<ClientResponse, ClientError> =>
    mkTask(async (): Promise<Result<ClientResponse, ClientError>> => {
      const url = baseUrl + path;
      const headers = { ...baseHeaders, ...options?.headers };
      const init = buildInit(method, headers, options);

      const fetchResult = await executeFetch(url, init);
      if (fetchResult.isErr) return castErr(fetchResult);

      const response = fetchResult.value;
      if (!response.ok) {
        return Err(
          HttpError(`${response.status} ${response.statusText}`, {
            status: response.status,
            statusText: response.statusText,
            url,
          }),
        );
      }

      return Ok(wrapResponse(response));
    });

  return Object.freeze({
    get: (path: string, options?: ClientRequestOptions) => request("GET", path, options),
    post: (path: string, options?: ClientRequestOptions) => request("POST", path, options),
    put: (path: string, options?: ClientRequestOptions) => request("PUT", path, options),
    patch: (path: string, options?: ClientRequestOptions) => request("PATCH", path, options),
    delete: (path: string, options?: ClientRequestOptions) => request("DELETE", path, options),
    request,
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create typed HTTP clients.
 *
 * @example
 * ```ts
 * const api = Client.create({
 *   baseUrl: 'https://api.example.com',
 *   headers: { Authorization: 'Bearer token' },
 * });
 *
 * const result = await api.get('/users').run();
 * if (result.isOk) {
 *   const body = await result.value.json<User[]>();
 * }
 * ```
 */
export const Client: {
  readonly create: (options?: ClientOptions) => ClientInstance;
} = {
  create: createClient,
};
