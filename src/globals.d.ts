/**
 * structuredClone is an HTML spec API (not ECMAScript), available in
 * Node 17+ and all modern browsers. Not included in any ES lib target.
 */
declare function structuredClone<T>(value: T): T;

/**
 * V8's Error.captureStackTrace (Node 22+, Deno 2+, Chromium).
 * Not part of ECMAScript but universally available in V8 environments.
 */
interface ErrorConstructor {
  captureStackTrace?(target: object, constructorOpt?: (...args: never[]) => unknown): void;
}

/**
 * WHATWG AbortController / AbortSignal (Node 16+, all modern browsers).
 * Not part of ECMAScript but universally available.
 */
declare class AbortController {
  readonly signal: AbortSignal;
  abort(): void;
}

declare class AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/**
 * Minimal `process` declarations for Node 22+ / Bun / Deno.
 * Only the subset used by Program (signals + exit).
 */
declare const process: {
  on(event: string, listener: () => void): void;
  off(event: string, listener: () => void): void;
  exit(code?: number): never;
};

/**
 * WHATWG Timer API. Available in all JS runtimes (Node, Deno, Bun, browsers).
 * Not part of ECMAScript but universally available.
 */
declare function setTimeout(callback: () => void, ms?: number): number;

/**
 * Console API (WHATWG). Available in all JS runtimes.
 */
declare const console: {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};
