/**
 * @module io/file
 *
 * Type-safe file system operations that return Task instead of throwing.
 *
 * **Why wrap file I/O?**
 * Every runtime's file API throws on missing files, permission errors, and
 * invalid paths. Wrapping in Task makes failures values, not exceptions.
 *
 * **Multi-runtime strategy:**
 * Detects Deno, then Node/Bun at runtime. Deno uses its native async API
 * (Deno.readTextFile, etc.). Node and Bun share node:fs/promises (Bun
 * implements it natively). All runtime access is structural: no type
 * declarations imported.
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { Eol } from "../runtime/platform.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** File system operation failed. */
export const FileError: ErrTypeConstructor<"FileError", string> = ErrType("FileError");

// ── File stat result ────────────────────────────────────────────────────────

/** Metadata returned by File.stat. */
export interface FileStat {
  /** Whether the path points to a regular file. */
  readonly isFile: boolean;
  /** Whether the path points to a directory. */
  readonly isDirectory: boolean;
  /** File size in bytes. */
  readonly size: number;
  /** Last modification time, if available. */
  readonly mtime: Date | undefined;
}

// ── Error helper ────────────────────────────────────────────────────────────

const fileErr = (e: unknown, meta?: Record<string, unknown>): ErrType<"FileError", string> =>
  FileError(e instanceof Error ? e.message : String(e), meta);

const NO_FS = "File system is not available in this runtime";

// ── Structural types for runtime APIs ───────────────────────────────────────

/** Deno file system API (structural, no @deno/types). */
interface DenoFs {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, data: string, options?: { append?: boolean }): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  stat(path: string): Promise<{
    isFile: boolean;
    isDirectory: boolean;
    size: number;
    mtime: Date | null;
  }>;
  remove(path: string, options?: { recursive?: boolean }): Promise<void>;
  readDir(path: string): AsyncIterable<{ name: string }>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  makeTempDir(options?: { prefix?: string }): Promise<string>;
}

/** Node fs/promises API (structural, no @types/node). */
interface NodeFs {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
  appendFile(path: string, data: string, encoding: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  stat(path: string): Promise<{
    isFile(): boolean;
    isDirectory(): boolean;
    size: number;
    mtime: Date;
  }>;
  unlink(path: string): Promise<void>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
}

// ── Runtime detection ───────────────────────────────────────────────────────

const getDenoFs = (): DenoFs | null => {
  const deno = (globalThis as unknown as { Deno?: DenoFs }).Deno;
  return deno?.readTextFile !== undefined ? deno : null;
};

let nodeFs: NodeFs | null | undefined;
const getNodeFs = async (): Promise<NodeFs | null> => {
  if (nodeFs !== undefined) {
    return nodeFs;
  }
  try {
    nodeFs = await (Function('return import("node:fs/promises")')() as Promise<NodeFs>);
    return nodeFs;
  } catch {
    nodeFs = null;
    return null;
  }
};

// ── Unified operations ──────────────────────────────────────────────────────

const readFile = async (path: string): Promise<Result<string, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      return Ok(Eol.normalize(await deno.readTextFile(path)));
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      return Ok(Eol.normalize(await node.readFile(path, "utf-8")));
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const writeFile = async (
  path: string,
  content: string,
): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.writeTextFile(path, content);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.writeFile(path, content, "utf-8");
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const appendFile = async (
  path: string,
  content: string,
): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.writeTextFile(path, content, { append: true });
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.appendFile(path, content, "utf-8");
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const fileExists = async (path: string): Promise<Result<boolean, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      const s = await deno.stat(path);
      return Ok(s.isFile);
    } catch {
      return Ok(false);
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      const s = await node.stat(path);
      return Ok(s.isFile());
    } catch {
      return Ok(false);
    }
  }
  return Err(FileError(NO_FS));
};

