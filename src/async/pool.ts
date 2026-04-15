/**
 * @module pool
 *
 * Generic resource pool for connections, handles, or any reusable resource.
 *
 * **Why Pool instead of creating resources on demand?**
 * Creating resources (DB connections, HTTP clients, file handles) is expensive.
 * A pool maintains a set of pre-created resources that are acquired, used, and
 * returned. This bounds resource consumption, amortises creation cost, and
 * provides backpressure when demand exceeds capacity via a waiting queue.
 *
 * Supports max size, idle timeout with automatic cleanup, health checks via
 * an optional validate function, and acquire/release lifecycle. The `use`
 * convenience wrapper guarantees release even when the user function throws.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";
import { makeTask, type TaskLike } from "./task-like.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Resource pool operation failed. */
export const PoolError: ErrTypeConstructor<"PoolError", string> = ErrType("PoolError");

// ── Types ───────────────────────────────────────────────────────────────────

/** Configuration for creating a resource pool. */
export interface PoolOptions<T> {
  /** Async factory that creates a new resource. */
  readonly create: () => Promise<T>;
  /** Async cleanup that destroys a resource. Called on drain and idle timeout. */
  readonly destroy?: ((resource: T) => Promise<void>) | undefined;
  /** Health check. Return false to discard the resource and create a fresh one. */
  readonly validate?: ((resource: T) => boolean | Promise<boolean>) | undefined;
  /** Maximum number of resources (idle + in-use) the pool will maintain. */
  readonly maxSize: number;
  /** Milliseconds a resource can sit idle before being destroyed. */
  readonly idleTimeout?: number | undefined;
}

/** A resource checked out from the pool. Call release() to return it. */
export interface PooledResource<T> {
  /** The underlying resource value. */
  readonly value: T;
  /** Return this resource to the pool. */
  readonly release: () => void;
}

/** A resource pool instance. */
export interface PoolInstance<T> {
  /** Acquire a resource. Waits if pool is at maxSize. */
  readonly acquire: () => TaskLike<PooledResource<T>, ErrType<"PoolError", string>>;
  /** Acquire, run fn, and release automatically. */
  readonly use: <R>(fn: (resource: T) => Promise<R>) => TaskLike<R, ErrType<"PoolError", string>>;
  /** Destroy all idle resources and wait for active resources to return and be destroyed. */
  readonly drain: () => Promise<void>;
  /** Current pool size (idle + in-use). */
  readonly size: () => number;
  /** Number of idle resources. */
  readonly idle: () => number;
  /** Number of in-use resources. */
  readonly active: () => number;
}

// ── Internal types ──────────────────────────────────────────────────────────

