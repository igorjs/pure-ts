/**
 * @module lens
 *
 * Composable optics for reading and updating nested immutable data.
 *
 * **Why Lens instead of direct .set()/.update()?**
 * Record's `.set()` and `.update()` work for one level. For deeply nested
 * structures, you need to chain multiple updates. Lenses compose: build
 * a lens for each nesting level, compose them, and apply the composed lens
 * to read or update any depth in one pass. The curried API integrates
 * naturally with `pipe` and `flow`.
 *
 * **Lens vs Optional:**
 * A Lens always succeeds (the target exists). An Optional may miss
 * (returns Option). Use Lens for required fields, Optional for nullable
 * fields and array indices.
 */

import type { Option } from "./option.js";
import { None, Some } from "./option.js";

// ── Lens ────────────────────────────────────────────────────────────────────

/**
 * A total optic: the target always exists in the source.
 *
 * @example
 * ```ts
 * const name = Lens.prop<User>()('name');
 * name.get(user);              // 'Alice'
 * name.set('Bob')(user);       // { ...user, name: 'Bob' }
 * name.modify(s => s.toUpperCase())(user);
 * ```
 */
export interface Lens<S, A> {
  readonly get: (source: S) => A;
  readonly set: (value: A) => (source: S) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: Lens<A, B>) => Lens<S, B>;
  readonly composeOptional: <B>(other: LensOptional<A, B>) => LensOptional<S, B>;
}

/**
 * A partial optic: the target may not exist in the source.
 *
 * @example
 * ```ts
 * const at1 = LensOptional.index<number>(1);
 * at1.getOption([10, 20, 30]); // Some(20)
 * at1.getOption([10]);         // None
 * ```
 */
export interface LensOptional<S, A> {
  readonly getOption: (source: S) => Option<A>;
  readonly set: (value: A) => (source: S) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: LensOptional<A, B>) => LensOptional<S, B>;
}

// ── Lens implementation ─────────────────────────────────────────────────────

const createLens = <S, A>(get: (s: S) => A, set: (a: A, s: S) => S): Lens<S, A> => {
  const lens: Lens<S, A> = Object.freeze({
    get,
    set: (value: A) => (source: S) => set(value, source),
    modify: (fn: (a: A) => A) => (source: S) => set(fn(get(source)), source),
    compose: <B>(other: Lens<A, B>): Lens<S, B> =>
      createLens(
        (s: S) => other.get(get(s)),
        (b: B, s: S) => set(other.set(b)(get(s)), s),
      ),
    composeOptional: <B>(other: LensOptional<A, B>): LensOptional<S, B> =>
      createOptional(
        (s: S) => other.getOption(get(s)),
        (b: B, s: S) => set(other.set(b)(get(s)), s),
      ),
  });
  return lens;
};

// ── Optional implementation ─────────────────────────────────────────────────

const createOptional = <S, A>(
  getOption: (s: S) => Option<A>,
  set: (a: A, s: S) => S,
): LensOptional<S, A> => {
  const optional: LensOptional<S, A> = Object.freeze({
    getOption,
    set: (value: A) => (source: S) => set(value, source),
    modify: (fn: (a: A) => A) => (source: S) => {
      const current = getOption(source);
      return current.isSome ? set(fn(current.value), source) : source;
    },
    compose: <B>(other: LensOptional<A, B>): LensOptional<S, B> =>
      createOptional(
        (s: S) => {
          const a = getOption(s);
          return a.isSome ? other.getOption(a.value) : None;
        },
        (b: B, s: S) => {
          const a = getOption(s);
          return a.isSome ? set(other.set(b)(a.value), s) : s;
        },
      ),
  });
  return optional;
};

// ── Public Lens namespace ───────────────────────────────────────────────────

/**
 * Create composable lenses for immutable data access and updates.
 *
 * @example
 * ```ts
 * // Single property lens
 * const name = Lens.prop<User>()('name');
 *
 * // Composed deep lens
 * const street = Lens.prop<User>()('address')
 *   .compose(Lens.prop<Address>()('street'));
 *
 * // With pipe
 * pipe(user, street.modify(s => s.toUpperCase()));
 *
 * // Custom lens
 * const myLens = Lens.from(getter, setter);
 * ```
 */
