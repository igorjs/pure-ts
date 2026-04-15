/**
 * @module runtime/platform
 *
 * Runtime platform detection and OS-aware constants.
 *
 * **Why detect at runtime instead of importing node:os?**
 * Importing `node:os` or `node:path` binds the module to Node.js. This
 * module detects the platform from `globalThis.process.platform` (Node/Bun)
 * or `globalThis.Deno.build.os` (Deno), falling back to POSIX defaults
 * for unknown runtimes (browsers, Cloudflare Workers). All access is
 * structural: no `node:` imports, no type declarations.
 */

// ── Detection ───────────────────────────────────────────────────────────────

/** @internal Identifier for the detected platform family. */
export type PlatformId = "windows" | "posix";

/**
 * Detect the current platform from available globals.
 * Checks Node/Bun first (process.platform), then Deno (Deno.build.os),
 * defaults to POSIX for browsers and edge runtimes.
 */
const detectPlatform = (): PlatformId => {
  const proc = (globalThis as unknown as { process?: { platform?: string } }).process;
  if (proc?.platform === "win32") return "windows";

  const deno = (globalThis as unknown as { Deno?: { build?: { os?: string } } }).Deno;
  if (deno?.build?.os === "windows") return "windows";

  return "posix";
};

const PLATFORM: PlatformId = detectPlatform();

// ── EOL ─────────────────────────────────────────────────────────────────────

/**
 * Line ending constants and normalization.
 *
 * @example
 * ```ts
 * Eol.native            // '\r\n' on Windows, '\n' elsewhere
 * Eol.normalize(text)   // replace all \r\n with \n
 * Eol.split(text)       // split on \r\n or \n
 * ```
 */
export const Eol: {
  /** Line feed (Unix, macOS, Linux). */
  readonly lf: "\n";
  /** Carriage return + line feed (Windows). */
  readonly crlf: "\r\n";
  /** The native line ending for the current platform. */
  readonly native: string;
  /** Normalize all line endings to \n. */
  readonly normalize: (text: string) => string;
  /** Split text into lines, handling both \r\n and \n. */
  readonly split: (text: string) => readonly string[];
} = {
  lf: "\n",
  crlf: "\r\n",
  native: PLATFORM === "windows" ? "\r\n" : "\n",
  normalize: (text: string): string => text.replace(/\r\n/g, "\n"),
  split: (text: string): readonly string[] => text.split(/\r?\n/),
};

// ── Path ────────────────────────────────────────────────────────────────────

const POSIX_SEP = "/";
const WIN_SEP = "\\";

/**
 * OS-aware path operations without node:path dependency.
 *
 * Handles separator differences between Windows and POSIX.
 * All operations accept both `/` and `\` as input separators
 * and output the native separator.
 *
 * @example
 * ```ts
 * Path.join('src', 'core', 'result.ts')  // 'src/core/result.ts' (POSIX)
 *                                        // 'src\\core\\result.ts' (Windows)
 * Path.normalize('src\\core//result.ts') // 'src/core/result.ts' (POSIX)
 * Path.basename('/home/user/file.ts')    // 'file.ts'
 * Path.dirname('/home/user/file.ts')     // '/home/user'
 * Path.extname('file.test.ts')           // '.ts'
 * ```
 */
/** Parsed path components. */
export interface PathParts {
  /** Root portion (e.g. '/' or 'C:\\'). Empty string for relative paths. */
  readonly root: string;
  /** Directory portion (excludes the base name). */
  readonly dir: string;
  /** Full file name including extension. */
  readonly base: string;
  /** File extension including the leading dot. */
  readonly ext: string;
  /** File name without extension. */
  readonly name: string;
}

