/**
 * adapters.test.js - Tests for the runtime adapter layer.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output (black-box).
 *
 * These tests run in Node.js, so they validate the Node/Bun adapters.
 * Deno adapter paths return undefined when Deno is not available.
 */

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import nodeOs from "node:os";
import nodePath from "node:path";
import { describe, it } from "node:test";

// ── Import adapter resolve functions ────────────────────────────────────────

const { getDeno, getNodeProcess, importNode, requireNode } = await import(
  "../dist/runtime/adapters/detect.js"
);
const { resolveStdin, resolveStdout, resolveStderr } = await import(
  "../dist/runtime/adapters/stdin.js"
);
const { resolveFs } = await import("../dist/runtime/adapters/fs.js");
const { resolveSubprocess } = await import("../dist/runtime/adapters/subprocess.js");
const { resolveDns } = await import("../dist/runtime/adapters/dns-adapter.js");
const { resolveTcpClient } = await import("../dist/runtime/adapters/net-adapter.js");
const { resolveOsInfo } = await import("../dist/runtime/adapters/os-adapter.js");
const { resolveProcessInfo } = await import("../dist/runtime/adapters/process-adapter.js");

// =============================================================================
// 1. detect.ts
// =============================================================================

describe("detect", () => {
  it("getDeno returns undefined in Node", () => {
    assert.equal(getDeno(), undefined);
  });

  it("getNodeProcess returns the process global", () => {
    const proc = getNodeProcess();
    assert.notEqual(proc, undefined);
    assert.equal(typeof proc.pid, "number");
    assert.equal(typeof proc.cwd, "function");
  });

  it("importNode caches results", async () => {
    const getFs = importNode("node:fs/promises");
    const fs1 = await getFs();
    const fs2 = await getFs();
    assert.notEqual(fs1, null);
    assert.equal(fs1, fs2); // same cached reference
  });

  it("importNode returns null for nonexistent module", async () => {
    const getBad = importNode("node:this-does-not-exist");
    const result = await getBad();
    assert.equal(result, null);
  });

  it("requireNode caches results (returns same ref on repeat calls)", () => {
    const getOs = requireNode("node:os");
    const os1 = getOs();
    const os2 = getOs();
    // In ESM, require may return null; verify caching by identity
    assert.equal(os1, os2);
  });

  it("requireNode returns null for nonexistent module", () => {
    const getBad = requireNode("node:this-does-not-exist");
    assert.equal(getBad(), null);
  });
});

// =============================================================================
// 2. stdin adapter
// =============================================================================

describe("stdin adapter", () => {
  it("resolveStdin returns a Stdin adapter", () => {
    const stdin = resolveStdin();
    assert.notEqual(stdin, undefined);
    assert.equal(typeof stdin.isTTY, "boolean");
    assert.equal(typeof stdin.readLine, "function");
    assert.equal(typeof stdin.readAll, "function");
  });

  it("isTTY is false in test runner (piped)", () => {
    const stdin = resolveStdin();
    assert.equal(stdin.isTTY, false);
  });

  it("resolveStdout returns a Stdout adapter", () => {
    const stdout = resolveStdout();
    assert.notEqual(stdout, undefined);
    assert.equal(typeof stdout.write, "function");
  });

  it("resolveStderr returns a Stdout adapter", () => {
    const stderr = resolveStderr();
    assert.notEqual(stderr, undefined);
    assert.equal(typeof stderr.write, "function");
  });

  it("stdout.write does not throw", () => {
    const stdout = resolveStdout();
    assert.doesNotThrow(() => stdout.write(""));
  });
});

// =============================================================================
// 3. fs adapter
// =============================================================================

