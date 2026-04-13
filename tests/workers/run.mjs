/**
 * Run the web smoke test inside miniflare (Cloudflare Workers runtime).
 *
 * Writes a temporary worker entry point that imports the dist/ output,
 * then runs it via miniflare's scriptPath (which resolves filesystem imports).
 *
 * Usage: node tests/workers/run.mjs
 * Requires: pnpm add -D miniflare
 */
import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare } from "miniflare";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);

// Build a temporary worker entry that inlines the smoke test function
const webSmokeSrc = await readFile(resolve(ROOT, "tests/web-smoke.mjs"), "utf-8");
const smokeFnOnly = webSmokeSrc.replace(/\/\/ Self-execute when run directly[\s\S]*$/, "");

const workerSrc = `
import * as lib from './dist/index.js';

${smokeFnOnly}

export default {
  async fetch() {
    const { passed, failed, logs } = await runWebSmoke(lib);
    return new Response(JSON.stringify({ passed, failed, logs }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
`;

// Write to project root so relative import ./dist/index.js resolves
const tmpWorkerPath = resolve(ROOT, ".tmp-worker-smoke.mjs");
await writeFile(tmpWorkerPath, workerSrc);

try {
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: tmpWorkerPath,
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
} finally {
  await rm(tmpWorkerPath, { force: true });
}
