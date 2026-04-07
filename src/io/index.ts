/**
 * @module io
 *
 * Type-safe wrappers for common I/O and web standard operations.
 *
 * Every operation that can fail returns Result or Task, making error
 * paths explicit in the type system. No exceptions, no invisible
 * control flow.
 */

export { Clone, CloneError } from "./clone.js";
export { Compression, CompressionError } from "./compression.js";
export { Crypto, CryptoError } from "./crypto.js";
export { Encoding, EncodingError } from "./encoding.js";
export { File, FileError } from "./file.js";
export { Json, JsonError } from "./json.js";
export { Url, UrlError } from "./url.js";
