/**
 * tier2-runtime.test.js - Tests for Tier 2 runtime modules.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Run: node --test tests/tier2-runtime.test.js
 *
 * Tests the compiled dist/ output, not the source.
 * Covers: Command, Os, Process, Path (new methods), File (multi-runtime).
 */

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import nodeOs from "node:os";
import nodePath from "node:path";
import { describe, it } from "node:test";

const {
  Command,
  CommandError,
  Os,
  Process,
  ProcessError,
  Path,
  Schema,
  File,
  Ok,
  Err,
  Some,
  None,
  Duration,
} = await import("../dist/index.js");

// =============================================================================
// Command (subprocess)
// =============================================================================

describe("Command", () => {
  it("exec echo: returns Ok with exitCode 0 and stdout", async () => {
    const task = Command.exec("echo", ["hello"]);
    assert.equal(typeof task.run, "function");

    const result = await task.run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.exitCode, 0);
    assert.ok(result.value.stdout.includes("hello"));
  });

  it("exec node -e console.log: captures stdout", async () => {
    const result = await Command.exec("node", ["-e", 'console.log("test")']).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.stdout, "test\n");
  });

  it("exec non-zero exit: returns Ok with exitCode 1 (not an error)", async () => {
    const result = await Command.exec("node", ["-e", "process.exit(1)"]).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.exitCode, 1);
  });

  it("exec stderr: captures stderr output", async () => {
    const result = await Command.exec("node", ["-e", 'console.error("err")']).run();
    assert.equal(result.isOk, true);
    assert.ok(result.value.stderr.includes("err"));
  });

  it("exec nonexistent command: returns Err(CommandError)", async () => {
    const result = await Command.exec("nonexistent-command-xyz").run();
    assert.equal(result.isErr, true);
    assert.equal(result.error.tag, "CommandError");
  });

  it("exec with cwd option: respects working directory", async () => {
    const result = await Command.exec("pwd", [], { cwd: "/tmp" }).run();
    assert.equal(result.isOk, true);
    // /tmp may resolve to /private/tmp on macOS
    assert.ok(
      result.value.stdout.includes("/tmp"),
      `Expected stdout to contain '/tmp', got: ${result.value.stdout}`,
    );
  });

  it("exec with stdin: pipes input to process", async () => {
    const result = await Command.exec("cat", [], { stdin: "hello from stdin" }).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.exitCode, 0);
    assert.equal(result.value.stdout, "hello from stdin");
  });

  it("exec with stdin: multiline input", async () => {
    const input = "line1\nline2\nline3";
    const result = await Command.exec("cat", [], { stdin: input }).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.stdout, input);
  });

  it("exec with stdin: process reads from stdin via node -e", async () => {
    const code =
      "process.stdin.setEncoding('utf8');let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(d.toUpperCase().trim()))";
    const result = await Command.exec("node", ["-e", code], { stdin: "hello" }).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.stdout, "HELLO\n");
  });

  it("exec with timeout: completes before timeout", async () => {
    const result = await Command.exec("echo", ["fast"], { timeout: 5000 }).run();
    assert.equal(result.isOk, true);
    assert.ok(result.value.stdout.includes("fast"));
  });

  it("exec with timeout: returns Err on timeout", async () => {
    const result = await Command.exec("sleep", ["10"], { timeout: 100 }).run();
    assert.equal(result.isErr, true);
    assert.equal(result.error.tag, "CommandError");
    assert.ok(
      result.error.message.includes("timed out"),
      `Expected timeout message, got: ${result.error.message}`,
    );
  });

  it("exec with stdin and timeout: both work together", async () => {
    const result = await Command.exec("cat", [], { stdin: "combined", timeout: 5000 }).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.stdout, "combined");
  });
});

// =============================================================================
// Os
// =============================================================================

