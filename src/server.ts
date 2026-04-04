/**
 * @module server
 *
 * Hono-inspired HTTP server with a builder pattern built on {@link Program}.
 *
 * **Why a server primitive in a functional library?**
 * HTTP servers are the most common entry point for production TypeScript.
 * Wrapping request handling in `Task<Response, ServerError>` ensures every
 * handler returns a typed result instead of throwing. The builder pattern
 * produces an immutable route table, and `.listen()` returns a {@link Program}
 * that provides graceful shutdown (SIGINT/SIGTERM) for free.
 *
 * **How routing works:**
 * Routes are compiled into a trie on first use (lazy). Static segments match
 * first, then `:param` captures, then `*` wildcards. The trie distinguishes
 * "no path match" (404) from "path matched but wrong method" (405).
 *
 * **How middleware works:**
 * Middleware wraps the inner handler as `next => req => Task`. Composition is
 * right-to-left so the first middleware in the array runs outermost (first).
 * The `derive()` method lets you accumulate typed context (e.g. auth, DB)
 * that is passed to downstream handlers.
 */

import { Task } from "./async/task.js";
import type { Result } from "./core/result.js";
import { Err, Ok } from "./core/result.js";
import { Program } from "./program.js";
import { ErrType, type ErrTypeConstructor } from "./types/error.js";

// ── Type-level utilities ────────────────────────────────────────────────────

/**
 * Extract parameter names from a route pattern literal.
 *
 * Recognises `:param` segments and trailing `*` wildcards so that
 * `Context<"/users/:id/posts/:postId">` has typed params `{ id, postId }`.
 */
export type ExtractParams<T extends string> = T extends `${string}:${infer Param}/${infer Rest}`
  ? Param | ExtractParams<Rest>
  : T extends `${string}:${infer Param}`
    ? Param
    : T extends `${string}*`
      ? "*"
      : never;

/** Mapped object type with a key for each extracted route parameter. */
export type Params<T extends string> = { readonly [K in ExtractParams<T>]: string };

// ── Error types ─────────────────────────────────────────────────────────────

/** No route matched the request path. */
export const RouteNotFound: ErrTypeConstructor<"RouteNotFound", string> = ErrType("RouteNotFound");

/** Route path matched but method is not registered for it. */
export const MethodNotAllowed: ErrTypeConstructor<"MethodNotAllowed", string> =
  ErrType("MethodNotAllowed");

/** Failed to read the request body. */
export const BodyReadError: ErrTypeConstructor<"BodyReadError", string> = ErrType("BodyReadError");

/** Handler threw or returned a failed Task. */
export const HandlerError: ErrTypeConstructor<"HandlerError", string> = ErrType("HandlerError");

/** Union of all server-related error types. */
export type ServerError =
  | ErrType<"RouteNotFound">
  | ErrType<"MethodNotAllowed">
  | ErrType<"BodyReadError">
  | ErrType<"HandlerError">;

// ── Public types ────────────────────────────────────────────────────────────

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

/** Request context passed to route handlers. */
export interface Context<P extends string = string> {
  readonly req: Request;
  readonly url: URL;
  readonly params: Params<P>;
}

/**
 * A route handler receives a {@link Context} and returns either a plain
 * Response (sync) or a Task wrapping one (async with typed errors).
 */
export type Handler<P extends string = string> = (
  ctx: Context<P>,
) => Response | Task<Response, ServerError>;

/**
 * Middleware wraps the next handler, enabling cross-cutting concerns
 * (logging, auth, CORS) without modifying route handlers.
 */
export type Middleware = (
  next: (req: Request) => Task<Response, ServerError>,
) => (req: Request) => Task<Response, ServerError>;

/**
 * Typed middleware that can extend the request context.
 *
 * Unlike plain Middleware, TypedMiddleware receives the accumulated
 * context and can add new fields. Each `.middleware()` call on the
 * builder accumulates the Ext type into the builder's Ctx parameter.
 *
 * @example
 * ```ts
 * const auth: TypedMiddleware<{}, { user: User }> = (next) => (req, ctx) =>
 *   Task(async () => {
 *     const user = await authenticate(req);
 *     return next(req, { ...ctx, user }).run();
 *   });
 * ```
 */
export type TypedMiddleware<
  In extends Record<string, unknown>,
  Out extends Record<string, unknown>,
