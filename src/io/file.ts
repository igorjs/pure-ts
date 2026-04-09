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
 * Detects Deno, then QuickJS, then Node/Bun at runtime. Deno uses its native
 * async API. QuickJS uses synchronous std/os modules wrapped in Promises.
 * Node and Bun share node:fs/promises. All runtime access is structural:
 * no type declarations imported.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { Eol } from "../runtime/platform.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** File system operation failed. */
export const FileError: ErrTypeConstructor<"FileError", string> = ErrType("FileError");

// ── Task-like ───────────────────────────────────────────────────────────────

interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

// ── File stat result ────────────────────────────────────────────────────────

/** Metadata returned by File.stat. */
export interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
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

/** QuickJS std module (structural, synchronous). */
interface QjsStd {
  loadFile(path: string): string | null;
  open(
    path: string,
    flags: string,
  ): { write(buf: ArrayBuffer, offset: number, length: number): number; close(): void } | null;
  getenv(name: string): string | undefined;
}

/** QuickJS os module (structural, synchronous). */
interface QjsOs {
  stat(path: string): [obj: { mode: number; size: number; mtime: number }, err: number];
  lstat(path: string): [obj: { mode: number; size: number; mtime: number }, err: number];
  mkdir(path: string, mode?: number): number;
  remove(path: string): number;
  readdir(path: string): [names: string[], err: number];
  rename(oldPath: string, newPath: string): number;
  getcwd(): string;
}

// ── POSIX mode constants ────────────────────────────────────────────────────

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

// ── Runtime detection ───────────────────────────────────────────────────────

const getDenoFs = (): DenoFs | null => {
  const deno = (globalThis as unknown as { Deno?: DenoFs }).Deno;
  return deno?.readTextFile !== undefined ? deno : null;
};

