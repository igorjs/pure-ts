/**
 * @module runtime/adapter/bun
 *
 * Bun HTTP adapter implementing {@link ServerAdapter}.
 *
 * Uses `Bun.serve()` which natively accepts a WHATWG fetch handler.
 * All Bun types are expressed structurally so the module compiles
 * without Bun-specific type declarations.
 *
 * Two usage modes:
 * 1. **Via adapter**: `app.listen({ port: 3000 }, bunAdapter)` for
 *    Program lifecycle integration (signals, logging, graceful shutdown).
 * 2. **Direct**: `Bun.serve({ fetch: app.fetch })` when Program is not needed.
 */

import type { ServerAdapter } from "./types.js";

// ── Structural types for Bun.serve (avoids @types/bun) ──────────────────────

/**
 * Subset of Bun.ServeOptions used by this adapter.
 * Matches Bun's API without importing Bun-specific type declarations.
 */
interface BunServeOptions {
  readonly port: number;
  readonly hostname?: string;
  readonly fetch: (request: Request) => Response | Promise<Response>;
}

/**
 * Subset of the Bun.Server returned by Bun.serve().
 * The `stop` method shuts down the server.
 */
interface BunServer {
  readonly stop: (closeActiveConnections?: boolean) => void;
  readonly port: number;
  readonly hostname: string;
}

/** Structural type for the Bun.serve() function. */
type BunServeFn = (options: BunServeOptions) => BunServer;

// ── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Bun HTTP server adapter.
 *
 * Uses `Bun.serve()` which accepts a standard WHATWG fetch handler.
 * Streaming responses work natively since Bun handles ReadableStream
 * bodies without any conversion.
 *
 * Pass this to `Server.listen()` to run on Bun with Program lifecycle
 * management (SIGINT/SIGTERM handling, structured logging, exit codes).
 *
 * @example
 * ```ts
 * import { Server, json } from "@igorjs/pure-ts";
 * import { bunAdapter } from "@igorjs/pure-ts/runtime/adapter/bun";
 *
 * const app = Server("api")
 *   .get("/health", () => json({ ok: true }))
 *   .listen({ port: 3000 }, bunAdapter);
 *
 * await app.run();
 * ```
 *
 * For simpler cases where Program lifecycle is not needed:
 * ```ts
 * Bun.serve({ fetch: app.fetch, port: 3000 });
 * ```
 */
export const bunAdapter: ServerAdapter = {
  async serve(handler, options) {
    // Why: globalThis doesn't declare Bun. Structural typing avoids @types/bun dependency.
    const bunGlobal = globalThis as unknown as {
      Bun?: { serve?: BunServeFn };
    };

    if (bunGlobal.Bun?.serve === undefined) {
      throw new Error(
        "Bun.serve is not available. The bunAdapter requires Bun. " +
          "For Node.js, use nodeAdapter or the default .listen() behaviour. " +
          "For Deno, use denoAdapter.",
      );
    }

    const serveOptions: BunServeOptions = {
      port: options.port,
      fetch: handler,
    };

    // Only set hostname when provided (exactOptionalPropertyTypes)
    if (options.hostname !== undefined) {
      (serveOptions as { hostname: string }).hostname = options.hostname;
    }

    const server = bunGlobal.Bun.serve(serveOptions);

    // Wait for the abort signal, then stop the server
    await new Promise<void>(resolve => {
      if (options.signal.aborted) {
        server.stop(true);
        resolve();
        return;
      }

      options.signal.addEventListener("abort", () => {
        server.stop(true);
        resolve();
      });
    });
  },
};
