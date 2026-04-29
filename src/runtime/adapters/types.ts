/**
 * @module runtime/adapters/types
 *
 * Unified adapter interfaces for cross-runtime capabilities.
 *
 * Each interface defines a normalised contract that hides runtime
 * differences (Node vs Deno vs Bun). Implementations live in the
 * per-capability adapter files alongside their resolve functions.
 *
 * These types are internal. Public modules (File, Terminal, Command,
 * etc.) depend on them but do not re-export them.
 */

// ── Stdin / Stdout ──────────────────────────────────────────────────────────

/** Normalised stdin access. */
export interface Stdin {
  /** Whether stdin is connected to an interactive terminal. */
  readonly isTTY: boolean;
  /**
   * Read a single line. Returns null on EOF.
   * When interactive, displays the prompt before reading.
   */
  readLine(prompt: string): Promise<string | null>;
  /** Read all remaining stdin until EOF. */
  readAll(): Promise<string>;
  /** Enable or disable raw mode (character-at-a-time, no echo). */
  setRawMode?(mode: boolean): void;
  /** Read raw bytes in raw mode. Returns null on EOF. */
  readRaw?(buf: Uint8Array): Promise<number | null>;
  /** Register a data listener (Node-style). Returns cleanup function. */
  onData?(cb: (chunk: string) => void): () => void;
}

/** Normalised stdout/stderr access. */
export interface Stdout {
  /** Write text to the output stream. */
  write(text: string): void;
  /** Terminal width in columns, if available. */
  readonly columns?: number | undefined;
  /** Terminal height in rows, if available. */
  readonly rows?: number | undefined;
}

// ── File system ─────────────────────────────────────────────────────────────

/** Stat result normalised across runtimes. */
export interface FsStat {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly size: number;
  readonly mtime: Date | undefined;
}

/** Normalised async file system operations. */
export interface Fs {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<FsStat>;
  remove(path: string): Promise<void>;
  removeDir(path: string): Promise<void>;
  readDir(path: string): Promise<readonly string[]>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  makeTempDir(prefix?: string): Promise<string>;
}

// ── Subprocess ──────────────────────────────────────────────────────────────

/** Options for spawning a subprocess. */
export interface SubprocessOptions {
  readonly cwd?: string | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly timeout?: number | undefined;
  readonly stdin?: string | undefined;
}

/** Result of a subprocess execution. */
export interface SubprocessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Normalised subprocess execution. */
export interface Subprocess {
  exec(cmd: string, args: readonly string[], options: SubprocessOptions): Promise<SubprocessResult>;
}

// ── DNS ─────────────────────────────────────────────────────────────────────

/** Normalised DNS resolution. */
export interface Dns {
  lookup(hostname: string): Promise<{ address: string; family: 4 | 6 }>;
  resolve(hostname: string, type: string): Promise<readonly string[]>;
}

// ── TCP / Net ───────────────────────────────────────────────────────────────

/** A raw TCP connection returned by the adapter. */
export interface TcpSocket {
  send(data: string | Uint8Array): Promise<void>;
  receive(): Promise<Uint8Array>;
  close(): void;
}

/** Normalised TCP client. */
export interface TcpClient {
  connect(options: { host: string; port: number }): Promise<TcpSocket>;
}

// ── OS info ─────────────────────────────────────────────────────────────────

/** Normalised OS information. */
export interface OsInfo {
  hostname(): string | undefined;
  arch(): string;
  platform(): string;
  cpuCount(): number | undefined;
  totalMemory(): number | undefined;
  freeMemory(): number | undefined;
  tmpDir(): string;
  homeDir(): string | undefined;
  uptime(): number | undefined;
}

// ── Process ─────────────────────────────────────────────────────────────────

/** Memory usage stats. */
export interface ProcessMemory {
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly rss: number;
}

/** Normalised process information. */
export interface ProcessInfo {
  cwd(): string;
  readonly pid: number;
  readonly argv: readonly string[];
  env(): Record<string, string>;
  env(key: string): string | undefined;
  exit(code?: number): never;
  uptime?(): number;
  memoryUsage?(): ProcessMemory;
}
