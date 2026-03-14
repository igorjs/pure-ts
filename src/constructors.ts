// ═══════════════════════════════════════════════════════════════════════════════
// Public Constructors
// ═══════════════════════════════════════════════════════════════════════════════

import { createListProxy, type ImmutableList } from './list.js';
import { createRecord, type ImmutableRecord } from './record.js';

/**
 * Create an immutable record from a plain object.
 *
 * The input is deep-frozen and wrapped with type-safe methods:
 * `.set()`, `.update()`, `.produce()`, `.merge()`, `.at()`, `.equals()`.
 * Nested objects are automatically wrapped as records on access.
 *
 * @example
 * ```ts
 * const user = Record({ name: 'John', age: 21 });
 * const older = user.update(u => u.age, a => a + 1);
 * ```
 */
export const Record = <T extends object>(obj: T): ImmutableRecord<T> => createRecord(obj);

/**
 * Create an immutable record from a deep clone of the input.
 *
 * Use when the source object may be mutated after construction.
 * The clone is made via `structuredClone` before freezing.
 *
 * @example
 * ```ts
 * const source = { name: 'External' };
 * const safe = Record.clone(source);
 * source.name = 'Mutated'; // safe.name is still 'External'
 * ```
 */
Record.clone = <T extends object>(obj: T): ImmutableRecord<T> => createRecord(structuredClone(obj));

/**
 * Create an immutable list from an array.
 *
 * The underlying array is frozen and wrapped with functional methods:
 * `.map()`, `.filter()`, `.find()`, `.append()`, `.sortBy()`, etc.
 * Nested objects are automatically wrapped as records on index access.
 *
 * @example
 * ```ts
 * const nums = List([3, 1, 4]);
 * const sorted = nums.sortBy((a, b) => a - b);
 * ```
 */
export const List = <T>(items: readonly T[]): ImmutableList<T> => createListProxy(items);

/**
 * Create an immutable list from a deep clone of the input.
 *
 * Use when the source array may be mutated after construction.
 *
 * @example
 * ```ts
 * const source = [{ id: 1 }];
 * const safe = List.clone(source);
 * source[0].id = 999; // safe[0].id is still 1
 * ```
 */
List.clone = <T>(items: readonly T[]): ImmutableList<T> =>
  createListProxy(structuredClone(items) as T[]);

/**
 * Type guard: returns `true` if `val` is an ImmutableRecord or ImmutableList.
 *
 * @example
 * ```ts
 * isImmutable(Record({ x: 1 }));  // true
 * isImmutable({});                  // false
 * ```
 */
export const isImmutable = (
  val: unknown,
): val is ImmutableRecord<object> | ImmutableList<unknown> =>
  val !== null &&
  typeof val === 'object' &&
  '$immutable' in val &&
  (val as Record<string, unknown>)['$immutable'] === true;
