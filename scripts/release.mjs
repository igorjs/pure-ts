/**
 * Automated release script.
 *
 * Generates a changelog from conventional commits, bumps the version in
 * package.json and jsr.json, commits, tags, pushes, and creates a GitHub
 * release with the changelog as release notes.
 *
 * Usage:
 *   node scripts/release.mjs              # release version currently in package.json
 *   node scripts/release.mjs patch        # 0.3.1 -> 0.3.2
 *   node scripts/release.mjs minor        # 0.3.0 -> 0.3.1
 *   node scripts/release.mjs major        # 0.3.1 -> 1.0.0
 *   node scripts/release.mjs 0.5.0        # explicit version
 *   node scripts/release.mjs minor --yes  # skip confirmation prompt
 *   node scripts/release.mjs --dry-run    # preview without changing any state
 *
 * Pre-flight checks abort the release if the resulting tag already exists
 * locally, on origin, or as a published GitHub release.
 *
 * Dry-run (-n / --dry-run): every file write, git mutation, and gh release
 * call is short-circuited and printed as `[dry-run] WOULD ...`. The working
 * tree, refs, remote, and GitHub state are guaranteed to be unchanged.
 *
 * Requires: gh CLI (authenticated), git signing configured.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// -- Helpers ------------------------------------------------------------------

const run = (cmd, opts) => {
  const result = execSync(cmd, { encoding: "utf-8", stdio: "pipe", ...opts });
  return result ? result.trim() : "";
};
const log = (msg) => process.stdout.write(`${msg}\n`);
const die = (msg) => {
  process.stderr.write(`Error: ${msg}\n`);
  process.exit(1);
};

// -- Parse args ---------------------------------------------------------------

const args = process.argv.slice(2);
const yesFlag = args.includes("--yes") || args.includes("-y");
const dryRun = args.includes("--dry-run") || args.includes("-n");
// In dry-run we skip the test:ci and publish dry-run too — they're slow and
// not useful for the "what would happen?" reporting.
const skipTestCi = args.includes("--skip-test-ci") || dryRun;
const bump = args.find((a) => !a.startsWith("-") && a.length > 0);
// bump is undefined when no positional arg is passed → release the version
// currently in package.json without a bump.

if (dryRun) {
  log("[DRY-RUN] No files will be written and no commits/tags/pushes/releases");
  log("[DRY-RUN] will be made. Confirmation prompt is also auto-skipped.\n");
}

// ── Side-effect helpers — short-circuit in dry-run mode ─────────────────────

const writeMut = (path, content) => {
  if (dryRun) {
    log(`[dry-run] WOULD write ${path} (${content.length} bytes)`);
    return;
  }
  writeFileSync(path, content);
};

const runMut = (cmd, opts) => {
  if (dryRun) {
    log(`[dry-run] WOULD run \`${cmd}\``);
    return "";
  }
  return run(cmd, opts);
};

// -- Pre-flight checks --------------------------------------------------------

const status = run("git status --porcelain");
if (status.length > 0) {
  if (dryRun) {
    log("Working directory is not clean (dry-run mode — proceeding anyway).");
  } else {
    die("Working directory is not clean. Commit or stash changes first.");
  }
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

// Wait for any in-progress CI runs to finish, then check result
const ciCheckCmd = "gh run list --branch main --workflow ci.yml --limit 1 --json status,conclusion --jq '.[0]'";
let ciRun = JSON.parse(run(ciCheckCmd));
if (ciRun.status !== "completed") {
  log(`CI run is ${ciRun.status}. Waiting for it to finish...`);
  while (ciRun.status !== "completed") {
    run("sleep 10");
    ciRun = JSON.parse(run(ciCheckCmd));
  }
}
if (ciRun.conclusion !== "success") {
  die(`Last CI run on main failed (conclusion: ${ciRun.conclusion}). Fix CI before releasing.`);
}

if (skipTestCi) {
  log("Skipping test:ci and publish dry run (--skip-test-ci).");
} else {
  log("Running full test matrix (native + Docker)...");
  try {
    run("pnpm run test:ci", { stdio: "inherit" });
  } catch {
    die("Test matrix failed. Fix all failures before releasing.");
  }

  log("Verifying npm publish (dry run)...");
  try {
    // Strip pnpm-injected npm_config_ env vars that npm doesn't recognise
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => !k.startsWith("npm_")),
    );
    execSync("npm publish --dry-run --ignore-scripts", { stdio: "inherit", env: cleanEnv });
  } catch {
    die("npm publish dry run failed. Fix packaging issues before releasing.");
  }
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
if (!bump) {
  newVersion = currentVersion;
  log(`\nNo version arg given — releasing v${newVersion} from package.json.`);
} else if (bump === "patch") {
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

const newTag = `v${newVersion}`;
log(bump ? `\nRelease: v${currentVersion} -> ${newTag}` : `\nRelease: ${newTag}`);

// -- Detect existing tag/release state ---------------------------------------
// A published GitHub release is the point of no return — refuse to recreate.
// A tag that exists without a release is recoverable: skip the tag step and
// proceed to publish the missing release.

let releaseExists = false;
try {
  run(`gh release view ${newTag}`);
  releaseExists = true;
} catch (e) {
  if (e.status === undefined) throw e;
}
if (releaseExists) {
  die(`GitHub release ${newTag} already exists. Refusing to recreate.`);
}

let localTagExists = false;
try {
  run(`git rev-parse --verify ${newTag}`);
  localTagExists = true;
} catch (e) {
  if (e.status === undefined) throw e;
}

const remoteTagExists = run(`git ls-remote --tags origin refs/tags/${newTag}`).length > 0;

const tagExists = localTagExists || remoteTagExists;
if (tagExists) {
  log(`Tag ${newTag} already exists (local=${localTagExists}, remote=${remoteTagExists}).`);
  log("Skipping tag creation; will publish the missing GitHub release only.");

  // Sanity check: when tag exists locally, it should point at HEAD or an
  // ancestor of HEAD. Anything else means HEAD has moved past the tag and
  // a re-tag is needed manually.
  if (localTagExists) {
    const tagSha = run(`git rev-parse ${newTag}^{commit}`);
    const headSha = run("git rev-parse HEAD");
    const isAncestor = (() => {
      try {
        run(`git merge-base --is-ancestor ${tagSha} ${headSha}`);
        return true;
      } catch (e) {
        if (e.status === undefined) throw e;
        return false;
      }
    })();
    if (!isAncestor) {
      die(
        `Tag ${newTag} (${tagSha.slice(0, 9)}) is not an ancestor of HEAD (${headSha.slice(0, 9)}). ` +
          `Refusing to release; re-tag manually if intentional.`,
      );
    }
  }
}

// -- Find previous release tag (for changelog range) -------------------------
// The changelog range is "previous tag..release commit". The release commit is
// HEAD when we're about to create the tag, or the existing tag's commit when
// the tag was already pushed by an earlier (interrupted) run.

const releaseSha = tagExists
  ? run(`git rev-parse ${newTag}^{commit}`)
  : run("git rev-parse HEAD");

// Walk back from the release commit's parent to find the closest existing tag.
let lastTag = "";
try {
  lastTag = run(`git describe --tags --abbrev=0 ${releaseSha}^ 2>/dev/null`).trim();
} catch {
  // No earlier tag — first release.
}
let hasLastTag = false;
if (lastTag) {
  try {
    run(`git rev-parse ${lastTag}`);
    hasLastTag = true;
  } catch {
    log(`Warning: tag ${lastTag} not found, using all commits on main.`);
  }
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

// Keep a Changelog categories (user-facing only)
const CHANGELOG_CATEGORIES = [
  { prefixes: ["feat"], label: "Added" },
  { prefixes: ["fix"], label: "Fixed" },
  { prefixes: ["perf"], label: "Changed" },
];

const range = hasLastTag ? `${lastTag}..${releaseSha}` : releaseSha;
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
// Use lastTag (the previous release tag) as the comparison anchor — when not
// bumping, currentVersion === newVersion so the old `v${currentVersion}...v${newVersion}`
// link compared a tag to itself.
changelog += hasLastTag
  ? `**Full Changelog**: ${repoUrl}/compare/${lastTag}...${newTag}\n`
  : `**Full Changelog**: ${repoUrl}/commits/${newTag}\n`;

// -- Generate CHANGELOG.md section (Keep a Changelog format) ------------------

const today = new Date().toISOString().slice(0, 10);
const keepSections = [];

for (const cat of CHANGELOG_CATEGORIES) {
  const matching = commits.filter((c) => {
    const msg = c.slice(c.indexOf(" ") + 1);
    return cat.prefixes.some((p) => msg.startsWith(`${p}:`) || msg.startsWith(`${p}(`));
  });
  if (matching.length === 0) continue;
  const entries = matching.map((c) => {
    const msg = c.slice(c.indexOf(" ") + 1);
    const clean = msg.replace(/^\w+(\([^)]*\))?:\s*/, "");
    return `- ${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  });
  keepSections.push(`### ${cat.label}\n${entries.join("\n")}`);
}

