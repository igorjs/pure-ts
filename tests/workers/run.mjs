/**
 * Run the web smoke test inside miniflare (Cloudflare Workers runtime).
 *
 * Usage: node tests/workers/run.mjs
 * Requires: pnpm add -D miniflare
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);

// Build a self-contained worker script that inlines the smoke test
const webSmokeSrc = await readFile(resolve(ROOT, "tests/web-smoke.mjs"), "utf-8");
// Remove the self-execute block at the bottom (it uses process/Deno which don't exist in Workers)
const smokeFnOnly = webSmokeSrc.replace(/\/\/ Self-execute when run directly[\s\S]*$/, "");

const workerSrc = `
${smokeFnOnly}

export default {
  async fetch() {
    const lib = await import('./dist/index.js');
    const { passed, failed, logs } = await runWebSmoke(lib);
    return new Response(JSON.stringify({ passed, failed, logs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
`;

const mf = new Miniflare({
  modules: [{ type: "ESModule", path: "worker.mjs", contents: workerSrc }],
  modulesRoot: ROOT,
  compatibilityDate: "2024-01-01",
});

const resp = await mf.dispatchFetch("http://localhost/");
const { passed, failed, logs } = await resp.json();

for (const line of logs) {
  console.log(line);
}

await mf.dispose();

if (failed > 0) {
  console.log(`\nMiniflare: ${failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nMiniflare: all ${passed} tests passed`);