const makeDir = async (path: string): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.mkdir(path, { recursive: true });
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.mkdir(path, { recursive: true });
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const removeFile = async (path: string): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.remove(path);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.unlink(path);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const removeDir = async (path: string): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.remove(path, { recursive: true });
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.rm(path, { recursive: true, force: true });
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const listDir = async (path: string): Promise<Result<readonly string[], ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      const entries: string[] = [];
      for await (const entry of deno.readDir(path)) {
        entries.push(entry.name);
      }
      return Ok(entries);
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      return Ok(await node.readdir(path));
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const statFile = async (path: string): Promise<Result<FileStat, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      const s = await deno.stat(path);
      return Ok({
        isFile: s.isFile,
        isDirectory: s.isDirectory,
        size: s.size,
        mtime: s.mtime ?? undefined,
      });
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      const s = await node.stat(path);
      return Ok({
        isFile: s.isFile(),
        isDirectory: s.isDirectory(),
        size: s.size,
        mtime: s.mtime,
      });
    } catch (e) {
      return Err(fileErr(e, { path }));
    }
  }
  return Err(FileError(NO_FS));
};

const copyFile = async (src: string, dest: string): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.copyFile(src, dest);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { src, dest }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.copyFile(src, dest);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { src, dest }));
    }
  }
  return Err(FileError(NO_FS));
};

const renameFile = async (
  oldPath: string,
  newPath: string,
): Promise<Result<void, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      await deno.rename(oldPath, newPath);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { oldPath, newPath }));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      await node.rename(oldPath, newPath);
      return Ok(undefined);
    } catch (e) {
      return Err(fileErr(e, { oldPath, newPath }));
    }
  }
  return Err(FileError(NO_FS));
};

const tempDir = async (prefix?: string): Promise<Result<string, ErrType<"FileError">>> => {
  const deno = getDenoFs();
  if (deno !== null) {
    try {
      const opts: { prefix?: string } = {};
      if (prefix !== undefined) {
        opts.prefix = prefix;
      }
      return Ok(await deno.makeTempDir(opts));
    } catch (e) {
      return Err(fileErr(e));
    }
  }
  const node = await getNodeFs();
  if (node !== null) {
    try {
      return Ok(await node.mkdtemp(prefix ?? "pure-ts-"));
    } catch (e) {
      return Err(fileErr(e));
    }
  }
  return Err(FileError(NO_FS));
};

// ── File ────────────────────────────────────────────────────────────────────

/**
 * Type-safe file system operations that return Task instead of throwing.
 *
 * Multi-runtime: detects Deno (native API), then Node/Bun (node:fs/promises).
 * Gracefully returns Err in runtimes without filesystem (Workers, browsers).
 *
 * @example
 * ```ts
 * const content = await File.read('./config.json').run();
 * // Result<string, ErrType<'FileError'>>
 *
 * await File.write('./output.json', '{"ok":true}').run();
 * ```
 */
export const File: {
  /** Read a text file as a UTF-8 string. */
  readonly read: (path: string) => TaskLike<string, ErrType<"FileError">>;
  /** Write a string to a file, creating or overwriting it. */
  readonly write: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Append a string to a file. */
  readonly append: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Check whether a file exists. */
  readonly exists: (path: string) => TaskLike<boolean, ErrType<"FileError">>;
  /** Create a directory recursively. */
  readonly makeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Remove a file. */
  readonly remove: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Remove a directory recursively. */
  readonly removeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** List entries in a directory. */
  readonly list: (path: string) => TaskLike<readonly string[], ErrType<"FileError">>;
  /** Get file or directory metadata. */
  readonly stat: (path: string) => TaskLike<FileStat, ErrType<"FileError">>;
  /** Copy a file from src to dest. */
  readonly copy: (src: string, dest: string) => TaskLike<void, ErrType<"FileError">>;
  /** Rename or move a file. */
  readonly rename: (oldPath: string, newPath: string) => TaskLike<void, ErrType<"FileError">>;
  /** Create a temporary directory with optional prefix. */
  readonly tempDir: (prefix?: string) => TaskLike<string, ErrType<"FileError">>;
} = {
  read: path => makeTask(() => readFile(path)),
  write: (path, content) => makeTask(() => writeFile(path, content)),
  append: (path, content) => makeTask(() => appendFile(path, content)),
  exists: path => makeTask(() => fileExists(path)),
  makeDir: path => makeTask(() => makeDir(path)),
  remove: path => makeTask(() => removeFile(path)),
  removeDir: path => makeTask(() => removeDir(path)),
  list: path => makeTask(() => listDir(path)),
  stat: path => makeTask(() => statFile(path)),
  copy: (src, dest) => makeTask(() => copyFile(src, dest)),
  rename: (oldPath, newPath) => makeTask(() => renameFile(oldPath, newPath)),
  tempDir: prefix => makeTask(() => tempDir(prefix)),
};
