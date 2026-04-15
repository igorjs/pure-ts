/**
 * @module event-emitter
 *
 * Type-safe event emitter where the event map is a generic type parameter.
 *
 * **Why EventEmitter?**
 * Node's built-in EventEmitter and most third-party alternatives are stringly
 * typed: any event name is accepted, and handlers receive `unknown` payloads.
 * This module constrains both event names and handler signatures through a
 * generic event map, catching mismatches at compile time while keeping the
 * runtime implementation minimal and dependency-free.
 */

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * A type-safe event emitter instance.
 *
 * The `Events` type parameter maps event names to their payload types.
 * Handlers are constrained per-event so that the wrong payload shape
 * is a compile-time error.
 *
 * @example
 * ```ts
 * type AppEvents = {
 *   userCreated: { id: string; name: string };
 *   error: { message: string };
 *   shutdown: void;
 * };
 *
 * const emitter = EventEmitter.create<AppEvents>();
 *
 * emitter.on('userCreated', user => {
 *   console.log(user.id, user.name);
 * });
 *
 * emitter.emit('userCreated', { id: 'u1', name: 'Alice' });
 * ```
 */
export interface EventEmitterInstance<Events extends Record<string, unknown>> {
  /** Register a handler for the given event. */
  readonly on: <K extends keyof Events & string>(
    event: K,
    handler: (payload: Events[K]) => void,
  ) => void;
  /** Remove a specific handler for the given event. */
  readonly off: <K extends keyof Events & string>(
    event: K,
    handler: (payload: Events[K]) => void,
  ) => void;
  /** Register a handler that fires at most once, then removes itself. */
  readonly once: <K extends keyof Events & string>(
    event: K,
    handler: (payload: Events[K]) => void,
  ) => void;
  /** Emit an event, calling all registered handlers synchronously. */
  readonly emit: <K extends keyof Events & string>(event: K, payload: Events[K]) => void;
  /** Remove all handlers for the given event. */
  readonly removeAll: <K extends keyof Events & string>(event: K) => void;
  /** Return the number of handlers registered for the given event. */
  readonly listenerCount: <K extends keyof Events & string>(event: K) => number;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createInstance = <Events extends Record<string, unknown>>(): EventEmitterInstance<Events> => {
  // Internal storage: event name -> set of handler functions.
  // Handlers are typed at the public API boundary and stored heterogeneously per-event.
  // biome-ignore lint/complexity/noBannedTypes: internal type-erased storage, typed at API boundary
  const listeners = new Map<string, Set<Function>>();

  // biome-ignore lint/complexity/noBannedTypes: internal type-erased storage
  const getOrCreate = (event: string): Set<Function> => {
    let set = listeners.get(event);
    if (set === undefined) {
      set = new Set();
      listeners.set(event, set);
    }
    return set;
  };

  return Object.freeze({
    on: <K extends keyof Events & string>(
      event: K,
      handler: (payload: Events[K]) => void,
    ): void => {
      getOrCreate(event).add(handler);
    },

    off: <K extends keyof Events & string>(
      event: K,
      handler: (payload: Events[K]) => void,
    ): void => {
      const set = listeners.get(event);
      if (set !== undefined) {
        set.delete(handler);
      }
    },

    once: <K extends keyof Events & string>(
      event: K,
      handler: (payload: Events[K]) => void,
    ): void => {
      const wrapper = (payload: Events[K]): void => {
        const set = listeners.get(event);
        if (set !== undefined) {
          set.delete(wrapper);
        }
        handler(payload);
      };
      getOrCreate(event).add(wrapper);
    },

    emit: <K extends keyof Events & string>(event: K, payload: Events[K]): void => {
      const set = listeners.get(event);
      if (set !== undefined) {
        for (const handler of set) {
          handler(payload);
        }
      }
    },

    removeAll: <K extends keyof Events & string>(event: K): void => {
      listeners.delete(event);
    },

    listenerCount: <K extends keyof Events & string>(event: K): number => {
      const set = listeners.get(event);
      if (set === undefined) {
        return 0;
      }
      return set.size;
    },
  });
};

// ── Public namespace ────────────────────────────────────────────────────────

/**
 * Create type-safe event emitter instances.
 *
 * @example
 * ```ts
 * type Events = {
 *   data: { value: number };
 *   done: void;
 * };
 *
 * const emitter = EventEmitter.create<Events>();
 *
 * emitter.on('data', payload => console.log(payload.value));
 * emitter.once('done', () => console.log('finished'));
 *
 * emitter.emit('data', { value: 42 });
 * emitter.emit('done', undefined);
 * ```
 */
export const EventEmitter: {
  /** Create a new type-safe event emitter instance. */
  readonly create: <Events extends Record<string, unknown>>() => EventEmitterInstance<Events>;
} = {
  create: createInstance,
};
