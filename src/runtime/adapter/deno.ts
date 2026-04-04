/**
 * @module runtime/adapter/deno
 *
 * Deno 2+ HTTP adapter implementing {@link ServerAdapter}.
 *
 * Uses `Deno.serve()` which natively accepts a WHATWG fetch handler.
 * All Deno types are expressed structurally so the module compiles
 * without Deno-specific type declarations.
 *
 * Two usage modes:
 * 1. **Via adapter**: `app.listen({ port: 3000 }, denoAdapter)` for
 *    Program lifecycle integration (signals, logging, graceful shutdown).
 * 2. **Direct**: `Deno.serve(app.fetch)` when Program is not needed.
 */

import type { ServerAdapter } from "./types.js";

// ── Structural types for Deno.serve (avoids @deno/types) ────────────────────

/**
 * Subset of Deno.ServeOptions used by this adapter.
 * Matches Deno 2+ API without importing Deno-specific type declarations.
 */
interface DenoServeOptions {
  readonly port?: number;
  readonly hostname?: string;
  readonly signal?: AbortSignal;
  readonly onListen?: (addr: { readonly hostname: string; readonly port: number }) => void;
}

/**
 * Subset of the Deno.HttpServer returned by Deno.serve().
 * The `finished` promise resolves when the server has shut down.
 */
interface DenoHttpServer {
  readonly finished: Promise<void>;
}

/** Structural type for the Deno.serve() function. */
type DenoServeFn = (
  options: DenoServeOptions,
  handler: (request: Request) => Response | Promise<Response>,
) => DenoHttpServer;

// ── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Deno 2+ HTTP server adapter.
 *
 * Uses `Deno.serve()` which accepts a standard WHATWG fetch handler.
 * Streaming responses work natively since Deno handles ReadableStream
 * bodies without any conversion.
 *
 * Pass this to `Server.listen()` to run on Deno with Program lifecycle
 * management (SIGINT/SIGTERM handling, structured logging, exit codes).
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-ts";
 * import { denoAdapter } from "@igorjs/pure-ts/runtime/adapter/deno";
 *
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }))
 *   .listen({ port: 3000 }, denoAdapter);
 *
 * await app.run();
 * ```
 *
 * For simpler cases where Program lifecycle is not needed:
 * ```ts
 * Deno.serve(app.fetch);
 * ```
 */
export const denoAdapter: ServerAdapter = {
  async serve(handler, options) {
    // Why: globalThis doesn't declare Deno. Structural typing avoids @deno/types dependency.
    const denoGlobal = globalThis as unknown as {
      Deno?: { serve?: DenoServeFn };
    };

    if (denoGlobal.Deno?.serve === undefined) {
      throw new Error(
        "Deno.serve is not available. The denoAdapter requires Deno 2+. " +
          "For Node.js, use nodeAdapter or the default .listen() behaviour.",
      );
    }

    const serveOptions: DenoServeOptions = {
      port: options.port,
      signal: options.signal,
      onListen: () => {
        // Suppress Deno's default "Listening on" log since Program
        // handles startup logging via its own [timestamp] [name] format.
      },
    };

    // Only set hostname when provided (exactOptionalPropertyTypes forbids undefined)
    if (options.hostname !== undefined) {
      (serveOptions as { hostname: string }).hostname = options.hostname;
    }

    const server = denoGlobal.Deno.serve(serveOptions, handler);

    // Deno.serve returns a server whose `finished` promise resolves
    // when the signal aborts and the server has fully shut down.
    await server.finished;
  },
};
