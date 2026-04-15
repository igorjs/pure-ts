/**
 * @module cache
 *
 * TTL-based in-memory cache with LRU eviction.
 *
 * **Why Cache instead of a Map?**
 * A Map grows unbounded and never expires entries. Cache adds TTL
 * (entries auto-expire) and optional max-size (LRU eviction). The API
 * returns Option for gets (explicit absence instead of undefined) and
 * integrates with Task for async cache-aside patterns.
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";
import type { Result } from "../core/result.js";
import { Ok } from "../core/result.js";
import type { Duration } from "../types/duration.js";
import { Duration as D } from "../types/duration.js";

import type { TaskLike } from "./task-like.js";

// ── Types ───────────────────────────────────────────────────────────────────

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Cache configuration.
 */
export interface CacheOptions {
  /** How long entries live before expiring. */
  readonly ttl: Duration;
  /** Maximum number of entries. Oldest accessed are evicted first. */
  readonly maxSize?: number;
}

/**
 * A TTL-based in-memory cache.
 *
 * @example
 * ```ts
 * const cache = Cache.create<string, User>({
 *   ttl: Duration.minutes(5),
 *   maxSize: 1000,
 * });
 *
 * cache.set('user:1', user);
 * cache.get('user:1');           // Some(user) or None (if expired)
 *
 * // Cache-aside pattern with Task
 * const getUser = (id: string) =>
 *   cache.getOrElse(id, fetchUserFromDb(id));
 * ```
 */
export interface CacheInstance<K, V> {
  /** Get a value. Returns None if missing or expired. */
  readonly get: (key: K) => Option<V>;
  /** Set a value with the configured TTL. */
  readonly set: (key: K, value: V) => void;
  /** Set a value with a custom TTL. */
  readonly setWithTTL: (key: K, value: V, ttl: Duration) => void;
  /** Check if a key exists and is not expired. */
  readonly has: (key: K) => boolean;
  /** Remove a key. */
  readonly delete: (key: K) => boolean;
  /** Remove all entries. */
  readonly clear: () => void;
  /** Number of non-expired entries. */
  readonly size: () => number;
  /**
   * Get or compute: returns cached value if present, otherwise runs the
   * task, caches the Ok result, and returns it.
   */
  readonly getOrElse: <E>(key: K, task: TaskLike<V, E>) => TaskLike<V, E>;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createCache = <K, V>(options: CacheOptions): CacheInstance<K, V> => {
  const store = new Map<K, CacheEntry<V>>();
  const ttlMs = D.toMilliseconds(options.ttl);
  const maxSize = options.maxSize;

  const isExpired = (entry: CacheEntry<V>): boolean => Date.now() > entry.expiresAt;

  /** Evict expired entries and enforce maxSize via LRU (Map insertion order). */
  const evict = (): void => {
    // Remove expired
    for (const [key, entry] of store) {
      if (isExpired(entry)) store.delete(key);
    }
    // Enforce maxSize by removing oldest (first inserted)
    if (maxSize !== undefined) {
      while (store.size > maxSize) {
        const firstKey = store.keys().next().value;
        if (firstKey !== undefined) store.delete(firstKey);
        else break;
      }
    }
  };

  const touch = (key: K, entry: CacheEntry<V>): void => {
    // Move to end of Map (most recently accessed)
    store.delete(key);
    store.set(key, entry);
  };

  return Object.freeze({
    get: (key: K): Option<V> => {
      const entry = store.get(key);
      if (entry === undefined || isExpired(entry)) {
        if (entry !== undefined) store.delete(key);
        return None;
      }
      touch(key, entry);
      return Some(entry.value);
    },

    set: (key: K, value: V): void => {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      evict();
    },

    setWithTTL: (key: K, value: V, ttl: Duration): void => {
      store.set(key, { value, expiresAt: Date.now() + D.toMilliseconds(ttl) });
      evict();
    },

    has: (key: K): boolean => {
      const entry = store.get(key);
      if (entry === undefined) return false;
      if (isExpired(entry)) {
        store.delete(key);
        return false;
      }
      return true;
    },

    delete: (key: K): boolean => store.delete(key),
    clear: (): void => store.clear(),
    size: (): number => {
      evict();
      return store.size;
    },

    getOrElse: <E>(key: K, task: TaskLike<V, E>): TaskLike<V, E> => ({
      run: async (): Promise<Result<V, E>> => {
        const entry = store.get(key);
        if (entry !== undefined && !isExpired(entry)) {
          touch(key, entry);
          return Ok(entry.value);
        }
        if (entry !== undefined) store.delete(key);
        const result = await task.run();
        if (result.isOk) {
          store.set(key, { value: result.value, expiresAt: Date.now() + ttlMs });
          evict();
        }
        return result;
      },
    }),
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create TTL-based in-memory caches.
 */
export const Cache: {
  /** Create a new TTL-based in-memory cache. */
  readonly create: <K, V>(options: CacheOptions) => CacheInstance<K, V>;
} = {
  create: createCache,
};
