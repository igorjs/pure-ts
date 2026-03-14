# Pure TS

Immutability micro-framework for TypeScript. Functional programming primitives. Zero dependencies.

```ts
import {
  Record, List, Ok, Err, Some, None,
  Result, Option, match, tryCatch,
  Schema, pipe, flow, Lazy, Task,
  TaggedError, isTaggedError
} from '@igorjs/pure-ts'
```

## Install

```bash
npm install @igorjs/pure-ts
```

Also available on [JSR](https://jsr.io/@igorjs/pure-ts):

```bash
npx jsr add @igorjs/pure-ts
```

Requires Node >= 22 (LTS). Compatible with TypeScript >= 5.5 and TypeScript 7 (`tsgo`).

## Why

JavaScript has no immutability guarantees. `Object.freeze` is shallow. Spread-based updates are verbose and error-prone at depth. This framework gives you:

- **Runtime enforcement**: mutations throw `TypeError`, always
- **Type-level enforcement**: `readonly` all the way down, `tsc --strict` clean
- **Zero-copy construction**: `Object.freeze` in-place, no `structuredClone`
- **Class-per-shape Records**: V8 monomorphic inline caches, near-native read speed
- **Real monads**: `Result` and `Option` as classes with prototype methods, not tagged bags
- **Applicative functors**: `ap()` on both Result and Option for lifted function application
- **Zero dependencies**: ~1650 lines (including JSDoc), ships as ESM

## Quick Start

```ts
// Immutable objects: direct property access, mutations throw
const user = Record({ name: 'Alice', address: { city: 'Sydney' } })
user.name                                    // 'Alice'
user.address.city                            // 'Sydney' (also a Record)
user.name = 'X'                              // TypeError

// Structural updates: always returns new Record
user.set(u => u.address.city, 'Melbourne')
user.update(u => u.name, n => n.toUpperCase())
user.produce(d => { d.name = 'Bob'; d.address.city = 'Melbourne' })
user.merge({ name: 'Bob' })

// Immutable arrays
const nums = List([3, 1, 4])
nums.append(5).sortBy((a, b) => a - b)      // List [1, 3, 4, 5]
nums.find(n => n > 2)                        // Some(3)
nums.at(-1)                                  // Some(4)

// Result monad: errors as values
Ok(42).map(n => n * 2).unwrapOr(0)           // 84
Err('fail').map(n => n * 2).unwrapOr(0)      // 0

// Option monad: null safety
Some(42).filter(n => n > 100)                // None
Option.fromNullable(process.env.PORT)        // Some('3000') or None

// Structured errors as values
const NotFound = TaggedError('NotFound', 'NOT_FOUND')
const err = NotFound('User not found', { userId: 'u_123' })
err.toResult()                                // Result<never, TaggedErrorInstance<...>>

// Schema validation -> immutable output
const UserSchema = Schema.object({
  name: Schema.string,
  age: Schema.number.refine(n => n > 0, 'positive'),
})
UserSchema.parse(jsonData)                   // Result<ImmutableRecord<User>, SchemaError>
```

## API

### Record

| Method | Description |
|---|---|
| `Record(obj)` | Create immutable record. Freezes in-place (caller yields ownership) |
| `Record.clone(obj)` | Deep clone then freeze. Use at trust boundaries |
| `.name` | Direct property read. Nested objects are also Records |
| `.set(u => u.x, val)` | Replace nested value -> new Record |
| `.update(u => u.x, fn)` | Transform nested value -> new Record |
| `.produce(d => { ... })` | Batch mutations via draft -> new Record |
| `.merge({ ... })` | Shallow merge -> new Record |
| `.at(u => u.x)` | Safe deep access -> `Option<R>` |
| `.equals(other)` | Structural deep equality |
| `.toMutable()` | Deep clone escape hatch |
| `.toJSON()` | Raw frozen data (JSON-safe) |
| `.$raw` | Access underlying frozen object |
| `.$immutable` | Brand (`true`) for runtime type checking |

### List

| Method | Description |
|---|---|
| `List(arr)` | Create immutable list |
| `List.clone(arr)` | Deep clone then wrap. Use at trust boundaries |
| `[i]` | Index access. Nested objects are wrapped as Records |
| `.append(v)` / `.prepend(v)` | Add element -> new List |
| `.setAt(i, v)` / `.updateAt(i, fn)` | Modify element -> new List |
| `.removeAt(i)` | Remove element -> new List |
| `.map(fn)` / `.filter(fn)` / `.reduce(fn, init)` | FP operations |
| `.find(fn)` / `.findIndex(fn)` | Search -> `Option` |
| `.at(i)` / `.first()` / `.last()` | Safe access -> `Option` |
| `.sortBy(cmp)` | Sort -> new List |
| `.concat(other)` / `.slice(s, e)` / `.flatMap(fn)` | Collections |
| `.equals(other)` | Structural deep equality |
| `.toMutable()` | Deep clone escape hatch |
| `.toJSON()` | Raw array (JSON-safe) |
| `.$raw` | Access underlying frozen array |
| `.$immutable` | Brand (`true`) for runtime type checking |

### Result\<T, E\>

| Method | Description |
|---|---|
| `Ok(value)` / `Err(error)` | Construct |
| `Result.tryCatch(fn, onError)` | Wrap throwing code |
| `Result.collect([...])` | All-or-nothing collection |
| `Result.match(result, { Ok, Err })` | Standalone pattern match |
| `Result.is(value)` | Type guard for any Result |
| `.map(fn)` / `.mapErr(fn)` | Transform value/error |
| `.flatMap(fn)` | Chain fallible operations |
| `.tap(fn)` / `.tapErr(fn)` | Side effects (no-op on wrong variant) |
| `.match({ Ok, Err })` | Exhaustive pattern match |
| `.unwrap()` | Extract or throw `TypeError` |
| `.unwrapOr(fallback)` / `.unwrapOrElse(fn)` | Extract with fallback |
| `.unwrapErr()` | Extract error or throw `TypeError` |
| `.zip(other)` | Combine two Results -> `Result<[T, U], E>` |
| `.ap(fnResult)` | Applicative apply: `Ok(x).ap(Ok(fn))` -> `Ok(fn(x))` |
| `.toOption()` | -> `Option<T>` (drops error) |
| `.toJSON()` | `{ tag: 'Ok', value }` or `{ tag: 'Err', error }` |
| `.toString()` | `'Ok(42)'` or `'Err(fail)'` |

### TaggedError

| Export | Description |
|---|---|
| `TaggedError(tag, code)` | Define a reusable error constructor. Returns a callable with `.tag`, `.code`, `.is()` |
| `constructor(message, metadata?)` | Create a frozen error instance with tag, code, message, metadata, timestamp, stack |
| `.tag` / `.name` | Literal string discriminant (same value) |
| `.code` | Literal string code |
| `.message` | Human-readable description |
| `.metadata` | Deep-frozen `Record<string, unknown>` (defaults `{}`) |
| `.timestamp` | Epoch milliseconds at construction |
| `.stack` | Stack trace string (V8 `captureStackTrace` where available, `Error().stack` fallback) |
| `.toResult<T>()` | Wrap in `Err(this)` -> `Result<T, TaggedErrorInstance>` |
| `.toJSON()` | Serialise all fields except `stack` |
| `.toString()` | `'Tag(CODE): message'` |
| `Constructor.is(value)` | Type guard for specific error type |
| `isTaggedError(value)` | Type guard for any TaggedError instance |

### Option\<T\>

| Method | Description |
|---|---|
| `Some(value)` / `None` | Construct |
| `Option.fromNullable(v)` | `null`/`undefined` -> `None`, else `Some` |
| `Option.collect([...])` | All-or-nothing collection |
| `Option.match(option, { Some, None })` | Standalone pattern match |
| `Option.is(value)` | Type guard for any Option |
| `.map(fn)` / `.flatMap(fn)` / `.filter(fn)` | Transform |
| `.tap(fn)` | Side effect on Some (no-op on None) |
| `.match({ Some, None })` | Exhaustive pattern match |
| `.unwrap()` | Extract or throw `TypeError` |
| `.unwrapOr(v)` / `.unwrapOrElse(fn)` | Extract with fallback |
| `.zip(other)` / `.or(other)` | Combine |
| `.ap(fnOption)` | Applicative apply: `Some(x).ap(Some(fn))` -> `Some(fn(x))` |
| `.toResult(error)` | -> `Result<T, E>` |
| `.toJSON()` | `{ tag: 'Some', value }` or `{ tag: 'None' }` |
| `.toString()` | `'Some(42)'` or `'None'` |

### Schema

| Method | Description |
|---|---|
| `Schema.string` / `.number` / `.boolean` | Primitive validators |
| `Schema.object({ ... })` | Object shape validator |
| `Schema.array(el)` / `.tuple(a, b, ...)` | Collection validators |
| `Schema.literal(v)` / `.union(a, b, ...)` | Discriminated types |
| `Schema.record(val)` | String-keyed map validator |
| `.parse(unknown)` | -> `Result<ImmutableRecord<T>, SchemaError>` |
| `.is(unknown)` | Type guard |
| `.refine(pred, label)` | Add validation predicate |
| `.transform(fn)` | Post-parse transform |
| `.optional()` / `.default(v)` | Nullability handling |
| `Schema.Infer<typeof S>` | Extract TypeScript type |

### Utilities

| Export | Description |
|---|---|
| `pipe(val, f1, f2, ...)` | Data-first left-to-right transformation (1-9 stages) |
| `flow(f1, f2, ...)` | Point-free function composition (1-6 stages) |
| `Lazy(() => expr)` | Deferred and cached computation. `.value` triggers evaluation |
| `Task(async () => ...)` | Composable async Result. `.run()` executes. Supports `map`, `flatMap`, `tap`, `tapErr`, `unwrapOr`, `zip` |
| `Task.of(v)` / `Task.fromResult(r)` / `Task.fromPromise(fn)` | Task constructors |
| `Task.all([...])` | Run tasks in parallel, collect results |
| `Type<'Name', Base>` | Nominal typing, zero runtime. `type UserId = Type<'UserId', string>` |
| `match(value, arms)` | Standalone pattern match for Result or Option |
| `tryCatch(fn, onError)` | Standalone alias for `Result.tryCatch` |
| `isImmutable(val)` | Type guard for Records and Lists |
| `DeepReadonly<T>` | Recursive readonly type utility |

## Performance

Class-per-shape Records eliminate Proxy from the read path:

| Operation | ops/s | vs plain JS |
|---|---|---|
| Shallow read (`user.name`) | 207M | ~0.86x (near native) |
| Deep read (`user.address.geo.lat`) | 19M | ~0.09x |
| Construction | 192K | - |
| `set()` shallow | 328K | - |
| `produce()` 3 mutations | 193K | - |
| `Ok(42)` | 48M | - |
| `Ok().map().map().map()` | 35M | - |

Memory per Record instance: ~410 bytes (vs ~376 bytes plain object = 1.09x overhead).

## Building

```bash
# Type check (TS7)
npm run check

# Build
npm run build

# Test runtime (104 tests)
npm test

# Test types (compile-time safety suite)
npm run test:types

# Full prepublish pipeline
npm run prepublishOnly
```

## License

Apache-2.0
