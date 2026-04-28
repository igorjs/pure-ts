/**
 * terminal.test.js - Tests for the Terminal module.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 * Tests the compiled dist/ output (black-box).
 *
 * Terminal is inherently I/O-bound, so some features (interactive readLine,
 * readPassword) are tested by spawning child processes with piped stdin.
 */

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";

const { Terminal, TerminalError, Ok, Err, Some, None } = await import("../dist/index.js");

// =============================================================================
// 1. isInteractive
// =============================================================================

describe("Terminal.isInteractive", () => {
  it("returns false when stdin is piped (test runner)", () => {
    // Node test runner pipes stdin, so this should be false
    assert.equal(Terminal.isInteractive(), false);
  });

  it("returns a boolean", () => {
    assert.equal(typeof Terminal.isInteractive(), "boolean");
  });
});

// =============================================================================
// 2. size
// =============================================================================

describe("Terminal.size", () => {
  it("returns Option<TerminalSize>", () => {
    const result = Terminal.size();
    // In a piped environment, may be None or Some depending on stdout
    if (result.isSome) {
      const size = result.unwrap();
      assert.equal(typeof size.columns, "number");
      assert.equal(typeof size.rows, "number");
      assert.ok(size.columns > 0);
      assert.ok(size.rows > 0);
    } else {
      assert.equal(result.isNone, true);
    }
  });
});

// =============================================================================
// 3. clear
// =============================================================================

describe("Terminal.clear", () => {
  it("does not throw in non-TTY mode", () => {
    // clear is a no-op when not interactive
    assert.doesNotThrow(() => Terminal.clear());
  });
});

// =============================================================================
// 4. write / writeLine
// =============================================================================

describe("Terminal.write", () => {
  it("returns Ok(undefined) on success", () => {
    const result = Terminal.write("");
    assert.equal(result.isOk, true);
    assert.equal(result.value, undefined);
  });

  it("writes text to stdout without error", () => {
    const result = Terminal.write("test output");
    assert.equal(result.isOk, true);
  });
});

describe("Terminal.writeLine", () => {
  it("returns Ok(undefined) on success", () => {
    const result = Terminal.writeLine("");
    assert.equal(result.isOk, true);
    assert.equal(result.value, undefined);
  });

  it("writes text with newline to stdout", () => {
    const result = Terminal.writeLine("test line");
    assert.equal(result.isOk, true);
  });
});

// =============================================================================
// 5. readAll (piped stdin)
// =============================================================================

describe("Terminal.readAll", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readAll();
    assert.equal(typeof task.run, "function");
  });

  it("returns Ok(string) when stdin is piped", async () => {
    // In test runner, stdin is piped but already consumed, so readAll may
    // return empty or block. Test via child process instead.
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("hello from pipe");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, "hello from pipe");
  });

  it("handles multi-line piped input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("line1\nline2\nline3");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, "line1\nline2\nline3");
  });

  it("handles empty piped input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readAll().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, "");
  });
});

// =============================================================================
// 6. readLine (piped stdin)
// =============================================================================

describe("Terminal.readLine", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readLine("prompt: ");
    assert.equal(typeof task.run, "function");
  });

  it("reads a line from piped stdin", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isSome: r.value?.isSome, value: r.value?.isSome ? r.value.unwrap() : null }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("hello\n");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.isSome, true);
    assert.equal(result.value, "hello");
  });

  it("returns None on EOF (empty stdin)", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine().run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isNone: r.value?.isNone }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.isNone, true);
  });

  it("with timeout returns None when no input arrives", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.readLine("", { timeout: 100 }).run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, isNone: r.value?.isNone }))))',
        ],
        { cwd: process.cwd(), timeout: 5000 },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      // Don't write anything, don't end stdin - let timeout fire
      // But we need to eventually end it for the process to exit
      setTimeout(() => child.stdin.end(), 500);
    });
    assert.equal(result.isOk, true);
    assert.equal(result.isNone, true);
  });
});

// =============================================================================
// 7. readPassword (non-TTY)
// =============================================================================

describe("Terminal.readPassword", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.readPassword("Password: ");
    assert.equal(typeof task.run, "function");
  });

  it("returns Err(TerminalError) when stdin is not a TTY", async () => {
    const result = await Terminal.readPassword("Password: ").run();
    assert.equal(result.isErr, true);
    assert.equal(result.error.tag, "TerminalError");
    assert.ok(result.error.message.includes("TTY"));
  });
});

// =============================================================================
// 8. confirm (piped stdin)
// =============================================================================

describe("Terminal.confirm", () => {
  it("returns a TaskLike with lazy run()", () => {
    const task = Terminal.confirm("Continue?");
    assert.equal(typeof task.run, "function");
  });

  it("returns true for 'y' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("y\n");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, true);
  });

  it("returns true for 'yes' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("yes\n");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, true);
  });

  it("returns false for 'n' input", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("n\n");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, false);
  });

  it("returns false for invalid input in non-interactive mode", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.write("maybe\n");
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, false);
  });

  it("returns false on EOF", async () => {
    const result = await new Promise((resolve, reject) => {
      const child = execFile(
        "node",
        [
          "-e",
          'import("./dist/index.js").then(m => m.Terminal.confirm("ok?").run().then(r => process.stderr.write(JSON.stringify({ isOk: r.isOk, value: r.value }))))',
        ],
        { cwd: process.cwd() },
        (err, _stdout, stderr) => {
          if (err) reject(err);
          else resolve(JSON.parse(stderr));
        },
      );
      child.stdin.end();
    });
    assert.equal(result.isOk, true);
    assert.equal(result.value, false);
  });
});

// =============================================================================
// 9. TerminalError type
// =============================================================================

describe("TerminalError", () => {
  it("is exported and has correct tag", () => {
    const err = TerminalError("test error");
    assert.equal(err.tag, "TerminalError");
    assert.equal(err.message, "test error");
  });
});