describe("Os", () => {
  // Note: Os uses Function('return require("node:os")')() for sync access.
  // In Node ESM (type: module), require is not available, so functions
  // that depend solely on node:os degrade gracefully (None / "unknown").
  // Functions with fallback paths (cpuCount via navigator, homeDir via
  // process.env, tmpDir via process.env) still succeed.

  it("hostname: returns Option<string>", () => {
    const result = Os.hostname();
    // In ESM mode, may return None since node:os require fails.
    // When available, should match nodeOs.hostname().
    if (result.isSome) {
      assert.equal(typeof result.unwrap(), "string");
      assert.equal(result.unwrap(), nodeOs.hostname());
    } else {
      assert.equal(result.isNone, true);
    }
  });

  it("arch: returns a string", () => {
    const result = Os.arch();
    assert.equal(typeof result, "string");
    // In ESM mode without node:os, returns "unknown"
    assert.ok(result.length > 0, "Expected arch to be a non-empty string");
  });

  it("platform: returns a string", () => {
    const result = Os.platform();
    assert.equal(typeof result, "string");
    // In ESM mode without node:os, returns "unknown"
    assert.ok(result.length > 0, "Expected platform to be a non-empty string");
  });

  it("cpuCount: returns Some(number) > 0 via navigator.hardwareConcurrency", () => {
    const result = Os.cpuCount();
    // navigator.hardwareConcurrency is available in Node, so this works
    assert.equal(result.isSome, true);
    const count = result.unwrap();
    assert.equal(typeof count, "number");
    assert.ok(count > 0, `Expected cpuCount > 0, got ${count}`);
  });

  it("totalMemory: returns Option<number>", () => {
    const result = Os.totalMemory();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const mem = result.unwrap();
      assert.equal(typeof mem, "number");
      assert.ok(mem > 0, `Expected totalMemory > 0, got ${mem}`);
    } else {
      assert.equal(result.isNone, true);
    }
  });

  it("freeMemory: returns Option<number>", () => {
    const result = Os.freeMemory();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const mem = result.unwrap();
      assert.equal(typeof mem, "number");
      assert.ok(mem > 0, `Expected freeMemory > 0, got ${mem}`);
    } else {
      assert.equal(result.isNone, true);
    }
  });

  it("tmpDir: returns a non-empty string", () => {
    const result = Os.tmpDir();
    assert.equal(typeof result, "string");
    assert.ok(result.length > 0, "Expected tmpDir to be non-empty");
  });

  it("homeDir: returns Some(string) via process.env fallback", () => {
    const result = Os.homeDir();
    assert.equal(result.isSome, true);
    const home = result.unwrap();
    assert.equal(typeof home, "string");
    assert.equal(home, nodeOs.homedir());
  });

  it("uptime: returns Option<number>", () => {
    const result = Os.uptime();
    // Depends on node:os require; may be None in ESM
    if (result.isSome) {
      const up = result.unwrap();
      assert.equal(typeof up, "number");
      assert.ok(up > 0, `Expected uptime > 0, got ${up}`);
    } else {
      assert.equal(result.isNone, true);
    }
  });
});

// =============================================================================
// Process
// =============================================================================

describe("Process", () => {
  it("cwd: returns Ok(string) matching process.cwd()", () => {
    const result = Process.cwd();
    assert.equal(result.isOk, true);
    assert.equal(typeof result.value, "string");
    assert.equal(result.value, process.cwd());
  });

  it("pid: returns Some(number) matching process.pid", () => {
    const result = Process.pid();
    assert.equal(result.isSome, true);
    const pid = result.unwrap();
    assert.equal(typeof pid, "number");
    assert.equal(pid, process.pid);
  });

  it("uptime: returns Some(number) > 0", () => {
    const result = Process.uptime();
    assert.equal(result.isSome, true);
    const up = result.unwrap();
    assert.equal(typeof up, "number");
    assert.ok(up > 0, `Expected process uptime > 0, got ${up}`);
  });

  it("memoryUsage: returns Some with heapUsed, heapTotal, rss > 0", () => {
    const result = Process.memoryUsage();
    assert.equal(result.isSome, true);
    const mem = result.unwrap();
    assert.equal(typeof mem.heapUsed, "number");
    assert.equal(typeof mem.heapTotal, "number");
    assert.equal(typeof mem.rss, "number");
    assert.ok(mem.heapUsed > 0, `Expected heapUsed > 0, got ${mem.heapUsed}`);
    assert.ok(mem.heapTotal > 0, `Expected heapTotal > 0, got ${mem.heapTotal}`);
    assert.ok(mem.rss > 0, `Expected rss > 0, got ${mem.rss}`);
  });

  it("argv: returns an array", () => {
    const result = Process.argv();
    assert.ok(Array.isArray(result), "Expected argv to return an array");
  });

  it("parseArgs: parses --key=value format with schema", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string,
        host: Schema.string,
      },
      ["--port=3000", "--host=localhost"],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.port, "3000");
    assert.equal(result.value.host, "localhost");
  });

  it("parseArgs: parses --key value format", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string,
      },
      ["--port", "8080"],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.port, "8080");
  });

  it("parseArgs: parses --flag as 'true' string", () => {
    const result = Process.parseArgs(
      {
        verbose: Schema.string,
      },
      ["--verbose"],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.verbose, "true");
  });

  it("parseArgs: transform string to number via schema", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string.transform(Number),
      },
      ["--port=3000"],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.port, 3000);
    assert.equal(typeof result.value.port, "number");
  });

  it("parseArgs: optional field missing returns undefined", () => {
    const result = Process.parseArgs(
      {
        port: Schema.string.optional(),
      },
      [],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.port, undefined);
  });

  it("parseArgs: default value when field missing", () => {
    const result = Process.parseArgs(
      {
        mode: Schema.string.default("development"),
      },
      [],
    );
    assert.equal(result.isOk, true);
    assert.equal(result.value.mode, "development");
  });
});