> = (
  next: (req: Request, ctx: In & Out) => Task<Response, ServerError>,
) => (req: Request, ctx: In) => Task<Response, ServerError>;

/** Adapter interface for plugging in different HTTP server runtimes. */
export interface ServerAdapter {
  readonly serve: (
    handler: (request: Request) => Promise<Response>,
    options: {
      readonly port: number;
      readonly hostname?: string | undefined;
      readonly signal: AbortSignal;
    },
  ) => Promise<void>;
}

/** Options for starting the server with `.listen()`. */
export interface ListenOptions {
  readonly port: number;
  readonly hostname?: string | undefined;
  readonly teardownTimeoutMs?: number | undefined;
}

/** A single route definition stored in the builder. */
export interface RouteDefinition<P extends string = string> {
  readonly method: HttpMethod | "ALL";
  readonly pattern: P;
  readonly handler: Handler<P>;
}

// ── Response helpers ────────────────────────────────────────────────────────

/**
 * Merge user-supplied headers with defaults without mutating either.
 * Iterates the user Headers to build a plain object, then spreads defaults underneath.
 */
const mergeHeaders = (
  defaults: Record<string, string>,
  init?: ResponseInit,
): Record<string, string> => {
  if (init?.headers === undefined) return defaults;
  const userHeaders: Record<string, string> = {};
  const h = new Headers(init.headers);
  h.forEach((value, key) => {
    userHeaders[key] = value;
  });
  return { ...defaults, ...userHeaders };
};

/**
 * Build a ResponseInit with proper handling of optional statusText.
 * The globals.d.ts ResponseInit uses exactOptionalPropertyTypes,
 * so we must not pass undefined for statusText.
 */
const buildResponseInit = (
  status: number,
  statusText: string | undefined,
  headers: Record<string, string>,
): ResponseInit => {
  const init: { status: number; statusText?: string; headers: Record<string, string> } = {
    status,
    headers,
  };
  if (statusText !== undefined) {
    init.statusText = statusText;
  }
  return init;
};

/** Create a JSON response with `application/json` content-type. */
export const json = <T>(data: T, init?: ResponseInit): Response =>
  new Response(
    JSON.stringify(data),
    buildResponseInit(
      init?.status ?? 200,
      init?.statusText,
      mergeHeaders({ "content-type": "application/json; charset=utf-8" }, init),
    ),
  );

/** Create a plain text response with `text/plain` content-type. */
export const text = (body: string, init?: ResponseInit): Response =>
  new Response(
    body,
    buildResponseInit(
      init?.status ?? 200,
      init?.statusText,
      mergeHeaders({ "content-type": "text/plain; charset=utf-8" }, init),
    ),
  );

/** Create an HTML response with `text/html` content-type. */
export const html = (body: string, init?: ResponseInit): Response =>
  new Response(
    body,
    buildResponseInit(
      init?.status ?? 200,
      init?.statusText,
      mergeHeaders({ "content-type": "text/html; charset=utf-8" }, init),
    ),
  );

/** Create a redirect response (default 302). */
export const redirect = (url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response =>
  new Response(null, { status, headers: { location: url } });

// ── Trie router (internal) ──────────────────────────────────────────────────

/** A node in the route trie. Each segment level branches on static, param, or wildcard. */
interface RouteNode {
  readonly children: Map<string, RouteNode>;
  readonly param: { readonly name: string; readonly node: RouteNode } | null;
  readonly wildcard: { readonly handlers: Map<string, Handler> } | null;
  readonly handlers: Map<string, Handler>;
}

/** Create an empty trie node. */
const createNode = (): RouteNode => ({
  children: new Map(),
  param: null,
  wildcard: null,
  handlers: new Map(),
});

/** Insert a route into the trie, mutating nodes during build phase. */
const insertRoute = (root: RouteNode, method: string, pattern: string, handler: Handler): void => {
  const segments = pattern.split("/").filter(s => s.length > 0);
  let current = root;

  // biome-ignore lint/style/useForOf: hot-path, indexed loop avoids iterator allocation
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    if (seg === "*") {
      // Wildcard consumes the rest of the path
      const mutableCurrent = current as { wildcard: RouteNode["wildcard"] };
      if (mutableCurrent.wildcard === null) {
        mutableCurrent.wildcard = { handlers: new Map() };
      }
      mutableCurrent.wildcard!.handlers.set(method, handler);
      return;
    }

    if (seg.startsWith(":")) {
      // Param segment
      const paramName = seg.slice(1);
      const mutableCurrent = current as { param: RouteNode["param"] };
      if (mutableCurrent.param === null) {
        mutableCurrent.param = { name: paramName, node: createNode() };
      }
      current = mutableCurrent.param!.node;
    } else {
      // Static segment
      let child = current.children.get(seg);
      if (child === undefined) {
        child = createNode();
        current.children.set(seg, child);
      }
      current = child;
    }
  }

  current.handlers.set(method, handler);
};

