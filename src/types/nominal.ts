/**
 * @module nominal
 *
 * Phantom-branded nominal types for compile-time domain safety.
 *
 * **Why nominal typing?**
 * TypeScript uses structural typing: a `string` is a `string` regardless of
 * what it represents. `UserId` and `PostId` would be interchangeable. Nominal
 * types brand the base type with a unique phantom property that exists only
 * in the type system, preventing accidental misuse at zero runtime cost.
 *
 * **How to use with Schema:**
 * Combine `Schema.string.refine(...).transform(s => s as UserId)` to get
 * validated, runtime-checked nominal values at trust boundaries.
 */

/**
 * Nominal typing via phantom brand. Zero runtime cost - pure type-level.
 *
 * Parameter order reads as English: "Type UserId is a string".
 *
 *   type UserId = Type<'UserId', string>;
 *   type PostId = Type<'PostId', string>;
 *   type Latitude = Type<'Latitude', number>;
 *
 *   const userId = 'u_001' as UserId;
 *   const postId = 'p_001' as PostId;
 *
 *   function getUser(id: UserId) { ... }
 *   getUser(userId)   // ✓
 *   getUser(postId)   // TS error: PostId is not assignable to UserId
 *
 * Pairs with Schema for validated construction:
 *
 *   const UserId = Schema.string
 *     .refine(s => s.startsWith('u_'), 'UserId format')
 *     .transform(s => s as Type<'UserId', string>);
 */
/** Phantom-branded nominal type. `Type<Name, Base>` brands `Base` with a compile-time-only `Name` tag. */
export type Type<Name extends string, Base> = Base & { readonly __brand: Name };
