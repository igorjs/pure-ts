/**
 * @module io
 *
 * Type-safe wrappers for common I/O and web standard operations.
 *
 * Every operation that can fail returns Result or Task, making error
 * paths explicit in the type system. No exceptions, no invisible
 * control flow.
 */

// ── Cross-module type dependencies ──────────────
/** Re-exported so public signatures that reference TaskLike are visible from this entrypoint. */
export type { TaskLike } from "../async/task-like.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { NoneVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Option are visible from this entrypoint. */
export type { Option } from "../core/option.js";
/** Re-exported so public signatures that reference OptionMatcher are visible from this entrypoint. */
export type { OptionMatcher } from "../core/option.js";
/** Re-exported so public signatures that reference SomeVariant are visible from this entrypoint. */
export type { SomeVariant } from "../core/option.js";
/** Re-exported so public signatures that reference Err are visible from this entrypoint. */
export type { Err } from "../core/result.js";
/** Re-exported so public signatures that reference Ok are visible from this entrypoint. */
export type { Ok } from "../core/result.js";
/** Re-exported so public signatures that reference Result are visible from this entrypoint. */
export type { Result } from "../core/result.js";
/** Re-exported so public signatures that reference ResultMatcher are visible from this entrypoint. */
export type { ResultMatcher } from "../core/result.js";
/** Re-exported so public signatures that reference ErrType are visible from this entrypoint. */
export type { ErrType } from "../types/error.js";
/** Re-exported so public signatures that reference ErrTypeConstructor are visible from this entrypoint. */
export type { ErrTypeConstructor } from "../types/error.js";

/** Structured cloning namespace using the web standard algorithm. */
export { Clone } from "./clone.js";
/** Error returned when a deep clone operation fails. */
export { CloneError } from "./clone.js";
/** Web standard compression and decompression namespace. */
export { Compression } from "./compression.js";
/** Error returned when compression or decompression fails. */
export { CompressionError } from "./compression.js";
/** Web standard cryptographic hashing, encryption, and random bytes namespace. */
export { Crypto } from "./crypto.js";
/** Error returned when a cryptographic operation fails. */
export { CryptoError } from "./crypto.js";
/** Cross-runtime DNS resolution namespace returning Task. */
export { Dns } from "./dns.js";
/** Error returned when DNS resolution fails. */
export { DnsError } from "./dns.js";
/** A resolved DNS address with IP family. */
export type { DnsRecord } from "./dns.js";
/** DNS record type for resolution queries (A, AAAA, CNAME, MX, TXT). */
export type { DnsType } from "./dns.js";
/** Base64, hex, and UTF-8 encoding and decoding namespace. */
export { Encoding } from "./encoding.js";
/** Error returned when an encoding or decoding operation fails. */
export { EncodingError } from "./encoding.js";
/** Cross-runtime file read, write, append, stat, and remove namespace. */
export { File } from "./file.js";
/** Error returned when a file system operation fails. */
export { FileError } from "./file.js";
/** Metadata returned by File.stat (isFile, isDirectory, size, mtime). */
export type { FileStat } from "./file.js";
/** Safe JSON parse and stringify namespace returning Result. */
export { Json } from "./json.js";
/** Error returned when JSON parse or stringify fails. */
export { JsonError } from "./json.js";
/** Cross-runtime TCP client namespace. */
export { Net } from "./net.js";
/** Error returned when a TCP connection or communication fails. */
export { NetError } from "./net.js";
/** A connected TCP socket with send, receive, and close operations. */
export type { TcpConnection } from "./net.js";
/** Cross-runtime subprocess execution namespace. */
export { Command } from "./subprocess.js";
/** Error returned when subprocess execution fails. */
export { CommandError } from "./subprocess.js";
/** Options for subprocess execution (cwd, env, timeout, stdin). */
export type { CommandOptions } from "./subprocess.js";
/** Output of a subprocess execution (exitCode, stdout, stderr). */
export type { CommandResult } from "./subprocess.js";
/** URL parsing and manipulation namespace returning Result. */
export { Url } from "./url.js";
/** Error returned when URL parsing or construction fails. */
export { UrlError } from "./url.js";
