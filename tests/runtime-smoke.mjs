/**
 * runtime-smoke.mjs - Cross-runtime smoke test for multi-runtime modules.
 *
 * Validates File, Command, Process, and Os on every supported runtime.
 * Uses only console.log for output and throws on failure (no node:test,
 * no node:assert) so it runs identically on Node, Deno, Bun, and QuickJS.
 *
 * Run:
 *   node tests/runtime-smoke.mjs
 *   deno run --allow-all tests/runtime-smoke.mjs
 *   bun tests/runtime-smoke.mjs
 *   qjs --std tests/runtime-smoke.mjs
 */

const { File, Command, Process, Os } = await import("../dist/index.js");

let passed = 0;
let failed = 0;

const assert = (condition, message) => {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ok: ${message}`);
    passed++;
  }
};

const section = name => console.log(`\n--- ${name} ---`);

// ── File ────────────────────────────────────────────────────────────────────

section("File.write + File.read");
{
  const tmpResult = await File.tempDir("smoke-").run();
  assert(tmpResult.isOk, "tempDir creates directory");
  const tmp = tmpResult.value;

  const path = `${tmp}/test.txt`;
  const writeResult = await File.write(path, "hello smoke").run();
  assert(writeResult.isOk, "write succeeds");

  const readResult = await File.read(path).run();
  assert(readResult.isOk, "read succeeds");
  assert(
    readResult.value === "hello smoke",
    `read returns written content (got: "${readResult.value}")`,
  );

  // File.append
  section("File.append");
  const appendResult = await File.append(path, " appended").run();
  assert(appendResult.isOk, "append succeeds");

  const readAfterAppend = await File.read(path).run();
  assert(readAfterAppend.isOk, "read after append succeeds");
  assert(
    readAfterAppend.value === "hello smoke appended",
    `append adds content (got: "${readAfterAppend.value}")`,
  );

  // File.exists
  section("File.exists");
  const existsResult = await File.exists(path).run();
  assert(existsResult.isOk && existsResult.value === true, "exists returns true for existing file");

  const notExistsResult = await File.exists(`${tmp}/nope.txt`).run();
  assert(
    notExistsResult.isOk && notExistsResult.value === false,
    "exists returns false for missing file",
  );

  // File.stat with mtime
  section("File.stat");
  const statResult = await File.stat(path).run();
  assert(statResult.isOk, "stat succeeds");
  assert(statResult.value.isFile === true, "stat.isFile is true");
  assert(statResult.value.isDirectory === false, "stat.isDirectory is false");
  assert(statResult.value.size > 0, `stat.size > 0 (got: ${statResult.value.size})`);
  assert(
    statResult.value.mtime instanceof Date && statResult.value.mtime.getTime() > 0,
    "stat.mtime is a valid Date",
  );

  const dirStatResult = await File.stat(tmp).run();
  assert(
    dirStatResult.isOk && dirStatResult.value.isDirectory === true,
    "stat on directory: isDirectory is true",
  );

  // File.makeDir (recursive)
  section("File.makeDir");
  const nestedDir = `${tmp}/a/b/c`;
  const mkdirResult = await File.makeDir(nestedDir).run();
  assert(mkdirResult.isOk, "makeDir recursive succeeds");
  const nestedStat = await File.stat(nestedDir).run();
  assert(nestedStat.isOk && nestedStat.value.isDirectory, "nested directory exists after makeDir");

  // File.list
  section("File.list");
  await File.write(`${tmp}/list1.txt`, "a").run();
  await File.write(`${tmp}/list2.txt`, "b").run();
  const listResult = await File.list(tmp).run();
  assert(listResult.isOk, "list succeeds");
  assert(listResult.value.length >= 2, `list returns entries (got: ${listResult.value.length})`);

  // File.copy
  section("File.copy");
  const copyDest = `${tmp}/copied.txt`;
  const copyResult = await File.copy(path, copyDest).run();
  assert(copyResult.isOk, "copy succeeds");
  const copyRead = await File.read(copyDest).run();
  assert(
    copyRead.isOk && copyRead.value === "hello smoke appended",
    "copied file has correct content",
  );

  // File.rename
  section("File.rename");
  const renameDest = `${tmp}/renamed.txt`;
  const renameResult = await File.rename(copyDest, renameDest).run();
  assert(renameResult.isOk, "rename succeeds");
  const renameExists = await File.exists(copyDest).run();
  assert(renameExists.isOk && renameExists.value === false, "old file gone after rename");
  const renameRead = await File.read(renameDest).run();
  assert(
    renameRead.isOk && renameRead.value === "hello smoke appended",
    "renamed file has correct content",
  );

  // File.remove
  section("File.remove");
  const removeResult = await File.remove(renameDest).run();
  assert(removeResult.isOk, "remove succeeds");
  const afterRemove = await File.exists(renameDest).run();
  assert(afterRemove.isOk && afterRemove.value === false, "file gone after remove");

  // File.removeDir (recursive)
  section("File.removeDir");
  const removeDirResult = await File.removeDir(tmp).run();
  assert(removeDirResult.isOk, "removeDir recursive succeeds");
  const afterRemoveDir = await File.stat(tmp).run();
  assert(afterRemoveDir.isErr, "directory gone after removeDir");
}

// ── Command ─────────────────────────────────────────────────────────────────

section("Command.exec");
{
  const echoResult = await Command.exec("echo", ["smoke test"]).run();
  assert(echoResult.isOk, "exec echo succeeds");
  assert(echoResult.value.exitCode === 0, "echo exit code is 0");
  assert(echoResult.value.stdout.includes("smoke test"), `echo stdout contains 'smoke test'`);

  // Non-zero exit is Ok, not Err
  const falseResult = await Command.exec("false").run();
  assert(falseResult.isOk, "exec false returns Ok (non-zero exit is not an error)");
  assert(falseResult.value.exitCode !== 0, "false exit code is non-zero");

  // Nonexistent command
  const badResult = await Command.exec("nonexistent-command-xyz-12345").run();
  assert(badResult.isErr, "exec nonexistent command returns Err");
  assert(badResult.error.tag === "CommandError", "error tag is CommandError");
}

section("Command.exec with stdin");
{
  const catResult = await Command.exec("cat", [], { stdin: "piped input" }).run();
  assert(catResult.isOk, "exec cat with stdin succeeds");
  assert(
    catResult.value.stdout === "piped input",
    `stdin piped to stdout (got: "${catResult.value.stdout}")`,
  );
}

section("Command.exec with cwd");
{
  const cwdResult = await Command.exec("pwd", [], { cwd: "/tmp" }).run();
  assert(cwdResult.isOk, "exec pwd with cwd succeeds");
  assert(
    cwdResult.value.stdout.includes("/tmp"),
    `cwd respected (got: "${cwdResult.value.stdout.trim()}")`,
  );
}

// ── Process ─────────────────────────────────────────────────────────────────

section("Process");
{
  const cwd = Process.cwd();
  assert(cwd.isOk, "cwd returns Ok");
  assert(
    typeof cwd.value === "string" && cwd.value.length > 0,
    `cwd is a non-empty string (got: "${cwd.value}")`,
  );

  const pid = Process.pid();
  assert(pid.isSome, "pid returns Some");
  assert(
    typeof pid.unwrap() === "number" && pid.unwrap() > 0,
    `pid is a positive number (got: ${pid.unwrap()})`,
  );

  const argv = Process.argv();
  assert(Array.isArray(argv), "argv returns an array");
}

// ── Os ──────────────────────────────────────────────────────────────────────

section("Os");
{
  const tmpDir = Os.tmpDir();
  assert(
    typeof tmpDir === "string" && tmpDir.length > 0,
    `tmpDir is a non-empty string (got: "${tmpDir}")`,
  );

  const homeDir = Os.homeDir();
  // homeDir may be None in some environments
  if (homeDir.isSome) {
    assert(
      typeof homeDir.unwrap() === "string",
      `homeDir is a string (got: "${homeDir.unwrap()}")`,
    );
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n========================================`);
console.log(`Smoke test results: ${passed} passed, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  // Use a cross-runtime exit strategy
  if (typeof process !== "undefined" && typeof process.exit === "function") {
    process.exit(1);
  }
  throw new Error(`${failed} smoke test(s) failed`);
}
