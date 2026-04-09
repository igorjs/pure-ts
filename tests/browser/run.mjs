/**
 * Run the web smoke test inside a real browser via Playwright.
 *
 * Serves dist/ and test files via a local HTTP server, opens a headless
 * Chromium page, loads the test module, and collects results.
 *
 * Usage: node tests/browser/run.mjs
 * Requires: pnpm add -D playwright (and npx playwright install chromium)
 */

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(new URL("../../", import.meta.url).pathname);

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".json": "application/json",
};

// Simple static file server for dist/ and tests/
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const filePath = resolve(ROOT, url.pathname.slice(1));

  // Only serve files under the project root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

await new Promise(resolve => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const HTML = `<!DOCTYPE html>
<html>
<head><title>pure-ts browser smoke test</title></head>
<body>
<script type="module">
import { runWebSmoke } from "./tests/web-smoke.mjs";
import * as lib from "./dist/index.js";

const result = await runWebSmoke(lib);
window.__testResult = result;
</script>
</body>
</html>`;

// Serve the HTML inline
server.on("request", (req, res) => {
  if (req.url === "/__test__") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
  }
});

const browser = await chromium.launch();
const page = await browser.newPage();

// Collect console output
page.on("console", msg => console.log(`  [browser] ${msg.text()}`));
page.on("pageerror", err => console.log(`  [browser error] ${err.message}`));

await page.goto(`${baseUrl}/__test__`);

// Wait for test result
await page.waitForFunction(() => window.__testResult !== undefined, { timeout: 30000 });
const result = await page.evaluate(() => window.__testResult);

for (const line of result.logs) {
  console.log(line);
}

await browser.close();
server.close();

if (result.failed > 0) {
  console.log(`\nBrowser: ${result.failed} test(s) failed`);
  process.exit(1);
}
console.log(`\nBrowser (Chromium): all ${result.passed} tests passed`);
