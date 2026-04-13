/**
 * Worker wrapper for running web-smoke tests inside miniflare.
 *
 * Miniflare runs this as a CF Worker module. The smoke test is inlined
 * via the bundled dist/ output. Results are returned as JSON via fetch.
 */

import * as lib from "../../dist/index.js";
import { runWebSmoke } from "../web-smoke.mjs";

// biome-ignore lint/style/noDefaultExport: CF Workers require export default
export default {
  async fetch() {
    const { passed, failed, logs } = await runWebSmoke(lib);
    return new Response(JSON.stringify({ passed, failed, logs }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
