/**
 * @module pipe
 *
 * Left-to-right function composition utilities.
 *
 * **Why both `pipe` and `flow`?**
 * `pipe` is data-first: you pass a value and a chain of transforms.
 * `flow` is point-free: you compose functions without mentioning the data.
 * Both are overloaded (up to 9 stages for pipe, 6 for flow) so TypeScript
 * infers every intermediate type without annotation.
 *
 * **Why indexed for-loops instead of reduce?**
 * These are hot-path utilities that may run in tight loops. Indexed iteration
 * avoids iterator object allocation and the overhead of `.reduce()` closures.
 */

/**
 * Left-to-right data transformation. Data-first.
 *
 * Passes `initial` through a sequence of unary functions, where each stage
 * receives the output of the previous. Overloaded for 1 to 9 stages with
 * full type inference.
 *
 * @example
 * ```ts
 * pipe(
 *   rawInput,
 *   parseUser,
 *   u => u.set(x => x.name, u.name.trim()),
 *   u => u.update(x => x.age, a => a + 1),
 * )
 * ```
 */
/** Pass a value through a sequence of unary functions left-to-right. */
export function pipe<A>(a: A): A;
/** Pipe a value through 1 function. */
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
/** Pipe a value through 2 functions. */
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
/** Pipe a value through 3 functions. */
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
/** Pipe a value through 4 functions. */
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
/** Pipe a value through 5 functions. */
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F;
/** Pipe a value through 6 functions. */
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): G;
/** Pipe a value through 7 functions. */
export function pipe<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
): H;
/** Pipe a value through 8 functions. */
export function pipe<A, B, C, D, E, F, G, H, I>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
  gh: (g: G) => H,
  hi: (h: H) => I,
): I;
export function pipe(initial: unknown, ...fns: ((arg: unknown) => unknown)[]): unknown {
  let result = initial;
  // biome-ignore lint/style/useForOf: hot-path, indexed loop avoids iterator allocation
  for (let i = 0; i < fns.length; i++) result = fns[i]!(result);
  return result;
}

/**
 * Point-free function composition. Left-to-right.
 *
 * Returns a new function that pipes its argument through all stages.
 * Overloaded for 1 to 6 stages with full type inference.
 *
 * @example
 * ```ts
 * const processUser = flow(parseUser, normalize, validate);
 * processUser(rawInput);
 * ```
 */
/** Compose functions left-to-right, returning a new function. */
export function flow<A, B>(ab: (a: A) => B): (a: A) => B;
/** Compose 2 functions left-to-right. */
export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
/** Compose 3 functions left-to-right. */
export function flow<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D;
/** Compose 4 functions left-to-right. */
export function flow<A, B, C, D, E>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): (a: A) => E;
/** Compose 5 functions left-to-right. */
export function flow<A, B, C, D, E, F>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): (a: A) => F;
/** Compose 6 functions left-to-right. */
export function flow<A, B, C, D, E, F, G>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): (a: A) => G;
export function flow(...fns: ((arg: unknown) => unknown)[]): (a: unknown) => unknown {
  return initial => {
    let result = initial;
    // biome-ignore lint/style/useForOf: hot-path, indexed loop avoids iterator allocation
    for (let i = 0; i < fns.length; i++) result = fns[i]!(result);
    return result;
  };
}