/**
 * Build the trie from an array of route definitions.
 * After building, the trie is used read-only during request handling.
 */
const buildTrie = (routes: readonly RouteDefinition[]): RouteNode => {
  const root = createNode();
  // biome-ignore lint/style/useForOf: hot-path during server init
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]!;
    insertRoute(root, route.method, route.pattern, route.handler);
  }
  return root;
};

/** Result of a successful trie match. */
interface MatchResult {
  readonly handler: Handler;
  readonly params: Record<string, string>;
}

/** Look up a handler by method, falling back to "ALL". */
const resolveHandler = (handlers: Map<string, Handler>, method: string): Handler | undefined =>
  handlers.get(method) ?? handlers.get("ALL");

/** Try to match a wildcard node against the given method and remaining segments. */
const matchWildcard = (
  wildcard: { readonly handlers: Map<string, Handler> },
  method: string,
  params: Record<string, string>,
  remaining: string,
): Result<MatchResult, ServerError> => {
  params["*"] = remaining;
  const h = resolveHandler(wildcard.handlers, method);
  if (h !== undefined) return Ok({ handler: h, params });
  return Err(MethodNotAllowed(`Method ${method} not allowed`));
};

/** Resolve a handler at a leaf node, distinguishing 404 from 405. */
const matchLeaf = (
  node: RouteNode,
  method: string,
  pathname: string,
  params: Record<string, string>,
): Result<MatchResult, ServerError> => {
  if (node.handlers.size > 0) {
    const h = resolveHandler(node.handlers, method);
    if (h !== undefined) return Ok({ handler: h, params });
  }

  if (node.wildcard !== null) {
    params["*"] = "";
    const h = resolveHandler(node.wildcard.handlers, method);
    if (h !== undefined) return Ok({ handler: h, params });
  }

  // Determine whether the path was found but method was wrong
  const pathExists = node.handlers.size > 0 || node.wildcard !== null;
  if (pathExists) {
    return Err(MethodNotAllowed(`Method ${method} not allowed for ${pathname}`));
  }
  return Err(RouteNotFound(`No route matches ${pathname}`));
};

/**
 * Walk the trie to find a matching handler for a given method and path.
 *
 * Returns Ok with handler and params on match, or an appropriate
 * ServerError distinguishing 404 (no path) from 405 (wrong method).
 */
const matchRoute = (
  root: RouteNode,
  method: string,
  pathname: string,
): Result<MatchResult, ServerError> => {
  const segments = pathname.split("/").filter(s => s.length > 0);
  const params: Record<string, string> = {};
  let current = root;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;

    // Try static first
    const staticChild = current.children.get(seg);
    if (staticChild !== undefined) {
      current = staticChild;
      continue;
    }

    // Try param
    if (current.param !== null) {
      params[current.param.name] = seg;
      current = current.param.node;
      continue;
    }

    // Try wildcard (consumes rest from current position)
    if (current.wildcard !== null) {
      const remaining = segments.slice(i).join("/");
      return matchWildcard(current.wildcard, method, params, remaining);
    }

    return Err(RouteNotFound(`No route matches ${pathname}`));
  }

  return matchLeaf(current, method, pathname, params);
};

// ── Middleware composition ───────────────────────────────────────────────────

/**
 * Compose multiple middleware functions into one.
 *
 * Application order is left-to-right: `compose(a, b, c)` means `a` runs
 * first (outermost), wrapping `b`, which wraps `c`, which wraps the handler.
 * Internally composed right-to-left so the first middleware is outermost.
 */
export const compose = (...middlewares: readonly Middleware[]): Middleware => {
  return (next: (req: Request) => Task<Response, ServerError>) => {
    let handler = next;
    // Apply right-to-left so first middleware is outermost
    for (let i = middlewares.length - 1; i >= 0; i--) {
      handler = middlewares[i]!(handler);
    }
    return handler;
  };
};

