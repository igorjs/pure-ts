/**
 * @module io/file
 *
 * Type-safe file system operations that return Task instead of throwing.
 *
 * **Why wrap fs/promises?**
 * Node's file system API throws on missing files, permission errors, and
 * invalid paths. Wrapping in Task makes failures values, not exceptions.
 * Dynamic import keeps the module compilable without Node.js types, so
 * the same source works across runtimes (Node, Deno, Bun).
 */

import type { Result } from "../core/result.js";
import { castErr, Err, Ok } from "../core/result.js";
import { Eol } from "../runtime/platform.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** File system operation failed. */
export const FileError: ErrTypeConstructor<"FileError", string> = ErrType("FileError");

// ── Task-like ───────────────────────────────────────────────────────────────

/** Task-like interface. */
interface TaskLike<T, E> {
  readonly run: () => Promise<Result<T, E>>;
}

const mkTask = <T, E>(run: () => Promise<Result<T, E>>): TaskLike<T, E> => ({ run });

// ── File stat result ────────────────────────────────────────────────────────

/** Metadata returned by File.stat. */
interface FileStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
}

// ── Structural type for fs/promises ─────────────────────────────────────────

/** Structural type for the fs/promises module. */
interface FsPromises {
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, data: string, encoding: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<string | undefined>;
  stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  mkdtemp(prefix: string): Promise<string>;
}

/** Lazy-load fs/promises to stay runtime-agnostic. */
const getFsPromises = async (): Promise<Result<FsPromises, ErrType<"FileError">>> => {
  try {
    // Dynamic import avoids bundling node:fs for non-Node runtimes
    const fs: FsPromises = await (Function(
      'return import("node:fs/promises")',
    )() as Promise<FsPromises>);
    return Ok(fs);
  } catch {
    return Err(FileError("File system is not available in this runtime"));
  }
};

// ── File ────────────────────────────────────────────────────────────────────

/**
 * Type-safe file system operations that return Task instead of throwing.
 *
 * Uses dynamic import for `node:fs/promises` so the module compiles
 * without Node.js types. Operations return `Task` (lazy, composable).
 *
 * @example
 * ```ts
 * const content = await File.read('./config.json').run();
 * // Result<string, ErrType<'FileError'>>
 *
 * const parsed = content.flatMap(text => Json.parse(text));
 *
 * await File.write('./output.json', '{"ok":true}').run();
 * ```
 */
export const File: {
  /** Read a file as UTF-8 text. */
  readonly read: (path: string) => TaskLike<string, ErrType<"FileError">>;
  /** Write UTF-8 text to a file (creates or overwrites). */
  readonly write: (path: string, content: string) => TaskLike<void, ErrType<"FileError">>;
  /** Check if a path exists and is a file. */
  readonly exists: (path: string) => TaskLike<boolean, ErrType<"FileError">>;
  /** Create a directory recursively. */
  readonly makeDir: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** Delete a file. */
  readonly remove: (path: string) => TaskLike<void, ErrType<"FileError">>;
  /** List entries in a directory. */
  readonly list: (path: string) => TaskLike<readonly string[], ErrType<"FileError">>;
  /** Get file or directory metadata (isFile, isDirectory, size). */
  readonly stat: (path: string) => TaskLike<FileStat, ErrType<"FileError">>;
  /** Copy a file from src to dest. */
  readonly copy: (src: string, dest: string) => TaskLike<void, ErrType<"FileError">>;
  /** Rename (move) a file or directory. */
  readonly rename: (oldPath: string, newPath: string) => TaskLike<void, ErrType<"FileError">>;
  /** Create a temporary directory with an optional prefix. Returns the absolute path. */
  readonly tempDir: (prefix?: string) => TaskLike<string, ErrType<"FileError">>;
} = {
  read: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        // Normalize \r\n to \n so downstream code doesn't need to handle both.
        const raw = await fsResult.value.readFile(path, "utf-8");
        return Ok(Eol.normalize(raw));
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  write: (path: string, content: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.writeFile(path, content, "utf-8");
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  exists: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        const s = await fsResult.value.stat(path);
        return Ok(s.isFile());
      } catch {
        return Ok(false);
      }
    }),

  makeDir: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.mkdir(path, { recursive: true });
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  remove: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.unlink(path);
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  list: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        return Ok(await fsResult.value.readdir(path));
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  stat: (path: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        const s = await fsResult.value.stat(path);
        return Ok({
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
          size: s.size,
        });
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { path }));
      }
    }),

  copy: (src: string, dest: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.copyFile(src, dest);
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { src, dest }));
      }
    }),

  rename: (oldPath: string, newPath: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        await fsResult.value.rename(oldPath, newPath);
        return Ok(undefined);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e), { oldPath, newPath }));
      }
    }),

  tempDir: (prefix?: string) =>
    mkTask(async () => {
      const fsResult = await getFsPromises();
      if (fsResult.isErr) return castErr(fsResult);
      try {
        const dir = await fsResult.value.mkdtemp(prefix ?? "pure-ts-");
        return Ok(dir);
      } catch (e) {
        return Err(FileError(e instanceof Error ? e.message : String(e)));
      }
    }),
};
