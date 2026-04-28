/**
 * websocket.test.js - Tests for the WebSocket router module.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output (black-box).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const { WebSocket } = await import("../dist/index.js");

// =============================================================================
// WebSocket.router
// =============================================================================

describe("WebSocket", () => {
  describe("WebSocket.router()", () => {
    it("creates an empty router", () => {
      const ws = WebSocket.router();
      assert.equal(typeof ws.route, "function");
      assert.equal(typeof ws.match, "function");
      assert.ok(Array.isArray(ws.routes));
      assert.equal(ws.routes.length, 0);
    });
  });

  describe(".route()", () => {
    it("adds a route and returns a new router (immutable)", () => {
      const ws1 = WebSocket.router();
      const ws2 = ws1.route("/chat", {
        onOpen: () => {
          /* noop */
        },
      });
      assert.equal(ws1.routes.length, 0);
      assert.equal(ws2.routes.length, 1);
    });

    it("chains multiple routes", () => {
      const ws = WebSocket.router()
        .route("/chat", {
          onOpen: () => {
            /* noop */
          },
        })
        .route("/notifications", {
          onMessage: () => {
            /* noop */
          },
        })
        .route("/live", {
          onClose: () => {
            /* noop */
          },
        });
      assert.equal(ws.routes.length, 3);
    });

    it("stores pattern and handler in route definition", () => {
      const handler = {
        onOpen: () => {
          /* noop */
        },
        onMessage: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/test", handler);
      const route = ws.routes[0];
      assert.equal(route.pattern, "/test");
      assert.equal(route.handler, handler);
    });
  });

  describe(".routes", () => {
    it("is a readonly array", () => {
      const ws = WebSocket.router().route("/a", {}).route("/b", {});
      assert.equal(ws.routes.length, 2);
      assert.equal(ws.routes[0].pattern, "/a");
      assert.equal(ws.routes[1].pattern, "/b");
    });

    it("preserves insertion order", () => {
      const ws = WebSocket.router().route("/first", {}).route("/second", {}).route("/third", {});
      assert.deepEqual(
        ws.routes.map(r => r.pattern),
        ["/first", "/second", "/third"],
      );
    });
  });

  describe(".match()", () => {
    it("returns handler for matching pattern", () => {
      const handler = {
        onOpen: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/chat", handler);
      const matched = ws.match("/chat");
      assert.equal(matched, handler);
    });

    it("returns undefined for non-matching pattern", () => {
      const ws = WebSocket.router().route("/chat", {
        onOpen: () => {
          /* noop */
        },
      });
      assert.equal(ws.match("/other"), undefined);
    });

    it("matches first route when multiple patterns exist", () => {
      const h1 = {
        onOpen: () => {
          /* noop */
        },
      };
      const h2 = {
        onMessage: () => {
          /* noop */
        },
      };
      const ws = WebSocket.router().route("/a", h1).route("/b", h2);
      assert.equal(ws.match("/a"), h1);
      assert.equal(ws.match("/b"), h2);
    });

    it("returns undefined on empty router", () => {
      assert.equal(WebSocket.router().match("/anything"), undefined);
    });

    it("uses exact string matching", () => {
      const ws = WebSocket.router().route("/chat", {});
      assert.equal(ws.match("/chat/room"), undefined);
      assert.equal(ws.match("/cha"), undefined);
      assert.equal(ws.match("chat"), undefined);
    });
  });

  describe("handler interface", () => {
    it("supports all four event handlers", () => {
      const ws = WebSocket.router().route("/full", {
        onOpen: () => {
          /* noop */
        },
        onMessage: () => {
          /* noop */
        },
        onClose: () => {
          /* noop */
        },
        onError: () => {
          /* noop */
        },
      });
      const handler = ws.match("/full");
      assert.equal(typeof handler.onOpen, "function");
      assert.equal(typeof handler.onMessage, "function");
      assert.equal(typeof handler.onClose, "function");
      assert.equal(typeof handler.onError, "function");
    });

    it("all handlers are optional", () => {
      const ws = WebSocket.router().route("/minimal", {});
      const handler = ws.match("/minimal");
      assert.equal(handler.onOpen, undefined);
      assert.equal(handler.onMessage, undefined);
      assert.equal(handler.onClose, undefined);
      assert.equal(handler.onError, undefined);
    });
  });
});
