/**
 * Automated release script.
 *
 * Generates a changelog from conventional commits, bumps the version in
 * package.json and jsr.json, commits, tags, pushes, and creates a GitHub
 * release with the changelog as release notes.
 *
 * Usage:
 *   node scripts/release.mjs patch    # 0.3.1 -> 0.3.2
 *   node scripts/release.mjs minor    # 0.3.1 -> 0.4.0
 *   node scripts/release.mjs major    # 0.3.1 -> 1.0.0
 *   node scripts/release.mjs 0.4.0    # explicit version
 *   node scripts/release.mjs minor --yes  # skip confirmation prompt
 *
 * Requires: gh CLI (authenticated), git signing configured.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// -- Helpers ------------------------------------------------------------------

const run = (cmd, opts) => execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts }).trim();
const log = (msg) => process.stdout.write(`${msg}\n`);
const die = (msg) => {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
};

// -- Parse args ---------------------------------------------------------------

const args = process.argv.slice(2);
const yesFlag = args.includes("--yes") || args.includes("-y");
const bump = args.find((a) => !a.startsWith("-"));
if (!bump) {
  die("Usage: node scripts/release.mjs <patch|minor|major|x.y.z> [--yes]");
}

// -- Pre-flight checks --------------------------------------------------------

const status = run("git status --porcelain");
if (status.length > 0) {
  die("Working directory is not clean. Commit or stash changes first.");
}

const branch = run("git rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  die(`Must be on main branch (currently on ${branch}).`);
}

try {
  run("gh --version");
} catch {
  die("GitHub CLI (gh) is not installed or not in PATH.");
}

// -- Detect repo URL from git remote ------------------------------------------

const repoUrl = run("git remote get-url origin")
  .replace(/\.git$/, "")
  .replace(/^git@github\.com:/, "https://github.com/");

// -- Compute new version ------------------------------------------------------

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split(".").map(Number);

let newVersion;
if (bump === "patch") {
  newVersion = `${major}.${minor}.${patch + 1}`;
} else if (bump === "minor") {
  newVersion = `${major}.${minor + 1}.0`;
} else if (bump === "major") {
  newVersion = `${major + 1}.0.0`;
} else if (/^\d+\.\d+\.\d+$/.test(bump)) {
  newVersion = bump;
} else {
  die(`Invalid bump: "${bump}". Use patch, minor, major, or x.y.z.`);
}

log(`\nRelease: v${currentVersion} -> v${newVersion}`);

// -- Find previous tag --------------------------------------------------------

const lastTag = `v${currentVersion}`;
let hasLastTag = false;
try {
  run(`git rev-parse ${lastTag}`);
  hasLastTag = true;
} catch {
  log(`Warning: tag ${lastTag} not found, using all commits on main.`);
}

// -- Generate changelog -------------------------------------------------------

const CATEGORIES = [
  { prefix: "feat", label: "Features" },
  { prefix: "fix", label: "Bug Fixes" },
  { prefix: "perf", label: "Performance" },
  { prefix: "refactor", label: "Refactoring" },
  { prefix: "test", label: "Tests" },
  { prefix: "docs", label: "Documentation" },
  { prefix: "ci", label: "CI" },
  { prefix: "build", label: "Build" },
  { prefix: "chore", label: "Chores" },
];

const range = hasLastTag ? `${lastTag}..HEAD` : "HEAD";
const rawLog = run(`git log --oneline ${range}`);
const commits = rawLog
  .split("\n")
  .filter((line) => line.length > 0)
  // Skip version bump commits
  .filter((line) => !line.includes("bump to ") && !line.includes("bump version"));

const sections = [];
const uncategorized = [];

for (const cat of CATEGORIES) {
  const matching = commits.filter((c) => {
    const msg = c.slice(c.indexOf(" ") + 1);
    return msg.startsWith(`${cat.prefix}:`) || msg.startsWith(`${cat.prefix}(`);
  });
  if (matching.length > 0) {
    sections.push({
      label: cat.label,
      items: matching.map((c) => {
        const hash = c.slice(0, c.indexOf(" "));
        const msg = c.slice(c.indexOf(" ") + 1);
        // Strip the type prefix for cleaner display
        const clean = msg.replace(/^\w+(\([^)]*\))?:\s*/, "");
        return `- ${clean} (${hash})`;
      }),
    });
  }
}