export const Lens: {
  readonly prop: <S>() => <K extends keyof S>(key: K) => Lens<S, S[K]>;
  readonly from: <S, A>(get: (s: S) => A, set: (a: A, s: S) => S) => Lens<S, A>;
  readonly id: <S>() => Lens<S, S>;
} = {
  prop:
    <S>() =>
    <K extends keyof S>(key: K): Lens<S, S[K]> =>
      createLens(
        (s: S) => s[key],
        (a: S[K], s: S) => ({ ...s, [key]: a }) as S,
      ),

  from: <S, A>(get: (s: S) => A, set: (a: A, s: S) => S): Lens<S, A> => createLens(get, set),

  id: <S>(): Lens<S, S> =>
    createLens(
      (s: S) => s,
      (a: S) => a,
    ),
};

// ── Public Optional namespace ───────────────────────────────────────────────

/**
 * Create composable optionals for partial data access.
 *
 * @example
 * ```ts
 * // Array index access
 * const second = LensOptional.index<number>(1);
 * second.getOption([10, 20]); // Some(20)
 * second.getOption([10]);     // None
 *
 * // Nullable field
 * const bio = LensOptional.fromNullable<User>()('bio');
 * bio.getOption(user); // Some('...') or None
 * ```
 */
export const LensOptional: {
  readonly index: <T>(i: number) => LensOptional<readonly T[], T>;
  readonly fromNullable: <S>() => <K extends keyof S>(key: K) => LensOptional<S, NonNullable<S[K]>>;
  readonly from: <S, A>(
    getOption: (s: S) => Option<A>,
    set: (a: A, s: S) => S,
  ) => LensOptional<S, A>;
} = {
  index: <T>(i: number): LensOptional<readonly T[], T> =>
    createOptional(
      (arr: readonly T[]) => {
        const n = i < 0 ? arr.length + i : i;
        return n >= 0 && n < arr.length ? Some(arr[n] as T) : None;
      },
      (value: T, arr: readonly T[]) => {
        const n = i < 0 ? arr.length + i : i;
        if (n < 0 || n >= arr.length) return arr;
        const copy = arr.slice() as T[];
        copy[n] = value;
        return copy;
      },
    ),

  fromNullable:
    <S>() =>
    <K extends keyof S>(key: K): LensOptional<S, NonNullable<S[K]>> =>
      createOptional(
        (s: S) => {
          const v = s[key];
          return v === null || v === undefined ? None : Some(v as NonNullable<S[K]>);
        },
        (a: NonNullable<S[K]>, s: S) => ({ ...s, [key]: a }) as S,
      ),

  from: <S, A>(getOption: (s: S) => Option<A>, set: (a: A, s: S) => S): LensOptional<S, A> =>
    createOptional(getOption, set),
};

// ── Prism ───────────────────────────────────────────────────────────────────

/**
 * A prism focuses on a variant of a sum type (e.g., Result.Ok, Option.Some).
 *
 * `getOption` extracts the value if the variant matches; `reverseGet`
 * constructs the sum type from the focused value.
 *
 * @example
 * ```ts
 * const okPrism = Prism.from<Result<number, string>, number>(
 *   r => r.isOk ? Some(r.value) : None,
 *   Ok,
 * );
 * okPrism.getOption(Ok(42));  // Some(42)
 * okPrism.getOption(Err('x')); // None
 * okPrism.reverseGet(42);     // Ok(42)
 * ```
 */
export interface Prism<S, A> {
  readonly getOption: (source: S) => Option<A>;
  readonly reverseGet: (value: A) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: Prism<A, B>) => Prism<S, B>;
  readonly toOptional: () => LensOptional<S, A>;
}

const createPrism = <S, A>(getOption: (s: S) => Option<A>, reverseGet: (a: A) => S): Prism<S, A> =>
  Object.freeze({
    getOption,
    reverseGet,
    modify:
      (fn: (a: A) => A) =>
      (source: S): S => {
        const current = getOption(source);
        return current.isSome ? reverseGet(fn(current.value)) : source;
      },
    compose: <B>(other: Prism<A, B>): Prism<S, B> =>
      createPrism(
        (s: S) => {
          const a = getOption(s);
          return a.isSome ? other.getOption(a.value) : None;
        },
        (b: B) => reverseGet(other.reverseGet(b)),
      ),
    toOptional: (): LensOptional<S, A> => createOptional(getOption, (a: A) => reverseGet(a)),
  });

/**
 * Create prisms for focusing on sum type variants.
 *
 * @example
 * ```ts
 * const strPrism = Prism.from<string | number, string>(
 *   v => typeof v === 'string' ? Some(v) : None,
 *   s => s,
 * );
 * ```
 */