let qjsModules: { std: QjsStd; os: QjsOs } | null | undefined;
const getQjs = (): { std: QjsStd; os: QjsOs } | null => {
  if (qjsModules !== undefined) {
    return qjsModules;
  }
  const sa = (globalThis as unknown as { scriptArgs?: unknown }).scriptArgs;
  if (sa === undefined) {
    qjsModules = null;
    return null;
  }
  try {
    const std = Function(
      'try{return globalThis[Symbol.for("qjs:std")]??require("qjs:std")}catch{try{return require("std")}catch{return null}}',
    )() as QjsStd | null;
    const os = Function(
      'try{return globalThis[Symbol.for("qjs:os")]??require("qjs:os")}catch{try{return require("os")}catch{return null}}',
    )() as QjsOs | null;
    qjsModules = std !== null && os !== null ? { std, os } : null;
  } catch {
    qjsModules = null;
  }
  return qjsModules;
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

// ── QuickJS helpers ─────────────────────────────────────────────────────────

const qjsWriteText = (std: QjsStd, path: string, content: string, flags: string): void => {
  const encoder = new TextEncoder();
  const buf = encoder.encode(content);
  const f = std.open(path, flags);
  if (f === null) {
    throw new Error(`Failed to open file: ${path}`);
  }
  try {
    f.write(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
  } finally {
    f.close();
  }
};

const qjsMakeTempDir = (qjs: { std: QjsStd; os: QjsOs }, prefix: string | undefined): string => {
  const tmp = qjs.std.getenv("TMPDIR") ?? qjs.std.getenv("TMP") ?? "/tmp";
  const name =
    (prefix ?? "pure-ts-") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const dir = `${tmp}/${name}`;
  const ret = qjs.os.mkdir(dir);
  if (ret < 0) {
    throw new Error(`mkdir failed: errno ${ret}`);
  }
  return dir;
};

const qjsMkdirRecursive = (os: QjsOs, path: string): void => {
  const sep = path.includes("/") ? "/" : "\\";
  const segments = path.split(sep).filter(s => s.length > 0);
  let current = path.startsWith(sep) ? sep : "";
  for (const segment of segments) {
    current = current.length === 0 ? segment : current + sep + segment;
    const ret = os.mkdir(current);
    // 0 = success, negative = errno. -17 (EEXIST) is fine for recursive mkdir
    if (ret < 0 && ret !== -17) {
      throw new Error(`mkdir failed for ${current}: errno ${ret}`);
    }
  }
};

const qjsRemoveDirRecursive = (qjs: { std: QjsStd; os: QjsOs }, path: string): void => {
  const [entries, err] = qjs.os.readdir(path);
  if (err !== 0) {
    throw new Error(`readdir failed for ${path}: errno ${err}`);
  }
  const sep = path.includes("/") ? "/" : "\\";
  for (const name of entries) {
    if (name === "." || name === "..") {
      continue;
    }
    const full = path + sep + name;
    const [stat, statErr] = qjs.os.stat(full);
    if (statErr !== 0) {
      continue;
    }
    if ((stat.mode & S_IFMT) === S_IFDIR) {
      qjsRemoveDirRecursive(qjs, full);
    } else {
      qjs.os.remove(full);
    }
  }
  // Remove the now-empty directory. QuickJS os.remove works for empty dirs too.
  const ret = qjs.os.remove(path);
  if (ret < 0) {
    throw new Error(`remove failed for ${path}: errno ${ret}`);
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const content = qjs.std.loadFile(path);
      if (content === null) {
        return Err(FileError(`File not found: ${path}`, { path }));
      }
      return Ok(Eol.normalize(content));
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      qjsWriteText(qjs.std, path, content, "w");
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      qjsWriteText(qjs.std, path, content, "a");
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const [stat, err] = qjs.os.stat(path);
      if (err !== 0) {
        return Ok(false);
      }
      return Ok((stat.mode & S_IFMT) === S_IFREG);
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      qjsMkdirRecursive(qjs.os, path);
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const ret = qjs.os.remove(path);
      if (ret < 0) {
        return Err(FileError(`remove failed: errno ${ret}`, { path }));
      }
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      qjsRemoveDirRecursive(qjs, path);
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const [names, err] = qjs.os.readdir(path);
      if (err !== 0) {
        return Err(FileError(`readdir failed: errno ${err}`, { path }));
      }
      return Ok(names.filter(n => n !== "." && n !== ".."));
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const [stat, err] = qjs.os.stat(path);
      if (err !== 0) {
        return Err(FileError(`stat failed: errno ${err}`, { path }));
      }
      return Ok({
        isFile: (stat.mode & S_IFMT) === S_IFREG,
        isDirectory: (stat.mode & S_IFMT) === S_IFDIR,
        size: stat.size,
        mtime: new Date(stat.mtime * 1000),
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      // QuickJS has no native copy; read then write
      const content = qjs.std.loadFile(src);
      if (content === null) {
        return Err(FileError(`File not found: ${src}`, { src, dest }));
      }
      qjsWriteText(qjs.std, dest, content, "w");
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      const ret = qjs.os.rename(oldPath, newPath);
      if (ret < 0) {
        return Err(FileError(`rename failed: errno ${ret}`, { oldPath, newPath }));
      }
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
  const qjs = getQjs();
  if (qjs !== null) {
    try {
      return Ok(qjsMakeTempDir(qjs, prefix));
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
 * Multi-runtime: detects Deno, QuickJS, then Node/Bun (node:fs/promises).
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
  readonly read: (path: string) => TaskLike<string, ErrType<"FileError">>;
  readonly write: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  readonly append: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  readonly exists: (path: string) => TaskLike<boolean, ErrType<"FileError">>;
  readonly makeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  readonly remove: (path: string) => TaskLike<void, ErrType<"FileError">>;
  readonly removeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  readonly list: (path: string) => TaskLike<readonly string[], ErrType<"FileError">>;
  readonly stat: (path: string) => TaskLike<FileStat, ErrType<"FileError">>;
  readonly copy: (src: string, dest: string) => TaskLike<void, ErrType<"FileError">>;
  readonly rename: (oldPath: string, newPath: string) => TaskLike<void, ErrType<"FileError">>;
  readonly tempDir: (prefix?: string) => TaskLike<string, ErrType<"FileError">>;
} = {
  read: path => mkTask(() => readFile(path)),
  write: (path, content) => mkTask(() => writeFile(path, content)),
  append: (path, content) => mkTask(() => appendFile(path, content)),
  exists: path => mkTask(() => fileExists(path)),
  makeDir: path => mkTask(() => makeDir(path)),
  remove: path => mkTask(() => removeFile(path)),
  removeDir: path => mkTask(() => removeDir(path)),
  list: path => mkTask(() => listDir(path)),
  stat: path => mkTask(() => statFile(path)),
  copy: (src, dest) => mkTask(() => copyFile(src, dest)),
  rename: (oldPath, newPath) => mkTask(() => renameFile(oldPath, newPath)),
  tempDir: prefix => mkTask(() => tempDir(prefix)),
};
