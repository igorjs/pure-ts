/**
 * program.test.js - Black-box tests for Program.run() process lifecycle.
 *
 * Spawns fixture scripts as child processes and verifies exit codes,
 * stdout, and stderr. No mocking, no stubbing - tests real process behaviour.
 *
 * Run: node --test tests/program.test.js
 */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ── Helpers ─────────────────────────────────────────────────────────────────

function spawnFixture(name) {
  const child = spawn(process.execPath, [`tests/fixtures/${name}`], {
    cwd: projectRoot,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', d => {
    out.stdout += d;
  });
  child.stderr.on('data', d => {
    out.stderr += d;
  });
  return { child, out };
}

function waitForExit(child, out, timeoutMs = 10_000) {
  if (child.exitCode !== null) {
    return Promise.resolve({ code: child.exitCode, stdout: out.stdout, stderr: out.stderr });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Timed out waiting for exit'));
    }, timeoutMs);
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout: out.stdout, stderr: out.stderr });
    });
  });
}

function runFixture(name) {
  const { child, out } = spawnFixture(name);
  return waitForExit(child, out);
}

function waitForOutput(child, out, field, text, timeoutMs = 5000) {
  if (out[field].includes(text)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${text}" in ${field}`)),
      timeoutMs,
    );
    const stream = field === 'stdout' ? child.stdout : child.stderr;
    const onData = () => {
      if (out[field].includes(text)) {
        clearTimeout(timer);
        stream.off('data', onData);
        resolve();
      }
    };
    stream.on('data', onData);
  });
}

const LOG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[test\] /;

// ── Ok path ─────────────────────────────────────────────────────────────────

describe('Program.run() Ok path', () => {
  let r;
  before(async () => {
    r = await runFixture('program-ok.js');
  });

  it('exits 0 on Ok result', () => {
    assert.equal(r.code, 0);
  });

  it('logs "started" then "completed" to stdout', () => {
    assert.ok(r.stdout.includes('started'));
    assert.ok(r.stdout.includes('completed'));
    assert.ok(r.stdout.indexOf('started') < r.stdout.indexOf('completed'));
  });

  it('log lines match ISO timestamp and [name] tag format', () => {
    for (const line of r.stdout.trim().split('\n')) {
      assert.match(line, LOG_RE);
    }
  });

  it('produces no stderr output', () => {
    assert.equal(r.stderr, '');
  });
});

// ── Err path ────────────────────────────────────────────────────────────────

describe('Program.run() Err path', () => {
  it('exits 1 on Err with string', async () => {
    const r = await runFixture('program-err-string.js');
    assert.equal(r.code, 1);
    assert.ok(r.stdout.includes('started'));
    assert.ok(r.stderr.includes('error: fail'));
  });

  it('exits 1 on Err with Error object', async () => {
    const r = await runFixture('program-err-error.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: Error: boom'));
  });

  it('exits 1 on Err with plain object (JSON.stringify)', async () => {
    const r = await runFixture('program-err-object.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: {"code":42}'));
  });

  it('exits 1 on Err with custom toString', async () => {
    const r = await runFixture('program-err-custom-tostring.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: CustomErr'));
  });

  it('exits 1 on Err with circular object (fallback)', async () => {
    const r = await runFixture('program-err-circular.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: [object Object]'));
  });

  it('exits 1 on Err with ErrType formatted as Tag(CODE): message', async () => {
    const r = await runFixture('program-errtype.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: NotFound(NOT_FOUND): missing'));
  });
});

// ── Unhandled exception ─────────────────────────────────────────────────────

describe('Program.run() unhandled exception', () => {
  it('exits 1 and logs error when task throws', async () => {
    const r = await runFixture('program-throw.js');
    assert.equal(r.code, 1);
    assert.ok(r.stderr.includes('error: Error: kaboom'));
  });
});

// ── Effect function ─────────────────────────────────────────────────────────

describe('Program.run() effect function', () => {
  it('accepts (signal) => Task form and exits 0', async () => {
    const r = await runFixture('program-effect-fn.js');
    assert.equal(r.code, 0);
    assert.ok(r.stdout.includes('started'));
    assert.ok(r.stdout.includes('completed'));
  });
});

// ── Signal handling ─────────────────────────────────────────────────────────

describe('Program.run() signal handling', () => {
  it('SIGINT logs "interrupted" to stderr and exits 130', async () => {
    const { child, out } = spawnFixture('program-signal-wait.js');
    await waitForOutput(child, out, 'stdout', 'started');
    const exit = waitForExit(child, out);
    child.kill('SIGINT');
    const r = await exit;
    assert.equal(r.code, 130);
    assert.ok(r.stderr.includes('interrupted'));
  });

  it('SIGTERM logs "interrupted" to stderr and exits 130', async () => {
    const { child, out } = spawnFixture('program-signal-wait.js');
    await waitForOutput(child, out, 'stdout', 'started');
    const exit = waitForExit(child, out);
    child.kill('SIGTERM');
    const r = await exit;
    assert.equal(r.code, 130);
    assert.ok(r.stderr.includes('interrupted'));
  });

  it('second SIGINT force-exits with 130', async () => {
    const { child, out } = spawnFixture('program-signal-hang.js');
    await waitForOutput(child, out, 'stdout', 'started');
    const exit = waitForExit(child, out);
    child.kill('SIGINT');
    await waitForOutput(child, out, 'stderr', 'interrupted');
    child.kill('SIGINT');
    const r = await exit;
    assert.equal(r.code, 130);
  });

  it('interrupt takes priority over Ok result', async () => {
    const { child, out } = spawnFixture('program-signal-ok.js');
    await waitForOutput(child, out, 'stdout', 'started');
    const exit = waitForExit(child, out);
    child.kill('SIGINT');
    const r = await exit;
    assert.equal(r.code, 130);
    assert.ok(!r.stdout.includes('completed'));
    assert.ok(r.stderr.includes('interrupted'));
  });

  it('teardown timeout force-exits without second signal', async () => {
    const { child, out } = spawnFixture('program-signal-teardown.js');
    await waitForOutput(child, out, 'stdout', 'started');
    const start = Date.now();
    const exit = waitForExit(child, out);
    child.kill('SIGINT');
    const r = await exit;
    const elapsed = Date.now() - start;
    assert.equal(r.code, 130);
    assert.ok(r.stderr.includes('interrupted'));
    assert.ok(elapsed < 3000, `Expected exit within 3s, took ${elapsed}ms`);
  });
});