let changelogEntry = keepSections.length > 0
  ? `## [${newVersion}] - ${today}\n\n${keepSections.join("\n\n")}`
  : null;

log("\n--- GitHub Release Notes ---");
log(changelog);
if (changelogEntry) {
  log("--- CHANGELOG.md ---");
  log(changelogEntry);
}
log("----------------------------\n");

// -- Confirm ------------------------------------------------------------------

if (!yesFlag && !dryRun) {
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

// -- Bump version (skip if releasing the version already in package.json) ----

if (newVersion !== currentVersion) {
  log("\nBumping version...");
  pkg.version = newVersion;
  writeMut("package.json", JSON.stringify(pkg, null, 2) + "\n");

  const jsr = JSON.parse(readFileSync("jsr.json", "utf8"));
  jsr.version = newVersion;
  writeMut("jsr.json", JSON.stringify(jsr, null, 2) + "\n");
} else {
  log("\nVersion already at target — skipping package.json/jsr.json bump.");
}

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
      writeMut("README.md", updated);
      log(`Updated test badge: ${testCount} passing`);
    }
  }
} catch {
  // Non-critical: skip if test count extraction fails
}

// -- Update SECURITY.md supported version -------------------------------------

try {
  const security = readFileSync("SECURITY.md", "utf8");
  const updated = security
    .replace(/\| [\d.]+\.x \(latest\)\s*\| Yes\s*\|/, `| ${newVersion.replace(/\.\d+$/, ".x")} (latest) | Yes |`)
    .replace(/\| < [\d.]+\s*\| No\s*\|/, `| < ${newVersion.replace(/\.\d+$/, "")} | No |`);
  if (updated !== security) {
    writeMut("SECURITY.md", updated);
    log(`Updated SECURITY.md: ${newVersion.replace(/\.\d+$/, ".x")} supported`);
  }
} catch {
  // Non-critical: skip if SECURITY.md doesn't exist
}

