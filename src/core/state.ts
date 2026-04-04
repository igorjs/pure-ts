/**
 * @module state
 *
 * State monad for threading mutable state through pure computations.
 *
 * **Why State instead of a mutable variable?**
 * A mutable variable hides the dependency on state from the type signature.
 * `State<S, A>` makes it explicit: the computation reads and writes state
 * of type `S` and produces a value of type `A`. The state is threaded
 * automatically through `map` and `flatMap`, so each step sees the state
 * left by the previous step. This is useful for parsers, interpreters,
 * accumulators, and any pipeline where intermediate state must be tracked
 * without side effects.
 */

/**
 * A computation that reads and writes state S, producing a value A.
 *
 * Call `.run(initialState)` to execute. Returns `[value, finalState]`.
 *
 * @example
 * ```ts
 * const counter = State.get<number>()
 *   .flatMap(n => State.set(n + 1).map(() => n));
 *
 * counter.run(0);  // [0, 1]
 * counter.run(5);  // [5, 6]
 * ```
 */
export interface State<S, A> {
  /** Execute the computation with the given initial state. */
  readonly run: (state: S) => readonly [A, S];
  /** Transform the produced value. */
  readonly map: <B>(fn: (a: A) => B) => State<S, B>;
  /** Chain into a dependent state computation. */
  readonly flatMap: <B>(fn: (a: A) => State<S, B>) => State<S, B>;
  /** Run a side-effect on the value without altering the state computation. */
  readonly tap: (fn: (a: A) => void) => State<S, A>;
  /** Execute and return only the value, discarding the final state. */
  readonly eval: (state: S) => A;
  /** Execute and return only the final state, discarding the value. */
  readonly exec: (state: S) => S;
}

// ── Implementation ──────────────────────────────────────────────────────────

const createState = <S, A>(run: (state: S) => readonly [A, S]): State<S, A> =>
  Object.freeze({
    run,
    map: <B>(fn: (a: A) => B): State<S, B> =>
      createState((s: S) => {
        const [a, next] = run(s);
        return [fn(a), next];
      }),
    flatMap: <B>(fn: (a: A) => State<S, B>): State<S, B> =>
      createState((s: S) => {
        const [a, next] = run(s);
        return fn(a).run(next);
      }),
    tap: (fn: (a: A) => void): State<S, A> =>
      createState((s: S) => {
        const result = run(s);
        fn(result[0]);
        return result;
      }),
    eval: (state: S): A => run(state)[0],
    exec: (state: S): S => run(state)[1],
  });

// ── Public namespace (const/type merge) ─────────────────────────────────────

/**
 * Create and compose state computations.
 *
 * @example
 * ```ts
 * // Stack operations
 * type Stack = readonly number[];
 * const push = (n: number) => State.modify<Stack>(s => [...s, n]);
 * const pop = State.get<Stack>().flatMap(s =>
 *   s.length > 0
 *     ? State.set(s.slice(0, -1)).map(() => s[s.length - 1])
 *     : State.of(undefined),
 * );
 *
 * const program = push(1)
 *   .flatMap(() => push(2))
 *   .flatMap(() => push(3))
 *   .flatMap(() => pop);
 *
 * program.run([]);  // [3, [1, 2]]
 * ```
 */
export const State: {
  /** Wrap a plain value in State (state passes through unchanged). */
  readonly of: <S, A>(value: A) => State<S, A>;
  /** Read the current state as the produced value. */
  readonly get: <S>() => State<S, S>;
  /** Replace the state, producing void. */
  readonly set: <S>(state: S) => State<S, void>;
  /** Transform the state, producing void. */
  readonly modify: <S>(fn: (state: S) => S) => State<S, void>;
  /** Create a State from a raw run function. */
  readonly from: <S, A>(run: (state: S) => readonly [A, S]) => State<S, A>;
} = {
  of: <S, A>(value: A): State<S, A> => createState(s => [value, s]),

  get: <S>(): State<S, S> => createState(s => [s, s]),

  set: <S>(state: S): State<S, void> => createState(() => [undefined, state]),

  modify: <S>(fn: (state: S) => S): State<S, void> => createState(s => [undefined, fn(s)]),

  from: createState,
};