// ── Default error handler (internal) ────────────────────────────────────────

const defaultErrorHandler = (error: ServerError, _req: Request): Response => {
  if (RouteNotFound.is(error)) return json({ error: error.message }, { status: 404 });
  if (MethodNotAllowed.is(error)) return json({ error: error.message }, { status: 405 });
  return json({ error: "Internal Server Error" }, { status: 500 });
};

// ── ServerBuilder interface ─────────────────────────────────────────────────

/**
 * Immutable builder for composing routes, middleware, and context derivers.
 *
 * Each method returns a new frozen builder. Route compilation into a trie
 * is deferred until the first call to `.fetch`, `.handle`, or `.listen()`.
 */
export interface ServerBuilder<Ctx extends Record<string, unknown> = Record<string, unknown>> {
  /** Register one or more middleware functions. */
  use(...middlewares: readonly Middleware[]): ServerBuilder<Ctx>;

  /**
   * Register typed middleware that can extend the context.
   *
   * Unlike `.use()`, typed middleware receives and can extend the
   * accumulated context type. Each call adds to Ctx.
   */
  middleware<Ext extends Record<string, unknown>>(
    mw: TypedMiddleware<Ctx, Ext>,
  ): ServerBuilder<Ctx & Ext>;

  /**
   * Derive additional typed context from the request.
   *
   * Resolvers run sequentially, each receiving the accumulated context
   * from previous derivers. If any resolver fails, the error short-circuits
   * to the error handler.
   */
  derive<Ext extends Record<string, unknown>>(
    resolver: (req: Request, ctx: Ctx) => Task<Ext, ServerError>,
  ): ServerBuilder<Ctx & Ext>;

