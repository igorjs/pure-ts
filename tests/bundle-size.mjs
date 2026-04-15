/**
 * bundle-size.mjs - Verify tree-shaking works by comparing bundle sizes.
 *
 * Bundles several import scenarios with esbuild and asserts that
 * subpath imports produce significantly smaller bundles than the
 * full import. Fails if tree-shaking is broken.
 *
 * Run: node tests/bundle-size.mjs
 * Requires: esbuild (installed on-demand via npx in CI)
 */

import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(new URL("../", import.meta.url).pathname);
const dist = join(ROOT, "dist");
const tmp = mkdtempSync(join(tmpdir(), "pure-ts-bundle-"));

const bundle = (name, code) => {
  const entry = join(tmp, `${name}.mjs`);
  const out = join(tmp, `${name}.bundle.mjs`);
  writeFileSync(entry, code);
  execSync(
    `npx esbuild ${entry} --bundle --format=esm --outfile=${out} --minify --tree-shaking=true`,
    { stdio: "pipe" },
  );
  const size = readFileSync(out).byteLength;
  return size;
};

console.log("Bundling import scenarios...\n");

const fullSize = bundle(
  "full",
  `import { Ok, Err, Result, Option, pipe, flow, Match, Task, Stream, Schema, Record, List, File, Command, Server, Program, Logger, Config, Retry, CircuitBreaker, Cache, Channel, Semaphore, Mutex, RateLimiter, Timer, Lazy, Env, ErrType, Duration, Cron, Json, Crypto, Encoding, Compression, Clone, Url, Dns, Net, Client, WebSocket, ADT, StateMachine, EventEmitter, Pool, Queue, CronRunner } from "${dist}/index.js"; console.log(Ok, Err, Result, Option, pipe, flow, Match, Task, Stream, Schema, Record, List, File, Command, Server, Program, Logger, Config, Retry, CircuitBreaker, Cache, Channel, Semaphore, Mutex, RateLimiter, Timer, Lazy, Env, ErrType, Duration, Cron, Json, Crypto, Encoding, Compression, Clone, Url, Dns, Net, Client, WebSocket, ADT, StateMachine, EventEmitter, Pool, Queue, CronRunner);`,
);

const coreOnly = bundle(
  "core",
  `import { Ok, Err, pipe, flow } from "${dist}/core/index.js"; console.log(Ok, Err, pipe, flow);`,
);

const dataOnly = bundle(
  "data",
  `import { Schema, Record, List } from "${dist}/data/index.js"; console.log(Schema, Record, List);`,
);

const asyncOnly = bundle(
  "async",
  `import { Task, Stream } from "${dist}/async/index.js"; console.log(Task, Stream);`,
);

const singleOk = bundle("single", `import { Ok } from "${dist}/core/index.js"; console.log(Ok);`);

// Clean up
rmSync(tmp, { recursive: true, force: true });

// Report
const kb = bytes => `${(bytes / 1024).toFixed(1)}KB`;
const pct = (part, whole) => `${((part / whole) * 100).toFixed(0)}%`;

console.log("Bundle sizes:");
console.log(`  Full import (all modules):  ${kb(fullSize)}`);
console.log(`  Core only (Ok, Err, pipe):  ${kb(coreOnly)} (${pct(coreOnly, fullSize)} of full)`);
console.log(`  Data only (Schema, Record): ${kb(dataOnly)} (${pct(dataOnly, fullSize)} of full)`);
console.log(`  Async only (Task, Stream):  ${kb(asyncOnly)} (${pct(asyncOnly, fullSize)} of full)`);
console.log(`  Single Ok import:           ${kb(singleOk)} (${pct(singleOk, fullSize)} of full)`);

// Assertions
let failed = 0;
const assert = (condition, msg) => {
  if (!condition) {
    console.log(`\nFAIL: ${msg}`);
    failed++;
  }
};

assert(
  coreOnly < fullSize * 0.5,
  `Core bundle should be <50% of full (got ${pct(coreOnly, fullSize)})`,
);
assert(
  singleOk < fullSize * 0.2,
  `Single Ok import should be <20% of full (got ${pct(singleOk, fullSize)})`,
);
assert(
  dataOnly < fullSize * 0.7,
  `Data bundle should be <70% of full (got ${pct(dataOnly, fullSize)})`,
);
assert(
  asyncOnly < fullSize * 0.6,
  `Async bundle should be <60% of full (got ${pct(asyncOnly, fullSize)})`,
);

console.log(`\n${failed === 0 ? "Tree-shaking verified." : `${failed} assertion(s) failed.`}`);

if (failed > 0) {
  process.exit(1);
}