interface IdleEntry<T> {
  readonly resource: T;
  timer: ReturnType<typeof setTimeout> | undefined;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createPool = <T>(options: PoolOptions<T>): PoolInstance<T> => {
  const { create, destroy, validate, maxSize, idleTimeout } = options;

  const idleResources: IdleEntry<T>[] = [];
  let activeCount = 0;
  let draining = false;

  // Waiters queue: resolve functions for callers blocked on acquire
  const waiters: Array<(resource: T) => void> = [];

  // Drain completion tracking
  let drainResolve: (() => void) | undefined;

  const destroyResource = async (resource: T): Promise<void> => {
    if (destroy !== undefined) {
      try {
        await destroy(resource);
      } catch {
        // Swallow destruction errors: the resource is being discarded anyway
      }
    }
  };

  const clearIdleTimer = (entry: IdleEntry<T>): void => {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
  };

  const checkDrainComplete = (): void => {
    if (draining && activeCount === 0 && idleResources.length === 0 && drainResolve !== undefined) {
      drainResolve();
      drainResolve = undefined;
    }
  };

  const startIdleTimer = (entry: IdleEntry<T>): void => {
    if (idleTimeout === undefined || idleTimeout <= 0) {
      return;
    }
    entry.timer = setTimeout(() => {
      const idx = idleResources.indexOf(entry);
      if (idx !== -1) {
        idleResources.splice(idx, 1);
        void destroyResource(entry.resource);
        checkDrainComplete();
      }
    }, idleTimeout);
  };

  const returnToPool = (resource: T): void => {
    activeCount--;

    if (draining) {
      void destroyResource(resource);
      checkDrainComplete();
      return;
    }

    // If someone is waiting, hand the resource directly to them
    const waiter = waiters.shift();
    if (waiter !== undefined) {
      activeCount++;
      waiter(resource);
      return;
    }

    // Otherwise add to idle pool
    const entry: IdleEntry<T> = { resource, timer: undefined };
    startIdleTimer(entry);
    idleResources.push(entry);
  };

  const makePooledResource = (resource: T): PooledResource<T> => {
    let released = false;
    return Object.freeze({
      value: resource,
      release: (): void => {
        if (released) {
          return;
        }
        released = true;
        returnToPool(resource);
      },
    });
  };

  const tryAcquireIdle = async (): Promise<T | undefined> => {
    while (idleResources.length > 0) {
      const entry = idleResources.shift()!;
      clearIdleTimer(entry);

      if (validate !== undefined) {
        let healthy: boolean;
        try {
          healthy = await validate(entry.resource);
        } catch {
          healthy = false;
        }
        if (!healthy) {
          void destroyResource(entry.resource);
          continue;
        }
      }

      return entry.resource;
    }
    return undefined;
  };

  const acquireImpl = async (): Promise<
    Result<PooledResource<T>, ErrType<"PoolError", string>>
  > => {
    if (draining) {
      return Err(PoolError("Pool is draining"));
    }

    // Try to reuse an idle resource
    const idleResource = await tryAcquireIdle();
    if (idleResource !== undefined) {
      activeCount++;
      return Ok(makePooledResource(idleResource));
    }

    // Create a new resource if under maxSize
    const totalSize = idleResources.length + activeCount;
    if (totalSize < maxSize) {
      try {
        const resource = await create();
        activeCount++;
        return Ok(makePooledResource(resource));
      } catch (e) {
        return Err(PoolError(e instanceof Error ? e.message : String(e)));
      }
    }

    // At maxSize: wait for a resource to be released
    const resource = await new Promise<T>(resolve => {
      waiters.push(resolve);
    });
    return Ok(makePooledResource(resource));
  };

  const acquire = (): TaskLike<PooledResource<T>, ErrType<"PoolError", string>> =>
    makeTask(acquireImpl);

  const use = <R>(fn: (resource: T) => Promise<R>): TaskLike<R, ErrType<"PoolError", string>> =>
    makeTask(async (): Promise<Result<R, ErrType<"PoolError", string>>> => {
      const acquireResult = await acquireImpl();
      if (acquireResult.isErr) {
        return Err(acquireResult.error);
      }
      const pooled = acquireResult.value;
      try {
        const result = await fn(pooled.value);
        return Ok(result);
      } catch (e) {
        return Err(PoolError(e instanceof Error ? e.message : String(e)));
      } finally {
        pooled.release();
      }
    });

  const drain = async (): Promise<void> => {
    draining = true;

    // Destroy all idle resources
    const idleToDestroy = idleResources.splice(0, idleResources.length);
    for (const entry of idleToDestroy) {
      clearIdleTimer(entry);
      await destroyResource(entry.resource);
    }

    // If no active resources, done immediately
    if (activeCount === 0) {
      checkDrainComplete();
      return;
    }

    // Wait for all active resources to be released and destroyed
    return new Promise<void>(resolve => {
      drainResolve = resolve;
    });
  };

  return Object.freeze({
    acquire,
    use,
    drain,
    size: (): number => idleResources.length + activeCount,
    idle: (): number => idleResources.length,
    active: (): number => activeCount,
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create generic resource pools for connections, handles, or any reusable resource.
 */
export const Pool: {
  /** Create a new resource pool with the given options. */
  readonly create: <T>(options: PoolOptions<T>) => PoolInstance<T>;
} = {
  create: createPool,
};
