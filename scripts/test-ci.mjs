/**
 * test-ci.mjs - Run the full CI test matrix locally.
 *
 * 1. Native tests: Node 22/23/24/25/26 (via fnm) + Deno + Bun
 * 2. Docker containers: 4 distros x 3 runtimes (11 containers, parallel)
 *
 * Output is quiet locally, verbose in CI or with --verbose.
 *
 * Usage:
 *   node scripts/test-ci.mjs              # full matrix
 *   node scripts/test-ci.mjs --native     # native only (skip Docker)
 *   node scripts/test-ci.mjs --docker     # Docker only (skip native)
 */

import { execFileSync, execSync, spawn } from "node:child_process";

const log = (msg) => process.stdout.write(`${msg}\n`);

const hasCommand = (cmd) => {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

const args = process.argv.slice(2);
const runNative = !args.includes("--docker");
const runDocker = !args.includes("--native");

const COMPOSE_FILE = "docker-compose.test.yml";
const COMPOSE_PROJECT = "pure-fx-test";
const NODE_VERSIONS = ["22", "23", "24", "25", "26"];

let failed = false;
const dockerErrors = [];

let cleaned = false;
const cleanup = () => {
  if (cleaned || !runDocker || !hasCommand("docker")) return;
  cleaned = true;
  log("\nCleaning up Docker resources...");
  try {
    execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} down --rmi local --volumes --remove-orphans 2>/dev/null`,
      { stdio: "ignore", shell: true },
    );
  } catch {
    // best-effort
  }
};

process.on("SIGINT", () => { cleanup(); process.exit(130); });
process.on("SIGTERM", () => { cleanup(); process.exit(143); });

// -- Native tests -------------------------------------------------------------

if (runNative) {
  log("\n── Checks ──");
  process.stdout.write("  lint + check + build ... ");
  try {
    execSync("pnpm run lint && pnpm run check && pnpm run build", { stdio: "pipe" });
    log("OK");
  } catch (e) {
    log("FAIL");
    log(String(e.stderr || e.stdout || e.message));
    process.exit(1);
  }

  log("\n── Native ──");
  const hasFnm = hasCommand("fnm");

  // Run Node tests for each version
  for (const nodeVersion of NODE_VERSIONS) {
    try {
      if (hasFnm) {
        execSync(`fnm install ${nodeVersion} 2>/dev/null; fnm exec --using ${nodeVersion} node scripts/test-matrix.mjs --no-summary --runtime node`, {
          stdio: "inherit",
          shell: true,
        });
      } else if (nodeVersion === process.versions.node.split(".")[0]) {
        execSync("node scripts/test-matrix.mjs --no-summary --runtime node", { stdio: "inherit" });
      } else {
        log(`  node ${nodeVersion} ... SKIP (fnm not available)`);
      }
    } catch {
      failed = true;
    }
  }

  // Run Deno, Bun, browser, workers once
  for (const runtime of ["deno", "bun", "browser", "workers"]) {
    try {
      execSync(`node scripts/test-matrix.mjs --no-summary --runtime ${runtime}`, { stdio: "inherit" });
    } catch {
      failed = true;
    }
  }
}

// -- Docker matrix (parallel) ------------------------------------------------

if (runDocker) {
  if (!hasCommand("docker")) {
    log("\nWARN: Docker not available, skipping container tests.");
  } else {
    log("\n── Docker ──");

    // Ensure dist/ exists for Deno containers (they COPY it from build context)
    try {
      const { statSync } = await import("node:fs");
      statSync("./dist/index.js");
    } catch {
      process.stdout.write("  building dist/ ... ");
      try {
        execSync("pnpm run build", { stdio: "pipe" });
        log("OK");
      } catch (e) {
        log("FAIL");
        log(String(e.stderr || e.stdout || e.message));
        process.exit(1);
      }
    }

    // Discover services, build + run each independently in parallel
    const services = execSync(
      `docker compose -p ${COMPOSE_PROJECT} -f ${COMPOSE_FILE} config --services`,
      { encoding: "utf-8", stdio: "pipe" },
    ).trim().split("\n");

    let completed = 0;
    const total = services.length;
    const dockerResults = [];

    const runService = (service) => new Promise((resolve) => {
      const child = spawn("docker", [
        "compose", "-p", COMPOSE_PROJECT, "-f", COMPOSE_FILE,
        "run", "--rm", "--build", service,
      ], { stdio: "pipe" });
      let output = "";
      child.stdout.on("data", (d) => { output += d; });
      child.stderr.on("data", (d) => { output += d; });
      child.on("close", (code) => {
        completed++;
        const ok = code === 0;
        log(`  ${service} ... ${ok ? "PASS" : "FAIL"}  (${completed}/${total})`);
        if (!ok) {
          dockerErrors.push({ service, output });
          failed = true;
        }
        resolve({ service, ok, output });
      });
    });

    log(`  building and running ${total} containers in parallel...`);
    await Promise.allSettled(services.map(runService));
  }
}

// -- Final result -------------------------------------------------------------

if (dockerErrors.length > 0) {
  log("\n── DOCKER ERRORS ──");
  for (const err of dockerErrors) {
    log(`\n✗ ${err.service}:`);
    const lines = err.output.split("\n").slice(-20);
    log(lines.join("\n"));
  }
}

cleanup();

log("");
if (failed) {
  log("RESULT: SOME TESTS FAILED");
  process.exit(1);
}
log("RESULT: ALL TESTS PASSED");
process.exit(0);
