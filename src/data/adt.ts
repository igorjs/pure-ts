/**
 * @module data/adt
 *
 * Generic algebraic data type (discriminated union) factory.
 *
 * **Why ADT?**
 * Result and Option are hand-crafted ADTs. For custom domain types like
 * Color, Shape, or AppState, you need a generic factory that creates
 * tagged variant constructors, type guards, and integrates with Match
 * for exhaustive pattern matching. ADT provides this without classes.
 *
 * **How the factory/type merge works:**
 * `ADT` is both a value (the factory function) and a namespace (for the
 * `ADT.Infer<T>` type helper). TypeScript's const/namespace merge makes
 * this seamless. The factory takes a config object mapping variant names
 * to either `null` (unit variant) or a payload factory function, and
 * returns a frozen object of constructors plus `.is` type guards.
 *
 * **Integration with Match:**
 * Every constructed variant carries `{ readonly tag: K }`, which is the
 * same discriminant shape that `Match.with({ tag: K })` uses for
 * `Extract`/`Exclude` narrowing and exhaustive checking.
 */

// ── Variant types ────────────────────────────────────────────────────────────

/**
 * Variant definition: `null` means unit (no payload), a function means
 * the variant carries a payload produced by calling that factory.
 */
type VariantDef = null | ((...args: never[]) => Record<string, unknown>);

/**
 * The instance type for a single variant.
 *
 * Unit variants produce `{ readonly tag: K }`.
 * Payload variants produce `{ readonly tag: K } & Readonly<R>` where
 * `R` is the return type of the factory function.
 */
type VariantInstance<K extends string, V> = V extends null
  ? { readonly tag: K }
  : V extends (...args: never[]) => infer R
    ? { readonly tag: K } & Readonly<R>
    : never;

// ── ADT object type ──────────────────────────────────────────────────────────

/**
 * The full ADT constructor object type.
 *
 * For each variant key `K` in the config:
 * - If `null`: a zero-arg constructor returning `{ readonly tag: K }`
 * - If a function: a constructor with the same args, returning
 *   `{ readonly tag: K } & Readonly<ReturnType<factory>>`
 *
 * Also includes a frozen `.is` namespace of type guards.
 */
type ADTObject<Config extends Record<string, VariantDef>> = {
  readonly [K in keyof Config & string]: Config[K] extends null
    ? () => { readonly tag: K }
    : Config[K] extends (...args: infer A) => infer R
      ? (...args: A) => { readonly tag: K } & Readonly<R>
      : never;
} & {
  readonly is: {
    readonly [K in keyof Config & string]: (
      value: unknown,
    ) => value is VariantInstance<K, Config[K]>;
  };
};

// ── Implementation ───────────────────────────────────────────────────────────

/**
 * Create an algebraic data type from a variant configuration.
 *
 * Each key in `config` becomes a tagged variant constructor. Unit variants
 * (value `null`) return a cached frozen singleton. Payload variants call
 * the factory function and freeze the result. The returned ADT object is
 * itself frozen, as is the `.is` guards namespace.
 *
 * @example
 * ```ts
 * const Color = ADT({
 *   Red: null,
 *   Green: null,
 *   Blue: (intensity: number) => ({ intensity }),
 * });
 *
 * const c = Color.Blue(0.8);     // { readonly tag: "Blue"; readonly intensity: number }
 * Color.is.Blue(c);              // true (type guard)
 *
 * // Works with Match for exhaustive pattern matching:
 * Match(c)
 *   .with({ tag: "Red" }, () => "red")
 *   .with({ tag: "Green" }, () => "green")
 *   .with({ tag: "Blue" }, b => `blue:${b.intensity}`)
 *   .exhaustive();
 *
 * // Extract the union type:
 * type Color = ADT.Infer<typeof Color>;
 * // = { readonly tag: "Red" } | { readonly tag: "Green" } | { readonly tag: "Blue"; readonly intensity: number }
 * ```
 */
export const ADT = <Config extends Record<string, VariantDef>>(
  config: Config,
): ADTObject<Config> => {
  const constructors: Record<string, unknown> = {};
  const guards: Record<string, unknown> = {};

  for (const key of Object.keys(config)) {
    const def = config[key];
    if (def === null) {
      // Unit variant: cached frozen singleton
      const instance = Object.freeze({ tag: key });
      constructors[key] = () => instance;
    } else {
      // Payload variant: factory + freeze
      constructors[key] = (...args: unknown[]) => {
        const payload = (def as (...a: unknown[]) => Record<string, unknown>)(...args);
        return Object.freeze(Object.assign({ tag: key }, payload));
      };
    }
    guards[key] = (value: unknown): boolean =>
      value !== null &&
      typeof value === "object" &&
      (value as Record<string, unknown>)["tag"] === key;
  }

  constructors["is"] = Object.freeze(guards);
  return Object.freeze(constructors) as ADTObject<Config>;
};

// ── Namespace merge for ADT.Infer ────────────────────────────────────────────

/** Type-level utilities for algebraic data types. */
export namespace ADT {
  /** Helper: extracts the return type of a constructor function. */
  export type ConstructorReturn<T> = T extends (...args: never[]) => infer R ? R : never;

  /** Extract the full discriminated union type from an ADT value. */
  export type Infer<T> = ConstructorReturn<T[keyof Omit<T, "is"> & string]>;
}