export const Prism: {
  readonly from: <S, A>(getOption: (s: S) => Option<A>, reverseGet: (a: A) => S) => Prism<S, A>;
} = {
  from: createPrism,
};

// ── Iso ────────────────────────────────────────────────────────────────────

/**
 * An isomorphism: a lossless, invertible transformation between two types.
 *
 * If you can convert S to A and A back to S without losing information,
 * that relationship is an Iso. Every Iso can be used as a Lens, a Prism,
 * or reversed to swap the direction.
 *
 * @example
 * ```ts
 * const celsiusToFahrenheit = Iso.from(
 *   (c: number) => c * 9 / 5 + 32,
 *   (f: number) => (f - 32) * 5 / 9,
 * );
 * celsiusToFahrenheit.get(100);        // 212
 * celsiusToFahrenheit.reverseGet(212); // 100
 * ```
 */
export interface Iso<S, A> {
  readonly get: (source: S) => A;
  readonly reverseGet: (value: A) => S;
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly compose: <B>(other: Iso<A, B>) => Iso<S, B>;
  readonly toLens: () => Lens<S, A>;
  readonly toPrism: () => Prism<S, A>;
  readonly reverse: () => Iso<A, S>;
}

const createIso = <S, A>(get: (s: S) => A, reverseGet: (a: A) => S): Iso<S, A> =>
  Object.freeze({
    get,
    reverseGet,
    modify: (fn: (a: A) => A) => (source: S) => reverseGet(fn(get(source))),
    compose: <B>(other: Iso<A, B>): Iso<S, B> =>
      createIso(
        (s: S) => other.get(get(s)),
        (b: B) => reverseGet(other.reverseGet(b)),
      ),
    toLens: (): Lens<S, A> => createLens(get, (a: A) => reverseGet(a)),
    toPrism: (): Prism<S, A> => createPrism((s: S) => Some(get(s)), reverseGet),
    reverse: (): Iso<A, S> => createIso(reverseGet, get),
  });

/**
 * Create isomorphisms for lossless, invertible transformations.
 *
 * @example
 * ```ts
 * const iso = Iso.from(
 *   (s: string) => s.split(''),
 *   (a: string[]) => a.join(''),
 * );
 * iso.get('abc');              // ['a', 'b', 'c']
 * iso.reverseGet(['x', 'y']); // 'xy'
 * ```
 */
export const Iso: {
  readonly from: <S, A>(get: (s: S) => A, reverseGet: (a: A) => S) => Iso<S, A>;
  readonly id: <S>() => Iso<S, S>;
} = {
  from: createIso,
  id: <S>(): Iso<S, S> =>
    createIso(
      (s: S) => s,
      (s: S) => s,
    ),
};

// ── Traversal ───────────────────────────────────────────────────────────────

/**
 * A traversal focuses on zero or more targets within a structure.
 *
 * Unlike a Lens (exactly one target) or Optional (zero or one),
 * a Traversal can read and modify multiple elements at once.
 *
 * @example
 * ```ts
 * const allItems = Traversal.fromArray<number>();
 * allItems.getAll([1, 2, 3]);          // [1, 2, 3]
 * allItems.modify(n => n * 2)([1, 2]); // [2, 4]
 * ```
 */
export interface Traversal<S, A> {
  readonly getAll: (source: S) => readonly A[];
  readonly modify: (fn: (a: A) => A) => (source: S) => S;
  readonly set: (value: A) => (source: S) => S;
}

/**
 * Create traversals for focusing on multiple targets.
 */
export const Traversal: {
  readonly fromArray: <T>() => Traversal<readonly T[], T>;
  readonly from: <S, A>(
    getAll: (s: S) => readonly A[],
    modify: (fn: (a: A) => A, s: S) => S,
  ) => Traversal<S, A>;
} = {
  fromArray: <T>(): Traversal<readonly T[], T> =>
    Object.freeze({
      getAll: (source: readonly T[]) => source,
      modify:
        (fn: (a: T) => T) =>
        (source: readonly T[]): readonly T[] =>
          source.map(fn),
      set:
        (value: T) =>
        (source: readonly T[]): readonly T[] =>
          source.map(() => value),
    }),

  from: <S, A>(
    getAll: (s: S) => readonly A[],
    modify: (fn: (a: A) => A, s: S) => S,
  ): Traversal<S, A> =>
    Object.freeze({
      getAll,
      modify: (fn: (a: A) => A) => (source: S) => modify(fn, source),
      set: (value: A) => (source: S) => modify(() => value, source),
    }),
};