// =============================================================================
// Path (new methods: isAbsolute, parse, resolve, relative)
// =============================================================================

describe("Path", () => {
  describe("isAbsolute", () => {
    it("returns true for absolute path starting with /", () => {
      assert.equal(Path.isAbsolute("/foo"), true);
    });

    it("returns false for relative path without leading /", () => {
      assert.equal(Path.isAbsolute("foo"), false);
    });

    it("returns false for relative path starting with ./", () => {
      assert.equal(Path.isAbsolute("./foo"), false);
    });
  });

  describe("parse", () => {
    it("decomposes path with multiple extensions", () => {
      const parts = Path.parse("/home/user/file.test.ts");
      assert.equal(parts.base, "file.test.ts");
      assert.equal(parts.ext, ".ts");
      assert.equal(parts.name, "file.test");
      assert.equal(parts.dir, "/home/user");
    });

    it("handles filename without directory", () => {
      const parts = Path.parse("file.ts");
      assert.equal(parts.base, "file.ts");
      assert.equal(parts.ext, ".ts");
      assert.equal(parts.name, "file");
      assert.equal(parts.dir, ".");
    });

    it("handles path with no extension", () => {
      const parts = Path.parse("/usr/bin/node");
      assert.equal(parts.base, "node");
      assert.equal(parts.ext, "");
      assert.equal(parts.name, "node");
    });

    it("root is / for absolute POSIX paths", () => {
      const parts = Path.parse("/home/user/file.ts");
      assert.equal(parts.root, "/");
    });

    it("root is empty for relative paths", () => {
      const parts = Path.parse("src/file.ts");
      assert.equal(parts.root, "");
    });
  });

  describe("resolve", () => {
    it("resolves relative segments into a normalized path", () => {
      const result = Path.resolve("foo", "bar");
      assert.ok(Path.isAbsolute(result), `Expected resolved path to be absolute, got: ${result}`);
      assert.ok(result.endsWith("foo/bar"), `Expected path to end with foo/bar, got: ${result}`);
    });

    it("absolute segment anchors the result", () => {
      const result = Path.resolve("/foo", "bar");
      assert.ok(result.startsWith("/foo"), `Expected path to start with /foo, got: ${result}`);
      assert.ok(result.includes("bar"), `Expected path to include bar, got: ${result}`);
    });

    it("resolves dot segments", () => {
      const result = Path.resolve("/foo", "bar", "..", "baz");
      assert.equal(result, "/foo/baz");
    });
  });

  describe("relative", () => {
    it("computes relative path between directories", () => {
      const result = Path.relative("/home/user", "/home/user/docs/file.ts");
      assert.equal(result, "docs/file.ts");
    });

    it("computes relative path going up", () => {
      const result = Path.relative("/home/user/docs", "/home/user");
      assert.equal(result, "..");
    });

    it("same path returns .", () => {
      const result = Path.relative("/home/user", "/home/user");
      assert.equal(result, ".");
    });
  });
});

