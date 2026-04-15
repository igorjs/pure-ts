/**
 * @module io/subprocess
 *
 * Cross-runtime subprocess execution returning Task instead of throwing.
 *
 * **Why wrap child_process / Deno.Command / Bun.spawn?**
 * Each runtime has its own subprocess API with different shapes, error
 * semantics, and output types. This module detects the runtime via
 * globalThis and dispatches to the correct API, returning a unified
 * CommandResult wrapped in TaskLike. Non-zero exit codes are not errors:
 * only spawn failures (command not found, timeout, permission denied)
 * produce Err(CommandError).
 *
 */

import { makeTask, type TaskLike } from "../async/task-like.js";
import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// -- Error types -------------------------------------------------------------

/** Subprocess execution failed (command not found, timeout, spawn error). */
export const CommandError: ErrTypeConstructor<"CommandError", string> = ErrType("CommandError");

// -- Command result ----------------------------------------------------------

/** Output of a subprocess execution. */
export interface CommandResult {
  /** The process exit code. */
  readonly exitCode: number;
  /** Captured standard output. */
  readonly stdout: string;
  /** Captured standard error. */
  readonly stderr: string;
}

// -- Command options ---------------------------------------------------------

/** Options for subprocess execution. */
export interface CommandOptions {
  /** Working directory for the subprocess. */
  readonly cwd?: string | undefined;
  /** Environment variables to pass to the subprocess. */
  readonly env?: Record<string, string> | undefined;
  /** Timeout in milliseconds before killing the subprocess. */
  readonly timeout?: number | undefined;
  /** String data to write to the subprocess stdin. */
  readonly stdin?: string | undefined;
}

// -- Structural types for runtime APIs ---------------------------------------

/** Structural type for Deno.Command output. */
interface DenoCommandOutput {
  readonly code: number;
  readonly stdout: Uint8Array;
  readonly stderr: Uint8Array;
}

/** Structural type for a spawned Deno child process. */
interface DenoChild {
  readonly stdin: WritableStream<Uint8Array>;
  output(): Promise<DenoCommandOutput>;
  kill(signal?: string): void;
}

/** Structural type for Deno.Command constructor. */
interface DenoCommandCtor {
  new (
    cmd: string,
    opts?: {
      args?: readonly string[];
      cwd?: string;
      env?: Record<string, string>;
      stdin?: "piped" | "null";
      stdout?: "piped";
      stderr?: "piped";
    },
  ): { output(): Promise<DenoCommandOutput>; spawn(): DenoChild };
}

/** Structural type for Bun.spawnSync result. */
interface BunSpawnSyncResult {
  readonly exitCode: number;
  readonly stdout: { toString(): string };
  readonly stderr: { toString(): string };
}

/** Structural type for a spawned Bun child process. */
interface BunChild {
  readonly stdout: ReadableStream<Uint8Array>;
  readonly stderr: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  kill(): void;
}

/** Structural type for the node:child_process module. */
interface NodeChildProcess {
  execFile(
    cmd: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string>; timeout?: number },
    callback: (error: Error | null, stdout: string, stderr: string) => void,
  ): void;
  spawn(
    cmd: string,
    args: readonly string[],
    options: { cwd?: string; env?: Record<string, string> },
  ): NodeChild;
}

/** Structural type for a spawned Node child process. */
interface NodeChild {
  readonly stdin: { write(data: string, encoding?: string): boolean; end(): void } | null;
  readonly stdout: NodeReadable | null;
  readonly stderr: NodeReadable | null;
  on(event: "close", cb: (code: number | null) => void): NodeChild;
  on(event: "error", cb: (err: Error) => void): NodeChild;
  kill(): boolean;
}

/** Structural type for a Node readable stream. */
interface NodeReadable {
  on(event: "data", cb: (chunk: { toString(): string }) => void): NodeReadable;
}

// -- Runtime detection -------------------------------------------------------

/** Structural type for Deno global with Command constructor. */
interface DenoGlobal {
  Command: DenoCommandCtor;
}

/** Structural type for Bun global with spawnSync and spawn. */
interface BunGlobal {
  spawnSync(
    cmd: readonly string[],
    opts?: { cwd?: string; env?: Record<string, string> },
  ): BunSpawnSyncResult;
  spawn(
    cmd: readonly string[],
    opts?: { cwd?: string; env?: Record<string, string>; stdin?: { readonly size: number } },
  ): BunChild;
}

// -- Helpers -----------------------------------------------------------------

