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
