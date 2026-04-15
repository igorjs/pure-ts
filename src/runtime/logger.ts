/**
 * @module runtime/logger
 *
 * Structured, composable logging as a value.
 *
 * **Why Logger as a value instead of console.log?**
 * `console.log` is a global side effect: hard to test, impossible to
 * compose, and produces unstructured output. Logger is a value you pass
 * around, configure, and compose. Each logger carries a name, level,
 * and optional context. In production it outputs JSON; in dev it outputs
 * human-readable text. Since it's a value, you can mock it in tests by
 * providing a silent or capturing logger.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/** Log severity levels, ordered from least to most severe. */
export type LogLevel =
  /** Verbose diagnostic output for development. */
  | "debug"
  /** Normal operational messages. */
  | "info"
  /** Potential issues that deserve attention. */
  | "warn"
  /** Failures requiring immediate action. */
  | "error";

/** A structured log record passed to log sinks. */
export interface LogRecord {
  /** Severity level of the log entry. */
  readonly level: LogLevel;
  /** Human-readable log message. */
  readonly message: string;
  /** Logger name identifying the source. */
  readonly name: string;
  /** ISO 8601 timestamp of when the entry was created. */
  readonly timestamp: string;
  /** Additional structured key-value context. */
  readonly context: Readonly<Record<string, unknown>>;
}

/** Function that receives a log record and outputs it somewhere. */
export type LogSink = (record: LogRecord) => void;

/** Numeric severity for level comparison. */
const LEVEL_VALUE: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ── Logger interface ────────────────────────────────────────────────────────

/**
 * A structured logger instance.
 *
 * @example
 * ```ts
 * const log = Logger.create({ name: 'api', level: 'info' });
 * log.info('request received', { method: 'GET', path: '/users' });
 * log.error('request failed', { status: 500 });
 *
 * const childLog = log.child({ requestId: '123' });
 * childLog.info('processing');  // includes requestId in context
 * ```
 */
export interface Logger {
  /** Log a debug-level message with optional context. */
  readonly debug: (message: string, context?: Record<string, unknown>) => void;
  /** Log an info-level message with optional context. */
  readonly info: (message: string, context?: Record<string, unknown>) => void;
  /** Log a warn-level message with optional context. */
  readonly warn: (message: string, context?: Record<string, unknown>) => void;
  /** Log an error-level message with optional context. */
  readonly error: (message: string, context?: Record<string, unknown>) => void;
  /** Create a child logger with additional context fields. */
  readonly child: (context: Record<string, unknown>) => Logger;
  /** Create a child logger with a different name. */
  readonly named: (name: string) => Logger;
  /** The logger's name. */
  readonly name: string;
}

// ── Sinks ───────────────────────────────────────────────────────────────────

/** Structural type for writable stream (avoids node: imports). */
interface Writable {
  write(data: string): unknown;
}

/** Access stdout/stderr via globalThis to stay runtime-agnostic. */
const noop: Writable = { write: () => undefined };

const getStdout = (): Writable =>
  (globalThis as unknown as { process?: { stdout?: Writable } }).process?.stdout ?? noop;

const getStderr = (): Writable =>
  (globalThis as unknown as { process?: { stderr?: Writable } }).process?.stderr ?? noop;

/** JSON sink: one JSON object per line. Suitable for production log aggregators. */
const jsonSink: LogSink = (record: LogRecord): void => {
  const { level, message, name, timestamp, context } = record;
  const entry =
    Object.keys(context).length > 0
      ? { timestamp, level, name, message, ...context }
      : { timestamp, level, name, message };
  getStdout().write(`${JSON.stringify(entry)}\n`);
};

/** Pretty sink: human-readable with ISO timestamp and level. Suitable for dev. */
const prettySink: LogSink = (record: LogRecord): void => {
  const { level, message, name, timestamp, context } = record;
  const ctx = Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  getStderr().write(`[${timestamp}] [${name}] ${level.toUpperCase()} ${message}${ctx}\n`);
};

/** Silent sink: discards all records. Useful for testing. */
const silentSink: LogSink = (): void => undefined;

// ── Implementation ──────────────────────────────────────────────────────────

const createLogger = (
  name: string,
  minLevel: LogLevel,
  sink: LogSink,
  baseContext: Readonly<Record<string, unknown>>,
): Logger => {
  const minValue = LEVEL_VALUE[minLevel];

  const log = (level: LogLevel, message: string, context?: Record<string, unknown>): void => {
    if (LEVEL_VALUE[level] < minValue) return;
    const merged = context !== undefined ? { ...baseContext, ...context } : baseContext;
    sink({
      level,
      message,
      name,
      timestamp: new Date().toISOString(),
      context: merged,
    });
  };

  return Object.freeze({
    name,
    debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
    info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
    warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
    error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
    child: (context: Record<string, unknown>) =>
      createLogger(name, minLevel, sink, { ...baseContext, ...context }),
    named: (newName: string) => createLogger(newName, minLevel, sink, baseContext),
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/** Options for creating a Logger. */
export interface LoggerOptions {
  /** Logger name identifying the source component. */
  readonly name: string;
  /** Minimum severity level to emit (default: "info"). */
  readonly level?: LogLevel;
  /** Output sink function (default: JSON to stdout). */
  readonly sink?: LogSink;
  /** Base context fields included in every log record. */
  readonly context?: Record<string, unknown>;
}

/**
 * Create structured loggers.
 *
 * @example
 * ```ts
 * // JSON logger for production
 * const log = Logger.create({ name: 'api' });
 *
 * // Pretty logger for development
 * const log = Logger.create({ name: 'api', sink: Logger.pretty });
 *
 * // Silent logger for tests
 * const log = Logger.create({ name: 'test', sink: Logger.silent });
 *
 * // Custom sink
 * const log = Logger.create({ name: 'api', sink: record => myTransport(record) });
 * ```
 */
export const Logger: {
  /** Create a new Logger instance with the given options. */
  readonly create: (options: LoggerOptions) => Logger;
  /** JSON log sink that outputs structured records to stdout/stderr. */
  readonly json: LogSink;
  /** Pretty log sink with human-readable timestamps and colours. */
  readonly pretty: LogSink;
  /** Silent log sink that discards all output. Useful for tests. */
  readonly silent: LogSink;
} = {
  create: (options: LoggerOptions): Logger =>
    createLogger(
      options.name,
      options.level ?? "info",
      options.sink ?? jsonSink,
      options.context ?? {},
    ),
  json: jsonSink,
  pretty: prettySink,
  silent: silentSink,
};
