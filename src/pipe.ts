// ═══════════════════════════════════════════════════════════════════════════════
// pipe / flow
// ═══════════════════════════════════════════════════════════════════════════════

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
export function pipe<A>(a: A): A;
export function pipe<A, B>(a: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(a: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe<A, B, C, D, E, F>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): F;
export function pipe<A, B, C, D, E, F, G>(
  a: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
  fg: (f: F) => G,
): G;
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
 * const processUser = flow(parseUser, normalise, validate);
 * processUser(rawInput);
 * ```
 */
export function flow<A, B>(ab: (a: A) => B): (a: A) => B;
export function flow<A, B, C>(ab: (a: A) => B, bc: (b: B) => C): (a: A) => C;
export function flow<A, B, C, D>(ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): (a: A) => D;
export function flow<A, B, C, D, E>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): (a: A) => E;
export function flow<A, B, C, D, E, F>(
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
  ef: (e: E) => F,
): (a: A) => F;
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
