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

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  // Serve the test harness HTML
  if (url.pathname === "/__test__") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML);
    return;
  }

  // Serve static files from project root
  const filePath = resolve(ROOT, url.pathname.slice(1));
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

await new Promise(r => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();

page.on("console", msg => console.log(`  [browser] ${msg.text()}`));
page.on("pageerror", err => console.log(`  [browser error] ${err.message}`));

await page.goto(`http://localhost:${port}/__test__`);
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