  get<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  post<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  put<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  patch<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  delete<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  head<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  options<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;
  all<P extends string>(
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx>;

  /** Register a custom error handler. */
  onError(handler: (error: ServerError, request: Request) => Response): ServerBuilder<Ctx>;

  /** Convert a Request to a Response Promise (for use as a fetch handler). */
  readonly fetch: (request: Request) => Promise<Response>;

  /** Convert a Request to a Task of Response (typed error channel). */
  readonly handle: (request: Request) => Task<Response, ServerError>;

  /** Start listening, returning a Program for lifecycle management. */
  listen(options: ListenOptions, adapter?: ServerAdapter): Program<void, ServerError>;

  /** The server's name (used in Program logging). */
  readonly name: string;
}

// ── Builder implementation ──────────────────────────────────────────────────

/** Resolver function for derive(). Kept as a separate type for the internal array. */
type Deriver = (
  req: Request,
  ctx: Record<string, unknown>,
) => Task<Record<string, unknown>, ServerError>;

/**
 * Erased typed middleware stored internally.
 * The context types are erased to Record<string, unknown> for storage;
 * type safety is enforced at the public API boundary.
 */
type ErasedTypedMiddleware = (
  next: (req: Request, ctx: Record<string, unknown>) => Task<Response, ServerError>,
) => (req: Request, ctx: Record<string, unknown>) => Task<Response, ServerError>;

/**
 * Internal state carried by each builder snapshot.
 * The builder is closure-based: each method returns a new frozen object
 * that shares the same immutable config arrays (COW on modification).
 */
interface BuilderState {
  readonly serverName: string;
  readonly routes: readonly RouteDefinition[];
  readonly middlewares: readonly Middleware[];
  readonly typedMiddlewares: readonly ErasedTypedMiddleware[];
  readonly derivers: readonly Deriver[];
  readonly errorHandler: (error: ServerError, request: Request) => Response;
}

/**
 * Normalise a handler return value: if it is a plain Response, wrap in Task.of.
 * If it is already a Task, return as-is.
 */
const normaliseHandler = (
  result: Response | Task<Response, ServerError>,
): Task<Response, ServerError> => {
  if (Task.is(result)) return result;
  return Task.of(result);
};

/**
 * Strip trailing slashes from a pattern for consistent matching.
 * Preserves "/" itself (the root route).
 */
const normalisePattern = (pattern: string): string => {
  if (pattern === "/") return pattern;
  return pattern.endsWith("/") ? pattern.slice(0, -1) : pattern;
};

/**
 * Run derivers sequentially, accumulating context.
 * Short-circuits on first error.
 */
const runDerivers = async (
  derivers: readonly Deriver[],
  req: Request,
): Promise<Result<Record<string, unknown>, ServerError>> => {
  let ctx: Record<string, unknown> = {};
  // biome-ignore lint/style/useForOf: sequential async chain, indexed loop is clearer
  for (let i = 0; i < derivers.length; i++) {
    const result = await derivers[i]!(req, ctx).run();
    if (result.isErr) return Err(result.unwrapErr());
    ctx = { ...ctx, ...result.value };
  }
  return Ok(ctx);
};

/**
 * Execute a matched handler, normalising sync Response to Task.
 * Catches synchronous handler throws and wraps them as HandlerError.
 */
const executeHandler = (handler: Handler, ctx: Context): Task<Response, ServerError> => {
  try {
    const result = handler(ctx);
    return normaliseHandler(result);
  } catch (thrown: unknown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    return Task.fromResult(Err(HandlerError(message)));
  }
};

/**
 * Structural typing for the subset of node:http used by the default adapter.
 * Avoids depending on @types/node while keeping the import type-safe.
 */
interface NodeHttpModule {
  createServer(listener: (req: NodeRequest, res: NodeResponse) => void): {
    listen(port: number, hostname: string | undefined, cb: () => void): void;
    close(cb?: (err?: Error) => void): void;
  };
}

/** Structural type for a Node.js IncomingMessage (subset used by default adapter). */
interface NodeRequest {
  readonly method?: string | undefined;
  readonly url?: string | undefined;
  readonly headers: Record<string, string | readonly string[] | undefined>;
  on(event: "data", cb: (chunk: Uint8Array) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}

/** Structural type for a Node.js ServerResponse (subset used by default adapter). */
interface NodeResponse {
  writeHead(status: number, headers: Record<string, string>): void;
  write(chunk: Uint8Array): boolean;
  end(body?: string | Uint8Array): void;
}

/** Convert Node.js header record to [key, value] pairs for WHATWG Headers. */
const convertNodeHeaders = (
  headers: Record<string, string | readonly string[] | undefined>,
): [string, string][] => {
  const pairs: [string, string][] = [];
  const keys = Object.keys(headers);
  // biome-ignore lint/style/useForOf: hot-path, indexed loop for header conversion
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]!;
    const val = headers[key];
    if (typeof val === "string") {
      pairs.push([key, val]);
    } else if (Array.isArray(val)) {
      // biome-ignore lint/style/useForOf: hot-path, indexed loop for multi-value headers
      for (let vi = 0; vi < val.length; vi++) {
        pairs.push([key, val[vi]!]);
      }
    }
  }
  return pairs;
};

/** Build a WHATWG Request from a Node.js IncomingMessage. */
const buildRequestFromNode = (
  nodeReq: NodeRequest,
  hostname: string,
  port: number,
  chunks: readonly Uint8Array[],
): Request => {
  const method = nodeReq.method ?? "GET";
  const urlStr = nodeReq.url ?? "/";
  const fullUrl = `http://${hostname}:${port}${urlStr}`;

  let bodyLength = 0;
  // biome-ignore lint/style/useForOf: hot-path, sum body chunk lengths
  for (let ci = 0; ci < chunks.length; ci++) {
    bodyLength += chunks[ci]!.length;
  }

  const body =
    bodyLength > 0
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            // biome-ignore lint/style/useForOf: hot-path, indexed loop for body chunks
            for (let ci = 0; ci < chunks.length; ci++) {
              controller.enqueue(chunks[ci]!);
            }
            controller.close();
          },
        })
      : undefined;

  return new Request(fullUrl, {
    method,
    headers: convertNodeHeaders(nodeReq.headers),
    body,
  });
};

/** Write a WHATWG Response back to a Node.js ServerResponse. */
const writeResponseToNode = (response: Response, nodeRes: NodeResponse): void => {
  const resHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });
  nodeRes.writeHead(response.status, resHeaders);

  if (response.body === null) {
    nodeRes.end();
    return;
  }

  const reader = response.body.getReader();
  const pump = (): void => {
    void reader.read().then(({ done, value }) => {
      if (done) {
        nodeRes.end();
        return;
      }
      nodeRes.write(value);
      pump();
    });
  };
  pump();
};