describe("fs adapter", () => {
  let fs;
  let tmpDir;

  it("resolveFs returns a non-null adapter", async () => {
    fs = await resolveFs();
    assert.notEqual(fs, null);
    assert.equal(typeof fs.readFile, "function");
    assert.equal(typeof fs.writeFile, "function");
    assert.equal(typeof fs.appendFile, "function");
    assert.equal(typeof fs.mkdir, "function");
    assert.equal(typeof fs.stat, "function");
    assert.equal(typeof fs.remove, "function");
    assert.equal(typeof fs.removeDir, "function");
    assert.equal(typeof fs.readDir, "function");
    assert.equal(typeof fs.copyFile, "function");
    assert.equal(typeof fs.rename, "function");
    assert.equal(typeof fs.makeTempDir, "function");
  });

  it("setup: create temp dir", async () => {
    tmpDir = await mkdtemp(nodePath.join(nodeOs.tmpdir(), "adapter-fs-"));
  });

  it("writeFile + readFile roundtrip", async () => {
    const path = nodePath.join(tmpDir, "test.txt");
    await fs.writeFile(path, "hello adapter");
    const content = await fs.readFile(path);
    assert.equal(content, "hello adapter");
  });

  it("appendFile appends content", async () => {
    const path = nodePath.join(tmpDir, "append.txt");
    await fs.writeFile(path, "a");
    await fs.appendFile(path, "b");
    const content = await fs.readFile(path);
    assert.equal(content, "ab");
  });

  it("stat returns file metadata", async () => {
    const path = nodePath.join(tmpDir, "stat.txt");
    await fs.writeFile(path, "data");
    const s = await fs.stat(path);
    assert.equal(s.isFile, true);
    assert.equal(s.isDirectory, false);
    assert.equal(typeof s.size, "number");
    assert.ok(s.size > 0);
  });

  it("stat returns directory metadata", async () => {
    const s = await fs.stat(tmpDir);
    assert.equal(s.isFile, false);
    assert.equal(s.isDirectory, true);
  });

  it("mkdir creates nested directories", async () => {
    const path = nodePath.join(tmpDir, "a", "b", "c");
    await fs.mkdir(path);
    const s = await fs.stat(path);
    assert.equal(s.isDirectory, true);
  });

  it("readDir lists entries", async () => {
    const entries = await fs.readDir(tmpDir);
    assert.ok(Array.isArray(entries));
    assert.ok(entries.length > 0);
  });

  it("copyFile copies a file", async () => {
    const src = nodePath.join(tmpDir, "copy-src.txt");
    const dest = nodePath.join(tmpDir, "copy-dest.txt");
    await fs.writeFile(src, "copy me");
    await fs.copyFile(src, dest);
    const content = await fs.readFile(dest);
    assert.equal(content, "copy me");
  });

  it("rename moves a file", async () => {
    const src = nodePath.join(tmpDir, "rename-src.txt");
    const dest = nodePath.join(tmpDir, "rename-dest.txt");
    await fs.writeFile(src, "move me");
    await fs.rename(src, dest);
    const content = await fs.readFile(dest);
    assert.equal(content, "move me");
    await assert.rejects(() => fs.stat(src));
  });

  it("remove deletes a file", async () => {
    const path = nodePath.join(tmpDir, "remove.txt");
    await fs.writeFile(path, "delete me");
    await fs.remove(path);
    await assert.rejects(() => fs.stat(path));
  });

  it("removeDir recursively removes a directory", async () => {
    const dir = nodePath.join(tmpDir, "rmdir");
    await fs.mkdir(dir);
    await fs.writeFile(nodePath.join(dir, "inner.txt"), "x");
    await fs.removeDir(dir);
    await assert.rejects(() => fs.stat(dir));
  });

  it("makeTempDir creates a directory", async () => {
    const dir = await fs.makeTempDir();
    assert.equal(typeof dir, "string");
    const s = await fs.stat(dir);
    assert.equal(s.isDirectory, true);
    await rm(dir, { recursive: true });
  });

  it("cleanup: remove temp dir", async () => {
    await rm(tmpDir, { recursive: true });
  });
});

// =============================================================================
// 4. subprocess adapter
// =============================================================================