/** OS-aware path operations without node:path dependency. */
export const Path: {
  /** The native path separator for the current platform. */
  readonly separator: string;
  /** Join path segments using the native separator. */
  readonly join: (...segments: readonly string[]) => string;
  /** Normalize separators and remove redundant slashes. */
  readonly normalize: (path: string) => string;
  /** Extract the file name from a path (last segment). */
  readonly basename: (path: string) => string;
  /** Extract the directory portion of a path. */
  readonly dirname: (path: string) => string;
  /** Extract the file extension (including the dot). */
  readonly extname: (path: string) => string;
  /** Convert all separators to forward slash. Useful for URLs and cross-platform storage. */
  readonly toPosix: (path: string) => string;
  /** Check whether a path is absolute. */
  readonly isAbsolute: (path: string) => boolean;
  /** Decompose a path into root, dir, base, ext, and name. */
  readonly parse: (path: string) => PathParts;
  /** Resolve a sequence of path segments into a normalized absolute path. */
  readonly resolve: (...segments: readonly string[]) => string;
  /** Compute the relative path from `from` to `to`. */
  readonly relative: (from: string, to: string) => string;
} = {
  separator: PLATFORM === "windows" ? WIN_SEP : POSIX_SEP,

  join: (...segments: readonly string[]): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;
    const joined = segments.filter(s => s.length > 0).join(sep);
    return normalizeSlashes(joined, sep);
  },

  normalize: (path: string): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;
    return normalizeSlashes(path, sep);
  },

  basename: (path: string): string => {
    const normalized = toForwardSlash(path);
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  },

  dirname: (path: string): string => {
    const normalized = toForwardSlash(path);
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash === -1) return ".";
    if (lastSlash === 0) return "/";
    const dir = normalized.slice(0, lastSlash);
    return PLATFORM === "windows" ? dir.replace(/\//g, WIN_SEP) : dir;
  },

  extname: (path: string): string => {
    const base = Path.basename(path);
    const lastDot = base.lastIndexOf(".");
    if (lastDot <= 0) return "";
    return base.slice(lastDot);
  },

  toPosix: (path: string): string => toForwardSlash(path),

  isAbsolute: (path: string): boolean => {
    if (path.startsWith("/")) return true;
    // Windows absolute: C:\ or C:/ or \\server
    if (PLATFORM === "windows") {
      if (/^[A-Za-z]:[/\\]/.test(path)) return true;
      if (path.startsWith("\\\\")) return true;
    }
    return false;
  },

  parse: (path: string): PathParts => {
    const base = Path.basename(path);
    const dir = Path.dirname(path);
    const ext = Path.extname(path);
    const name = ext.length > 0 ? base.slice(0, base.length - ext.length) : base;

    // Extract root: '/' for POSIX absolute, 'C:\\' for Windows, '' for relative
    let root = "";
    const fwd = toForwardSlash(path);
    if (fwd.startsWith("/")) {
      root = PLATFORM === "windows" ? WIN_SEP : "/";
    } else if (PLATFORM === "windows" && /^[A-Za-z]:[/\\]/.test(path)) {
      root = `${path.slice(0, 2)}${WIN_SEP}`;
    }

    return { root, dir, base, ext, name };
  },

  resolve: (...segments: readonly string[]): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;

    // Build from right to left: the first absolute segment stops accumulation
    let resolved = "";
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i]!;
      if (segment.length === 0) continue;
      resolved = resolved.length === 0 ? segment : `${segment}/${resolved}`;
      if (Path.isAbsolute(segment)) break;
    }

    // If still relative, prepend cwd from the runtime
    if (!Path.isAbsolute(resolved)) {
      const proc = (globalThis as unknown as { process?: { cwd(): string } }).process;
      const deno = (globalThis as unknown as { Deno?: { cwd(): string } }).Deno;
      const cwd = proc?.cwd?.() ?? deno?.cwd?.() ?? "/";
      resolved = `${cwd}/${resolved}`;
    }

    return resolveDotSegments(normalizeSlashes(resolved, sep), sep);
  },

  relative: (from: string, to: string): string => {
    const sep = PLATFORM === "windows" ? WIN_SEP : POSIX_SEP;

    // Normalize both paths to forward slash and resolve dot segments
    const normFrom = splitSegments(resolveDotSegments(normalizeSlashes(from, "/"), "/"));
    const normTo = splitSegments(resolveDotSegments(normalizeSlashes(to, "/"), "/"));

    // Find common prefix length
    let common = 0;
    const maxLen = Math.min(normFrom.length, normTo.length);
    while (common < maxLen && normFrom[common] === normTo[common]) {
      common += 1;
    }

    // Build relative path: "../" for each remaining segment in `from`,
    // then append remaining segments from `to`
    const ups = normFrom.length - common;
    const parts: string[] = [];
    for (let i = 0; i < ups; i++) {
      parts.push("..");
    }
    for (let i = common; i < normTo.length; i++) {
      parts.push(normTo[i]!);
    }

    const result = parts.join(sep);
    return result.length === 0 ? "." : result;
  },
};

// ── Internal helpers ────────────────────────────────────────────────────────

/** Replace all backslashes with forward slashes. */
const toForwardSlash = (path: string): string => path.replace(/\\/g, "/");

/** Normalize a path: unify separators, collapse runs, remove trailing. */
const normalizeSlashes = (path: string, sep: string): string => {
  // Unify both separators to forward slash for processing
  let result = toForwardSlash(path);
  // Collapse multiple consecutive slashes
  result = result.replace(/\/+/g, "/");
  // Remove trailing slash (unless root)
  if (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  // Convert to native separator
  if (sep === WIN_SEP) {
    result = result.replace(/\//g, WIN_SEP);
  }
  return result;
};

/** Process a single path segment during dot-segment resolution. */
const processDotSegment = (seg: string, resolved: string[], isAbs: boolean): void => {
  if (seg === ".") return;
  if (seg === "..") {
    const canPop = resolved.length > 0 && resolved[resolved.length - 1] !== "..";
    if (canPop) resolved.pop();
    else if (!isAbs) resolved.push("..");
    return;
  }
  resolved.push(seg);
};

/** Format resolved segments into a path string with the given separator. */
const formatResolved = (segments: readonly string[], sep: string, isAbs: boolean): string => {
  const joined = segments.join(sep);
  if (isAbs) {
    const root = sep === WIN_SEP ? WIN_SEP : "/";
    return joined.length === 0 ? root : `${root}${joined}`;
  }
  return joined.length === 0 ? "." : joined;
};

/** Resolve `.` and `..` segments in a normalized path. */
const resolveDotSegments = (path: string, sep: string): string => {
  const fwd = toForwardSlash(path);
  const isAbs = fwd.startsWith("/");
  const segments = fwd.split("/").filter(s => s.length > 0);
  const resolved: string[] = [];
  for (const seg of segments) processDotSegment(seg, resolved, isAbs);
  return formatResolved(resolved, sep, isAbs);
};

/** Split a normalized path into non-empty segments (using forward slashes). */
const splitSegments = (path: string): readonly string[] =>
  toForwardSlash(path)
    .split("/")
    .filter(s => s.length > 0);

// ── Platform info ───────────────────────────────────────────────────────────

/**
 * Platform detection utilities.
 *
 * @example
 * ```ts
 * Platform.os       // 'windows' | 'posix'
 * Platform.isWindows // true on Windows
 * ```
 */
export const Platform: {
  /** The detected platform family. */
  readonly os: PlatformId;
  /** Whether the current platform is Windows. */
  readonly isWindows: boolean;
} = {
  os: PLATFORM,
  isWindows: PLATFORM === "windows",
};