/** Create the builder closure. Lazily compiles the trie on first request. */
const createBuilder = <Ctx extends Record<string, unknown>>(
  state: BuilderState,
): ServerBuilder<Ctx> => {
  let compiledTrie: RouteNode | null = null;

  /** Compile the trie on demand. */
  const getTrie = (): RouteNode => {
    if (compiledTrie === null) {
      compiledTrie = buildTrie(state.routes);
    }
    return compiledTrie;
  };

  /** Add a route and return a new builder. */
  const addRoute = <P extends string>(
    method: HttpMethod | "ALL",
    pattern: P,
    handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
  ): ServerBuilder<Ctx> => {
    // Erase the generic P for internal storage; the type-level P constraint
    // is enforced at the public API boundary by the ServerBuilder interface
    const erasedHandler: Handler = ctx => handler(ctx as Context<P> & Ctx);
    return createBuilder<Ctx>({
      ...state,
      routes: [
        ...state.routes,
        { method, pattern: normalisePattern(pattern), handler: erasedHandler },
      ],
    });
  };

  /**
   * Core request handler: match route, run derivers, execute handler.
   * Returns a Task so middleware can compose around it.
   */
  const coreHandle = (req: Request): Task<Response, ServerError> => {
    return Task<Response, ServerError>(async () => {
      const url = new URL(req.url, "http://localhost");
      const pathname = normalisePattern(url.pathname);
      const trie = getTrie();

      const matchResult = matchRoute(trie, req.method, pathname);
      if (matchResult.isErr) {
        const err: Result<Response, ServerError> = Err(matchResult.unwrapErr());
        return err;
      }

      const { handler, params } = matchResult.value;

      const derivedResult = await runDerivers(state.derivers, req);
      if (derivedResult.isErr) {
        const err: Result<Response, ServerError> = Err(derivedResult.unwrapErr());
        return err;
      }

      const ctx: Context = { req, url, params };
      const fullCtx = { ...ctx, ...derivedResult.value };

      // Apply typed middlewares around the handler execution
      if (state.typedMiddlewares.length === 0) {
        return executeHandler(handler, fullCtx).run();
      }

      // Build the innermost handler that executes the route handler
      let innerFn = (_r: Request, c: Record<string, unknown>): Task<Response, ServerError> =>
        // Why: c is Record<string, unknown> (type-erased for middleware storage),
        // but at runtime it is fullCtx which contains req, url, params (Context).
        // The erasure happens at the TypedMiddleware storage boundary.
        executeHandler(handler, c as unknown as Context);

      // Compose typed middlewares right-to-left (first registered = outermost)
      for (let i = state.typedMiddlewares.length - 1; i >= 0; i--) {
        const mw = state.typedMiddlewares[i]!;
        const next = innerFn;
        innerFn = mw(next);
      }

      return innerFn(req, fullCtx).run();
    });
  };

  /**
   * Apply all registered middleware around the core handler,
   * producing the final request-to-Task function.
   */
  const composedHandle = (req: Request): Task<Response, ServerError> => {
    if (state.middlewares.length === 0) return coreHandle(req);
    const composed = compose(...state.middlewares);
    return composed(coreHandle)(req);
  };

  const builder: ServerBuilder<Ctx> = {
    name: state.serverName,

    use(...middlewares: readonly Middleware[]): ServerBuilder<Ctx> {
      return createBuilder<Ctx>({
        ...state,
        middlewares: [...state.middlewares, ...middlewares],
      });
    },

    middleware<Ext extends Record<string, unknown>>(
      mw: TypedMiddleware<Ctx, Ext>,
    ): ServerBuilder<Ctx & Ext> {
      const erased: ErasedTypedMiddleware = mw as ErasedTypedMiddleware;
      return createBuilder<Ctx & Ext>({
        ...state,
        typedMiddlewares: [...state.typedMiddlewares, erased],
      });
    },

    derive<Ext extends Record<string, unknown>>(
      resolver: (req: Request, ctx: Ctx) => Task<Ext, ServerError>,
    ): ServerBuilder<Ctx & Ext> {
      // Wrap resolver to erase the Ctx/Ext generics for internal storage.
      // The wrapping function narrows Record<string, unknown> -> Ctx at
      // the call site boundary. This is safe because runDerivers accumulates
      // context sequentially, so ctx always satisfies Ctx at runtime.
      const deriver: Deriver = (req, ctx) => resolver(req, ctx as Ctx);
      return createBuilder<Ctx & Ext>({
        ...state,
        derivers: [...state.derivers, deriver],
      });
    },

    get: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("GET", pattern, handler),
    post: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("POST", pattern, handler),
    put: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("PUT", pattern, handler),
    patch: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("PATCH", pattern, handler),
    delete: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("DELETE", pattern, handler),
    head: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("HEAD", pattern, handler),
    options: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("OPTIONS", pattern, handler),
    all: <P extends string>(
      pattern: P,
      handler: (ctx: Context<P> & Ctx) => Response | Task<Response, ServerError>,
    ) => addRoute("ALL", pattern, handler),

    onError(handler: (error: ServerError, request: Request) => Response): ServerBuilder<Ctx> {
      return createBuilder<Ctx>({
        ...state,
        errorHandler: handler,
      });
    },

    handle: composedHandle,

    fetch: async (request: Request): Promise<Response> => {
      const result = await composedHandle(request).run();
      if (result.isOk) return result.value;
      return state.errorHandler(result.unwrapErr(), request);
    },

    listen(options: ListenOptions, adapter?: ServerAdapter): Program<void, ServerError> {
      const fetchHandler = builder.fetch;

      const resolvedAdapter: ServerAdapter = adapter ?? {
        async serve(
          handler: (request: Request) => Promise<Response>,
          opts: {
            readonly port: number;
            readonly hostname?: string | undefined;
            readonly signal: AbortSignal;
          },
        ): Promise<void> {
          // Dynamic import with structural typing to avoid @types/node dependency
          const http: NodeHttpModule = await (Function(
            "return import('node:http')",
          )() as Promise<NodeHttpModule>);

          await new Promise<void>((resolve, reject) => {
            const hostname = opts.hostname ?? "localhost";

            const server = http.createServer((nodeReq, nodeRes) => {
              const chunks: Uint8Array[] = [];
              nodeReq.on("data", (chunk: Uint8Array) => {
                chunks.push(chunk);
              });
              nodeReq.on("end", () => {
                const request = buildRequestFromNode(nodeReq, hostname, opts.port, chunks);
                void handler(request).then(
                  response => writeResponseToNode(response, nodeRes),
                  () => {
                    nodeRes.writeHead(500, { "content-type": "text/plain" });
                    nodeRes.end("Internal Server Error");
                  },
                );
              });
            });

            const onAbort = (): void => {
              server.close(err => {
                if (err) reject(err);
                else resolve();
              });
            };

            if (opts.signal.aborted) {
              resolve();
              return;
            }

            opts.signal.addEventListener("abort", onAbort);
            server.listen(opts.port, opts.hostname, () => {
              // Server is listening
            });
          });
        },
      };

      const programOptions: { readonly teardownTimeoutMs?: number } =
        options.teardownTimeoutMs !== undefined
          ? { teardownTimeoutMs: options.teardownTimeoutMs }
          : {};

      return Program(
        state.serverName,
        (signal: AbortSignal) =>
          Task<void, ServerError>(async () => {
            try {
              await resolvedAdapter.serve(fetchHandler, {
                port: options.port,
                hostname: options.hostname,
                signal,
              });
              return Ok(undefined);
            } catch (thrown: unknown) {
              const message = thrown instanceof Error ? thrown.message : String(thrown);
              return Err(HandlerError(message));
            }
          }),
        programOptions,
      );
    },
  };

  return Object.freeze(builder);
};

// ── Server factory ──────────────────────────────────────────────────────────

/**
 * Create a new HTTP server builder.
 *
 * Returns a frozen {@link ServerBuilder} with an empty route table. Use the
 * fluent API to add routes, middleware, and context derivers. Each method
 * returns a new immutable builder (no mutation).
 *
 * Call `.listen()` to get a {@link Program} that manages graceful shutdown,
 * or use `.fetch` directly as a Bun/Deno/Cloudflare Workers handler.
 *
 * @example
 * ```ts
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }))
 *   .get("/users/:id", ctx => json({ id: ctx.params.id }))
 *   .listen({ port: 3000 });
 *
 * await app.run();
 * ```
 */
export const Server = (name: string): ServerBuilder => {
  return createBuilder<Record<string, unknown>>({
    serverName: name,
    routes: [],
    middlewares: [],
    typedMiddlewares: [],
    derivers: [],
    errorHandler: defaultErrorHandler,
  });
};