describe("subprocess adapter", () => {
  it("resolveSubprocess returns an adapter", () => {
    const sub = resolveSubprocess();
    assert.notEqual(sub, undefined);
    assert.equal(typeof sub.exec, "function");
  });

  it("exec echo returns stdout", async () => {
    const sub = resolveSubprocess();
    const result = await sub.exec("echo", ["adapter test"], {});
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.includes("adapter test"));
  });

  it("exec with stdin pipes input", async () => {
    const sub = resolveSubprocess();
    const result = await sub.exec("cat", [], { stdin: "piped data" });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "piped data");
  });

  it("exec nonexistent command throws", async () => {
    const sub = resolveSubprocess();
    await assert.rejects(() => sub.exec("nonexistent-cmd-xyz", [], {}));
  });
});

// =============================================================================
// 5. dns adapter
// =============================================================================

describe("dns adapter", () => {
  it("resolveDns returns an adapter", async () => {
    const dns = await resolveDns();
    assert.notEqual(dns, null);
    assert.equal(typeof dns.lookup, "function");
    assert.equal(typeof dns.resolve, "function");
  });

  it("lookup resolves localhost", async () => {
    const dns = await resolveDns();
    const record = await dns.lookup("localhost");
    assert.equal(typeof record.address, "string");
    assert.ok(record.family === 4 || record.family === 6);
  });
});

// =============================================================================
// 6. tcp client adapter
// =============================================================================

describe("tcp client adapter", () => {
  it("resolveTcpClient returns an adapter", async () => {
    const client = await resolveTcpClient();
    assert.notEqual(client, null);
    assert.equal(typeof client.connect, "function");
  });
});

// =============================================================================
// 7. os info adapter
// =============================================================================

describe("os info adapter", () => {
  it("resolveOsInfo returns an adapter", () => {
    const os = resolveOsInfo();
    assert.notEqual(os, undefined);
  });

  it("arch returns a string", () => {
    const os = resolveOsInfo();
    assert.equal(typeof os.arch(), "string");
    assert.ok(os.arch().length > 0);
  });

  it("platform returns a string", () => {
    const os = resolveOsInfo();
    assert.equal(typeof os.platform(), "string");
    assert.ok(os.platform().length > 0);
  });

  it("cpuCount returns a number via navigator.hardwareConcurrency", () => {
    const os = resolveOsInfo();
    const count = os.cpuCount();
    assert.notEqual(count, undefined);
    assert.equal(typeof count, "number");
    assert.ok(count > 0);
  });

  it("tmpDir returns a non-empty string", () => {
    const os = resolveOsInfo();
    const tmp = os.tmpDir();
    assert.equal(typeof tmp, "string");
    assert.ok(tmp.length > 0);
  });

  it("homeDir returns a string", () => {
    const os = resolveOsInfo();
    const home = os.homeDir();
    assert.notEqual(home, undefined);
    assert.equal(typeof home, "string");
  });
});

// =============================================================================
// 8. process info adapter
// =============================================================================

describe("process info adapter", () => {
  it("resolveProcessInfo returns an adapter", () => {
    const proc = resolveProcessInfo();
    assert.notEqual(proc, undefined);
  });

  it("cwd returns current working directory", () => {
    const proc = resolveProcessInfo();
    assert.equal(proc.cwd(), process.cwd());
  });

  it("pid matches process.pid", () => {
    const proc = resolveProcessInfo();
    assert.equal(proc.pid, process.pid);
  });

  it("argv returns an array", () => {
    const proc = resolveProcessInfo();
    assert.ok(Array.isArray(proc.argv));
  });

  it("uptime returns a number", () => {
    const proc = resolveProcessInfo();
    assert.notEqual(proc.uptime, undefined);
    const up = proc.uptime();
    assert.equal(typeof up, "number");
    assert.ok(up > 0);
  });

  it("memoryUsage returns heap and rss", () => {
    const proc = resolveProcessInfo();
    assert.notEqual(proc.memoryUsage, undefined);
    const mem = proc.memoryUsage();
    assert.equal(typeof mem.heapUsed, "number");
    assert.equal(typeof mem.heapTotal, "number");
    assert.equal(typeof mem.rss, "number");
    assert.ok(mem.heapUsed > 0);
    assert.ok(mem.rss > 0);
  });

  it("exit is a function", () => {
    const proc = resolveProcessInfo();
    assert.equal(typeof proc.exit, "function");
    // Don't actually call it!
  });
});
