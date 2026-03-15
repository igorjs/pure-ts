/**
 * Post-build step: strip JSDoc and decoration comments from .js output.
 *
 * Why: The .d.ts files carry all JSDoc for IDE tooltips. The .js files are
 * only read by the runtime engine, which ignores comments. Stripping them
 * cuts JS output by ~46% without losing any consumer-facing documentation.
 * Consumers' bundlers (esbuild, Rollup, Vite) would strip them again anyway.
 *
 * How: Regex-based removal of block comments and single-line comments,
 * preserving sourceMappingURL directives. Safe because pure-ts source
 * contains no string literals with comment-like sequences.
 *
 * Run by: `pnpm run build` (chained after `tsgo`)
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dist = "./dist";

for (const name of await readdir(dist)) {
  if (!name.endsWith(".js")) continue;

  const path = join(dist, name);
  let code = await readFile(path, "utf8");

  // Strip block comments and their leading indentation. Safe here because
  // pure-ts source has no string literals containing "/*".
  code = code.replace(/[ \t]*\/\*[\s\S]*?\*\/\n?/g, "");

  // Strip single-line decoration comments and their leading indentation,
  // preserve sourceMappingURL
  code = code.replace(/^[ \t]*\/\/(?!#).*\n?/gm, "");

  // Collapse runs of blank lines to one
  code = code.replace(/\n{3,}/g, "\n");

  // Trim leading/trailing whitespace
  code = code.trim() + "\n";

  await writeFile(path, code);
}
