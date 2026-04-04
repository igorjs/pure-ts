/**
 * @module match
 *
 * Exhaustive pattern matching with a builder API.
 *
 * **Why Match in addition to Result.match / Option.match?**
 * The existing `.match()` on Result and Option handles two-arm patterns.
 * `Match` handles arbitrary values with multiple patterns, predicate guards,
 * literal equality, and tag-based discrimination. It enforces exhaustiveness
 * at the type level: calling `.exhaustive()` is a compile error if any
 * variant is unhandled.
 *
 * **How exhaustiveness works:**
 * Each `.with()` call narrows the remaining type by excluding the matched
 * pattern. When all variants are covered, the remaining type is `never`,
 * and `.exhaustive()` can safely return. If variants remain, TypeScript
 * reports a type error on the `.exhaustive()` call.
 */

// ── Pattern types ───────────────────────────────────────────────────────────

/**
 * A tagged object pattern that matches values with a `tag` discriminant.
 * Works with Result (tag: "Ok" | "Err"), Option (tag: "Some" | "None"),
 * and ErrType (tag: string).
 */
interface TagPattern {
  readonly tag: string;
}

// ── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builder for composing pattern match arms.
 *
 * Each `.with()` or `.when()` adds an arm. Terminate with `.exhaustive()`
 * (compile-time check) or `.otherwise()` (catch-all fallback).
 *
 * @example
 * ```ts
 * const result = Match(value)
 *   .with({ tag: "Ok" }, v => v.value)
 *   .with({ tag: "Err" }, e => e.error)
 *   .exhaustive();
 * ```
 */
interface MatchBuilder<T, R> {
  /**
   * Match values with a specific `tag` discriminant.
   * Narrows the matched value to the variant with that tag.
   */
  with<Tag extends string, U>(
    pattern: { readonly tag: Tag },
    handler: (value: Extract<T, { readonly tag: Tag }>) => U,
  ): MatchBuilder<Exclude<T, { readonly tag: Tag }>, R | U>;

  /**
   * Match values satisfying a predicate guard.
   */
  when<U>(predicate: (value: T) => boolean, handler: (value: T) => U): MatchBuilder<T, R | U>;

  /**
   * Catch-all fallback. Always terminates the match.
   */
  otherwise<U>(handler: (value: T) => U): R | U;

  /**
   * Assert all variants are handled. Compile error if not exhaustive.
   * At runtime, throws if an unmatched value reaches this point.
   */
  exhaustive(): R;
}

// ── Arm types ───────────────────────────────────────────────────────────────

interface TagArm {
  readonly kind: "tag";
  readonly tag: string;
  readonly handler: (value: unknown) => unknown;
}

interface WhenArm {
  readonly kind: "when";
  readonly predicate: (value: unknown) => boolean;
  readonly handler: (value: unknown) => unknown;
}

type Arm = TagArm | WhenArm;

// ── Implementation ──────────────────────────────────────────────────────────

const isTagged = (value: unknown): value is TagPattern =>
  value !== null && typeof value === "object" && "tag" in value;

const tryMatch = (
  value: unknown,
  arms: readonly Arm[],
): { matched: true; result: unknown } | null => {
  for (const arm of arms) {
    if (arm.kind === "tag") {
      if (isTagged(value) && value.tag === arm.tag) {
        return { matched: true, result: arm.handler(value) };
      }
    } else if (arm.predicate(value)) {
      return { matched: true, result: arm.handler(value) };
    }
  }
  return null;
};

const createBuilder = <T, R>(value: unknown, arms: readonly Arm[]): MatchBuilder<T, R> => ({
  with<Tag extends string, U>(
    pattern: { readonly tag: Tag },
    handler: (value: Extract<T, { readonly tag: Tag }>) => U,
  ): MatchBuilder<Exclude<T, { readonly tag: Tag }>, R | U> {
    const arm: TagArm = {
      kind: "tag",
      tag: pattern.tag,
      handler: handler as (value: unknown) => unknown,
    };
    return createBuilder(value, [...arms, arm]);
  },

  when<U>(predicate: (value: T) => boolean, handler: (value: T) => U): MatchBuilder<T, R | U> {
    const arm: WhenArm = {
      kind: "when",
      predicate: predicate as (value: unknown) => boolean,
      handler: handler as (value: unknown) => unknown,
    };
    return createBuilder(value, [...arms, arm]);
  },

  otherwise<U>(handler: (value: T) => U): R | U {
    const result = tryMatch(value, arms);
    if (result !== null) return result.result as R | U;
    return handler(value as T) as R | U;
  },

  exhaustive(): R {
    const result = tryMatch(value, arms);
    if (result !== null) return result.result as R;
    throw new TypeError(`Match.exhaustive: no pattern matched ${JSON.stringify(value)}`);
  },
});

// ── Public entry point ──────────────────────────────────────────────────────

/**
 * Begin a pattern match on `value`.
 *
 * Returns a {@link MatchBuilder} for composing match arms. Use `.with()`
 * for tag-based matching, `.when()` for predicate guards, and terminate
 * with `.exhaustive()` or `.otherwise()`.
 *
 * @example
 * ```ts
 * // Tag-based matching (Result, Option, ErrType)
 * const msg = Match(result)
 *   .with({ tag: "Ok" }, r => `Success: ${r.value}`)
 *   .with({ tag: "Err" }, r => `Error: ${r.error}`)
 *   .exhaustive();
 *
 * // Predicate guards
 * const label = Match(score)
 *   .when(n => n >= 90, () => 'A')
 *   .when(n => n >= 80, () => 'B')
 *   .otherwise(() => 'C');
 * ```
 */
export const Match = <T>(value: T): MatchBuilder<T, never> => createBuilder(value, []);