/**
 * Build a Deno/Bun spawn options object, omitting undefined properties.
 * Required by exactOptionalPropertyTypes: passing `cwd: undefined` is
 * not assignable to `cwd?: string`.
 */
const buildSpawnOpts = (
  options: CommandOptions,
): { cwd?: string; env?: Record<string, string> } => {
  const result: { cwd?: string; env?: Record<string, string> } = {};
  if (options.cwd !== undefined) result.cwd = options.cwd;
  if (options.env !== undefined) result.env = options.env;
  return result;
};

// -- Timeout helper ----------------------------------------------------------

/**
 * Race a promise against a timeout. On timeout, calls cleanup (to kill the
 * process) and returns a timeout error. The timer is cleared if the promise
 * settles first, so no resources leak.
 */
const raceTimeout = <T>(
  promise: Promise<T>,
  ms: number | undefined,
  cleanup: () => void,
): Promise<T> => {
  if (ms === undefined) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Command timed out after ${ms}ms`));
    }, ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
};

// -- Execution strategies ----------------------------------------------------

const execDeno = (
  denoCommand: DenoCommandCtor,
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  makeTask(async () => {
    try {
      const spawnOpts = buildSpawnOpts(options);
      const decoder = new TextDecoder();

      if (options.stdin !== undefined) {
        // stdin requires spawn() for pipe access
        const proc = new denoCommand(cmd, {
          args,
          stdin: "piped",
          stdout: "piped",
          stderr: "piped",
          ...spawnOpts,
        });
        const child = proc.spawn();
        const writer = child.stdin.getWriter();
        await writer.write(new TextEncoder().encode(options.stdin));
        await writer.close();
        const output = await raceTimeout(child.output(), options.timeout, () => {
          try {
            child.kill();
          } catch {
            /* already dead */
          }
        });
        return Ok({
          exitCode: output.code,
          stdout: decoder.decode(output.stdout),
          stderr: decoder.decode(output.stderr),
        });
      }

      // No stdin: use output() directly
      const proc = new denoCommand(cmd, { args, ...spawnOpts });
      if (options.timeout !== undefined) {
        const child = proc.spawn();
        const output = await raceTimeout(child.output(), options.timeout, () => {
          try {
            child.kill();
          } catch {
            /* already dead */
          }
        });
        return Ok({
          exitCode: output.code,
          stdout: decoder.decode(output.stdout),
          stderr: decoder.decode(output.stderr),
        });
      }
      const output = await proc.output();
      return Ok({
        exitCode: output.code,
        stdout: decoder.decode(output.stdout),
        stderr: decoder.decode(output.stderr),
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

const execBun = (
  bun: BunGlobal,
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  makeTask(async () => {
    try {
      const spawnOpts = buildSpawnOpts(options);

      // Use async spawn when stdin or timeout is needed
      if (options.stdin !== undefined || options.timeout !== undefined) {
        const asyncOpts: {
          cwd?: string;
          env?: Record<string, string>;
          stdin?: { readonly size: number };
        } = spawnOpts;
        if (options.stdin !== undefined) {
          // Blob is a web standard global available in Node 18+, Deno, and Bun.
          // Constructed at runtime to avoid requiring DOM lib types.
          const BlobCtor = (
            globalThis as unknown as {
              Blob: new (parts: readonly string[]) => { readonly size: number };
            }
          ).Blob;
          asyncOpts.stdin = new BlobCtor([options.stdin]);
        }
        const child = bun.spawn([cmd, ...args], asyncOpts);
        const [exitCode, stdout, stderr] = await raceTimeout(
          Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]),
          options.timeout,
          () => {
            try {
              child.kill();
            } catch {
              /* already dead */
            }
          },
        );
        return Ok({ exitCode, stdout, stderr });
      }

      // Simple path: no stdin, no timeout
      const result = bun.spawnSync([cmd, ...args], spawnOpts);
      return Ok({
        exitCode: result.exitCode,
        stdout: result.stdout.toString(),
        stderr: result.stderr.toString(),
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

/** Resolve a Node execFile callback into a Result, detecting timeout via killed flag. */
const resolveNodeExecResult = (
  error: Error | null,
  stdout: string,
  stderr: string,
  cmd: string,
  args: readonly string[],
  timeout: number | undefined,
): Result<CommandResult, ErrType<"CommandError">> => {
  if (error === null) {
    return Ok({ exitCode: 0, stdout, stderr });
  }
  const killed = (error as unknown as { killed?: boolean }).killed;
  if (killed === true && timeout !== undefined) {
    return Err(CommandError(`Command timed out after ${timeout}ms`, { cmd, args }));
  }
  const exitCode = (error as unknown as { code?: number | string }).code;
  if (typeof exitCode === "number") {
    return Ok({ exitCode, stdout, stderr });
  }
  return Err(CommandError(error.message, { cmd, args, code: exitCode }));
};

const execNode = (
  cmd: string,
  args: readonly string[],
  options: CommandOptions,
): TaskLike<CommandResult, ErrType<"CommandError">> =>
  makeTask(async () => {
    try {
      const cp: NodeChildProcess = await (Function(
        'return import("node:child_process")',
      )() as Promise<NodeChildProcess>);

      // Use spawn when stdin is provided (execFile has no stdin pipe)
      if (options.stdin !== undefined) {
        const stdinData = options.stdin;
        const nodeOpts = buildSpawnOpts(options);
        return await new Promise<Result<CommandResult, ErrType<"CommandError">>>(resolve => {
          const child = cp.spawn(cmd, args, nodeOpts);
          let stdout = "";
          let stderr = "";
          let timer: ReturnType<typeof setTimeout> | undefined;

          if (options.timeout !== undefined) {
            const ms = options.timeout;
            timer = setTimeout(() => {
              child.kill();
              resolve(Err(CommandError(`Command timed out after ${ms}ms`, { cmd, args })));
            }, ms);
          }

          child.stdout?.on("data", chunk => {
            stdout += chunk.toString();
          });
          child.stderr?.on("data", chunk => {
            stderr += chunk.toString();
          });
          child.on("error", err => {
            if (timer !== undefined) clearTimeout(timer);
            resolve(Err(CommandError(err.message, { cmd, args })));
          });
          child.on("close", code => {
            if (timer !== undefined) clearTimeout(timer);
            resolve(Ok({ exitCode: code ?? 1, stdout, stderr }));
          });

          if (child.stdin !== null) {
            child.stdin.write(stdinData);
            child.stdin.end();
          }
        });
      }

      // No stdin: use execFile (supports timeout natively)
      const nodeOpts: { cwd?: string; env?: Record<string, string>; timeout?: number } =
        buildSpawnOpts(options);
      if (options.timeout !== undefined) nodeOpts.timeout = options.timeout;

      return await new Promise<Result<CommandResult, ErrType<"CommandError">>>(resolve => {
        cp.execFile(cmd, args, nodeOpts, (error, stdout, stderr) => {
          resolve(resolveNodeExecResult(error, stdout, stderr, cmd, args, nodeOpts.timeout));
        });
      });
    } catch (e) {
      return Err(CommandError(e instanceof Error ? e.message : String(e), { cmd, args }));
    }
  });

// -- Public API --------------------------------------------------------------

/**
 * Cross-runtime subprocess execution.
 *
 * Detects the runtime (Deno, Bun, Node) via globalThis and
 * dispatches to the appropriate subprocess API. Returns TaskLike so
 * execution is lazy until `.run()` is called.
 *
 * Non-zero exit codes are **not** errors: the full stdout/stderr/exitCode
 * is returned in Ok. Only actual failures (command not found, timeout,
 * spawn error) produce Err(CommandError).
 *
 * @example
 * ```ts
 * const result = await Command.exec('echo', ['hello']).run();
 * // Result<CommandResult, ErrType<'CommandError'>>
 *
 * if (result.isOk) {
 *   console.log(result.value.stdout); // 'hello\n'
 * }
 * ```
 */
export const Command: {
  /** Execute a command with optional arguments and options. */
  readonly exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ) => TaskLike<CommandResult, ErrType<"CommandError">>;
} = {
  exec: (
    cmd: string,
    args?: readonly string[],
    options?: CommandOptions,
  ): TaskLike<CommandResult, ErrType<"CommandError">> => {
    const resolvedArgs = args ?? [];
    const resolvedOptions: CommandOptions = options ?? {};

    // Check Deno first (Deno.Command)
    const deno = (globalThis as unknown as { Deno?: DenoGlobal }).Deno;
    if (deno?.Command !== undefined) {
      return execDeno(deno.Command, cmd, resolvedArgs, resolvedOptions);
    }

    // Check Bun (Bun.spawnSync)
    const bun = (globalThis as unknown as { Bun?: BunGlobal }).Bun;
    if (bun?.spawnSync !== undefined) {
      return execBun(bun, cmd, resolvedArgs, resolvedOptions);
    }

    // Fallback to Node.js child_process
    return execNode(cmd, resolvedArgs, resolvedOptions);
  },
};