// Commits that don't match any conventional prefix
for (const c of commits) {
  const msg = c.slice(c.indexOf(" ") + 1);
  const matched = CATEGORIES.some(
    (cat) => msg.startsWith(`${cat.prefix}:`) || msg.startsWith(`${cat.prefix}(`),
  );
  if (!matched) {
    const hash = c.slice(0, c.indexOf(" "));
    uncategorized.push(`- ${msg} (${hash})`);
  }
}

let changelog = `## What's Changed\n\n`;
for (const section of sections) {
  changelog += `### ${section.label}\n`;
  for (const item of section.items) {
    changelog += `${item}\n`;
  }
  changelog += "\n";
}
if (uncategorized.length > 0) {
  changelog += `### Other\n`;
  for (const item of uncategorized) {
    changelog += `${item}\n`;
  }
  changelog += "\n";
}
changelog += `**Full Changelog**: ${repoUrl}/compare/v${currentVersion}...v${newVersion}\n`;

log("\n--- Changelog ---");
log(changelog);
log("-----------------\n");

// -- Confirm ------------------------------------------------------------------

if (!yesFlag) {
  const readline = await import("node:readline");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question(`Proceed with release v${newVersion}? [y/N] `, resolve);
  });
  rl.close();

  if (answer.toLowerCase() !== "y" && answer.toLowerCase() !== "yes") {
    log("Aborted.");
    process.exit(0);
  }
}

// -- Bump version -------------------------------------------------------------

log("\nBumping version...");
pkg.version = newVersion;
writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");

const jsr = JSON.parse(readFileSync("jsr.json", "utf8"));
jsr.version = newVersion;
writeFileSync("jsr.json", JSON.stringify(jsr, null, 2) + "\n");

// -- Update test badge in README ----------------------------------------------

try {
  const readme = readFileSync("README.md", "utf8");
  const testCount = run("pnpm run build > /dev/null 2>&1 && pnpm test 2>&1 | grep -oP '(?<=pass )\\d+'");
  if (testCount) {
    const updated = readme.replace(
      /tests-\d+_passing/,
      `tests-${testCount}_passing`,
    );
    if (updated !== readme) {
      writeFileSync("README.md", updated);
      log(`Updated test badge: ${testCount} passing`);
    }
  }
} catch {
  // Non-critical: skip if test count extraction fails
}

// -- Commit, tag, push --------------------------------------------------------

log("Committing...");
run("git add package.json jsr.json README.md");
const commitMsg = `chore: bump to ${newVersion}\n\n${changelog}`;
writeFileSync(".git/.release-msg.tmp", commitMsg);
run('git commit --signoff --gpg-sign --file .git/.release-msg.tmp');
run("rm -f .git/.release-msg.tmp");

log("Tagging...");
run(`git tag -s v${newVersion} -m "v${newVersion}"`);

log("Pushing...");
run("git push origin HEAD:refs/heads/main");
run(`git push origin v${newVersion}`);

// -- Create GitHub release ----------------------------------------------------

log("Creating GitHub release...");
writeFileSync(".git/.release-notes.tmp", changelog);
run(`gh release create v${newVersion} --title "v${newVersion}" --notes-file .git/.release-notes.tmp`);
run("rm -f .git/.release-notes.tmp");

// -- Clean up filter-branch refs if any ---------------------------------------

try {
  run("git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin");
} catch {
  // No refs to clean
}

log(`\nReleased v${newVersion}`);
log(`${repoUrl}/releases/tag/v${newVersion}`);