// -- Update CHANGELOG.md ------------------------------------------------------

if (changelogEntry) {
  const changelogPath = "CHANGELOG.md";
  let content;
  try {
    content = readFileSync(changelogPath, "utf8");
  } catch {
    content = [
      "# Changelog",
      "",
      "All notable changes to this project will be documented in this file.",
      "",
      "The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).",
      "",
    ].join("\n");
  }

  // Skip if this version already has an entry (e.g. hand-written for initial release)
  if (content.includes(`## [${newVersion}]`)) {
    log("CHANGELOG.md already has an entry for this version, skipping.");
  } else {
    // Insert new section after header, before first version entry
    const firstVersion = content.indexOf("\n## [");
    if (firstVersion !== -1) {
      content = `${content.slice(0, firstVersion)}\n${changelogEntry}\n${content.slice(firstVersion)}`;
    } else {
      content = `${content.trimEnd()}\n\n${changelogEntry}\n`;
    }

    // Add comparison link at the top of the links block
    const versionLink = hasLastTag
      ? `[${newVersion}]: ${repoUrl}/compare/v${currentVersion}...v${newVersion}`
      : `[${newVersion}]: ${repoUrl}/releases/tag/v${newVersion}`;

    if (!content.includes(`[${newVersion}]:`)) {
      const firstLink = content.search(/\n\[[^\]]+\]: https?:\/\//);
      if (firstLink !== -1) {
        content = `${content.slice(0, firstLink + 1)}${versionLink}\n${content.slice(firstLink + 1)}`;
      } else {
        content = `${content.trimEnd()}\n\n${versionLink}\n`;
      }
    }

    writeMut(changelogPath, content);
    log("Updated CHANGELOG.md");
  }
}

// -- Commit, tag, push --------------------------------------------------------

runMut("git add package.json jsr.json README.md SECURITY.md CHANGELOG.md");
// Read staged status from real working tree (read-only); in dry-run we skip
// the add above so this returns "" and the commit-step also short-circuits.
const stagedChanges = dryRun ? "" : run("git diff --staged --name-only");
const canSign = !!run("git config user.signingkey || true");
const signFlag = canSign ? "--gpg-sign" : "";

if (stagedChanges.length > 0 || dryRun) {
  log("Committing release-note changes...");
  const commitMsg = `chore: bump to ${newVersion}\n\n${changelog}`;
  writeMut(".git/.release-msg.tmp", commitMsg);
  runMut(`git commit --signoff ${signFlag} --file .git/.release-msg.tmp`);
  runMut("rm -f .git/.release-msg.tmp");
} else {
  log("No file changes to commit — tagging current HEAD directly.");
}

if (!localTagExists) {
  log("Tagging...");
  runMut(canSign ? `git tag -s ${newTag} -m "${newTag}"` : `git tag ${newTag} -m "${newTag}"`);
} else {
  log(`Skipping tag creation — ${newTag} already exists locally.`);
}

log("Pushing...");
if (stagedChanges.length > 0 || dryRun) {
  runMut("git push origin HEAD:refs/heads/main");
}
if (!remoteTagExists) {
  runMut(`git push origin ${newTag}`);
} else {
  log(`Skipping tag push — ${newTag} already on origin.`);
}

// -- Create GitHub release ----------------------------------------------------

log("Creating GitHub release...");
writeMut(".git/.release-notes.tmp", changelog);
runMut(`gh release create ${newTag} --title "${newTag}" --notes-file .git/.release-notes.tmp`);
runMut("rm -f .git/.release-notes.tmp");

// -- Clean up filter-branch refs if any ---------------------------------------

if (!dryRun) {
  try {
    run("git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin");
  } catch {
    // No refs to clean
  }
}

if (dryRun) {
  log("\n[DRY-RUN] No state was changed. Re-run without --dry-run to release.");
  log(`[DRY-RUN] Would publish: ${repoUrl}/releases/tag/${newTag}`);
} else {
  log(`\nReleased ${newTag}`);
  log(`${repoUrl}/releases/tag/${newTag}`);
}