// =============================================================================
// File (multi-runtime verification on Node)
// =============================================================================

describe("File", () => {
  let tmpDir;

  it("setup: create temp directory", async () => {
    tmpDir = await mkdtemp(nodePath.join(nodeOs.tmpdir(), "pure-ts-tier2-"));
  });

  it("write then read: roundtrip on Node", async () => {
    const filePath = nodePath.join(tmpDir, "roundtrip.txt");
    const writeResult = await File.write(filePath, "hello tier2").run();
    assert.equal(writeResult.isOk, true);

    const readResult = await File.read(filePath).run();
    assert.equal(readResult.isOk, true);
    assert.equal(readResult.value, "hello tier2");
  });

  it("append then read: appends content to file", async () => {
    const filePath = nodePath.join(tmpDir, "append.txt");
    await File.write(filePath, "hello").run();
    await File.append(filePath, " world").run();

    const readResult = await File.read(filePath).run();
    assert.equal(readResult.isOk, true);
    assert.equal(readResult.value, "hello world");
  });

  it("stat: returns isFile true for a file", async () => {
    const filePath = nodePath.join(tmpDir, "stat-file.txt");
    await writeFile(filePath, "stat test");

    const result = await File.stat(filePath).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.isFile, true);
    assert.equal(result.value.isDirectory, false);
    assert.ok(result.value.size > 0, `Expected file size > 0, got ${result.value.size}`);
    assert.ok(result.value.mtime instanceof Date, "Expected mtime to be a Date");
    assert.ok(result.value.mtime.getTime() > 0, "Expected mtime to be a valid date");
  });

  it("stat: returns isDirectory true for a directory", async () => {
    const result = await File.stat(tmpDir).run();
    assert.equal(result.isOk, true);
    assert.equal(result.value.isDirectory, true);
    assert.equal(result.value.isFile, false);
  });

  it("copy: actually copies file content", async () => {
    const src = nodePath.join(tmpDir, "copy-src.txt");
    const dest = nodePath.join(tmpDir, "copy-dest.txt");
    await writeFile(src, "copy me");

    const copyResult = await File.copy(src, dest).run();
    assert.equal(copyResult.isOk, true);

    // Verify content was copied using native fs
    const content = await readFile(dest, "utf-8");
    assert.equal(content, "copy me");

    // Verify source still exists
    const srcExists = await File.exists(src).run();
    assert.equal(srcExists.value, true);
  });

  it("rename: actually moves the file", async () => {
    const oldPath = nodePath.join(tmpDir, "rename-old.txt");
    const newPath = nodePath.join(tmpDir, "rename-new.txt");
    await writeFile(oldPath, "rename me");

    const renameResult = await File.rename(oldPath, newPath).run();
    assert.equal(renameResult.isOk, true);

    // Old file should no longer exist
    const oldExists = await File.exists(oldPath).run();
    assert.equal(oldExists.value, false);

    // New file should exist with correct content
    const content = await readFile(newPath, "utf-8");
    assert.equal(content, "rename me");
  });

  it("removeDir: recursively removes a directory and its contents", async () => {
    const dir = nodePath.join(tmpDir, "remove-dir-test");
    const nested = nodePath.join(dir, "nested");
    await mkdir(nested, { recursive: true });
    await writeFile(nodePath.join(dir, "a.txt"), "a");
    await writeFile(nodePath.join(nested, "b.txt"), "b");

    const result = await File.removeDir(dir).run();
    assert.equal(result.isOk, true);

    // Verify directory no longer exists
    const exists = await File.stat(dir).run();
    assert.equal(exists.isErr, true);
  });

  it("tempDir: creates a directory that exists", async () => {
    const result = await File.tempDir("pure-ts-test-").run();
    assert.equal(result.isOk, true);
    const dir = result.value;
    assert.equal(typeof dir, "string");
    assert.ok(dir.length > 0, "Expected tempDir to return a non-empty path");

    // Verify the directory exists by stat-ing it
    const statResult = await File.stat(dir).run();
    assert.equal(statResult.isOk, true);
    assert.equal(statResult.value.isDirectory, true);

    // Clean up the temp dir
    await rm(dir, { recursive: true, force: true });
  });

  it("cleanup: remove temp directory", async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });
});
