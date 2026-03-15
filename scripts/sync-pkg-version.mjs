/**
 * Sync the version field from package.json into jsr.json.
 *
 * Why: The project publishes to both npm (reads package.json) and JSR
 * (reads jsr.json). A single source of truth avoids version drift.
 *
 * How: Reads both files, copies the version, writes jsr.json back.
 *
 * Run by: npm `version` lifecycle hook (see package.json "version" script).
 * The hook also runs `git add jsr.json` so the synced file is staged
 * as part of the version commit.
 */

import { readFileSync, writeFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const jsr = JSON.parse(readFileSync("jsr.json", "utf8"));

jsr.version = pkg.version;

writeFileSync("jsr.json", JSON.stringify(jsr, null, 2) + "\n");
