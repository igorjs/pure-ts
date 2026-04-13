/**
 * @module async/state-machine
 *
 * Type-safe finite state machine with compile-time transition validation.
 *
 * **Why StateMachine?**
 * State machines model workflows, UI flows, and protocol handlers.
 * Without type-safe transitions, invalid state changes are runtime bugs.
 * This module makes invalid transitions a compile error: if state 'idle'
 * only accepts 'FETCH', sending 'RESOLVE' fails at type-check time.
 * Runtime validation via Result catches dynamic/external input.
 */

import type { Result } from "../core/result.js";
import { Err, Ok } from "../core/result.js";
import { ErrType, type ErrTypeConstructor } from "../types/error.js";

// ── Error types ─────────────────────────────────────────────────────────────

/** Error returned when a transition is invalid for the current state. */
export const InvalidTransition: ErrTypeConstructor<"InvalidTransition", string> =
  ErrType("InvalidTransition");

// ── Types ───────────────────────────────────────────────────────────────────

/** State config with optional entry/exit hooks. */
interface StateConfig<Ctx> {
  readonly onEntry?: ((ctx: Ctx) => Ctx) | undefined;
  readonly onExit?: ((ctx: Ctx) => Ctx) | undefined;
}

/** Transition target: simple string or extended with guard/action. */
type TransitionTarget<S extends string, Ctx> =
  | S
  | {
      readonly target: S;
      readonly guard?: ((ctx: Ctx) => boolean) | undefined;
      readonly action?: ((ctx: Ctx) => Ctx) | undefined;
    };

/** Normalized internal transition (always object form). */
interface NormalizedTransition<Ctx> {
  readonly target: string;
  readonly guard: ((ctx: Ctx) => boolean) | undefined;
  readonly action: ((ctx: Ctx) => Ctx) | undefined;
}

// ── Instance ────────────────────────────────────────────────────────────────

/**
 * A stateful, frozen state machine instance.
 *
 * Use `.transition()` for compile-time safe transitions where state and
 * event are known at authoring time. Use `.send()` for runtime-validated
 * transitions where state/event come from external input.
 */
interface StateMachineInstance<
  States extends Record<string, StateConfig<Ctx>>,
  Transitions extends Partial<
    Record<keyof States & string, Record<string, TransitionTarget<keyof States & string, Ctx>>>
  >,
  Ctx,
> {
  /**
   * Compile-time safe transition: type error on invalid state/event.
   *
   * Throws TypeError at runtime if a guard blocks the transition,
   * since the type system cannot model guard conditions.
   */
  readonly transition: <
    S extends keyof Transitions & string,
    E extends keyof Transitions[S] & string,
  >(
    state: S,
    ctx: Ctx,
    event: E,
  ) => [string, Ctx];

  /**
   * Runtime safe transition: returns Result instead of throwing.
   *
   * Use when state/event come from external input (user actions,
   * network messages) where compile-time safety is not possible.
   */
  readonly send: (
    state: string,
    ctx: Ctx,
    event: string,
  ) => Result<[string, Ctx], ErrType<"InvalidTransition">>;

  /** Frozen array of all state names defined in the machine. */
  readonly states: readonly string[];

  /** The initial state name. */
  readonly initial: string;

  /** Return valid events for a given state. Empty array if state has no transitions. */
  readonly events: (state: string) => readonly string[];

  /** Check whether an event is valid in a given state. */
  readonly canTransition: (state: string, event: string) => boolean;
}

// ── Implementation ──────────────────────────────────────────────────────────

/**
 * Create a type-safe finite state machine.
 *
 * @example
 * ```ts
 * const machine = StateMachine({
 *   initial: "idle",
 *   states: { idle: {}, loading: {}, done: {} },
 *   transitions: {
 *     idle: { FETCH: "loading" },
 *     loading: { RESOLVE: "done" },
 *   },
 * });
 *
 * // Compile-time safe: "RESOLVE" on "idle" is a type error
 * const [next, ctx] = machine.transition("idle", undefined, "FETCH");
 *
 * // Runtime safe: returns Result
 * const result = machine.send("idle", undefined, "FETCH");
 * ```
 */
export const StateMachine = <
  States extends Record<string, StateConfig<Ctx>>,
  Transitions extends Partial<
    Record<keyof States & string, Record<string, TransitionTarget<keyof States & string, Ctx>>>
  >,
  Ctx = void,
>(config: {
  readonly initial: keyof States & string;
  readonly states: States;
  readonly transitions: Transitions;
}): StateMachineInstance<States, Transitions, Ctx> => {
  const stateNames = Object.freeze(Object.keys(config.states));

  // Normalize transitions at construction time so resolve() is simple
  const normalized: Record<string, Record<string, NormalizedTransition<Ctx>>> = {};
  for (const state of Object.keys(config.transitions)) {
    const events = config.transitions[state as keyof typeof config.transitions];
    if (events === undefined) {
      continue;
    }
    normalized[state] = {};
    for (const event of Object.keys(events)) {
      const target = (events as Record<string, unknown>)[event];
      if (typeof target === "string") {
        normalized[state][event] = { target, guard: undefined, action: undefined };
      } else {
        const t = target as {
          target: string;
          guard?: (ctx: Ctx) => boolean;
          action?: (ctx: Ctx) => Ctx;
        };
        normalized[state][event] = { target: t.target, guard: t.guard, action: t.action };
      }
    }
  }

  const resolve = (
    state: string,
    ctx: Ctx,
    event: string,
  ): Result<[string, Ctx], ErrType<"InvalidTransition">> => {
    const stateTransitions = normalized[state];
    if (stateTransitions === undefined) {
      return Err(InvalidTransition(`No transitions for state '${state}'`, { state, event }));
    }
    const entry = stateTransitions[event];
    if (entry === undefined) {
      return Err(
        InvalidTransition(`Event '${event}' not valid in state '${state}'`, { state, event }),
      );
    }
    if (entry.guard !== undefined && !entry.guard(ctx)) {
      return Err(
        InvalidTransition(`Guard blocked '${event}' in state '${state}'`, { state, event }),
      );
    }

    let nextCtx = ctx;

    // Execute hooks in order: onExit(source) -> action -> onEntry(target)
    const sourceState = config.states[state as keyof States];
    if (sourceState?.onExit !== undefined) {
      nextCtx = sourceState.onExit(nextCtx);
    }
    if (entry.action !== undefined) {
      nextCtx = entry.action(nextCtx);
    }
    const targetState = config.states[entry.target as keyof States];
    if (targetState?.onEntry !== undefined) {
      nextCtx = targetState.onEntry(nextCtx);
    }

    return Ok([entry.target, nextCtx] as [string, Ctx]);
  };

  return Object.freeze({
    transition: (state: string, ctx: Ctx, event: string) => {
      const result = resolve(state, ctx, event);
      if (result.isErr) {
        throw new TypeError(result.error.message);
      }
      return result.unwrap();
    },
    send: resolve,
    states: stateNames,
    initial: config.initial,
    events: (state: string) => Object.freeze(Object.keys(normalized[state] ?? {})),
    canTransition: (state: string, event: string) => {
      const stateTransitions = normalized[state];
      return stateTransitions !== undefined && event in stateTransitions;
    },
  }) as StateMachineInstance<States, Transitions, Ctx>;
};
