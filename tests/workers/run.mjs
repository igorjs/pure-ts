/**
 * Run the web smoke test inside miniflare (Cloudflare Workers runtime).
 *
 * Usage: node tests/workers/run.mjs
 * Requires: pnpm add -D miniflare (or npx miniflare)
 */
import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  scriptPath: new URL("./worker.mjs", import.meta.url).pathname,
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
