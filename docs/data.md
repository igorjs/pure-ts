# Data

Immutable data structures, validation, and algebraic data types.

## Record

Deeply frozen immutable objects with typed updates.

```ts
import { Record } from '@igorjs/pure-ts'

const user = Record({ name: 'Alice', age: 30, tags: ['admin'] });

user.name;       // 'Alice' (direct property access)
user.tags[0];    // 'admin'

// Immutable updates via produce (immer-style)
const older = user.produce(d => { d.age = 31; });
older.age; // 31
user.age;  // 30 (unchanged)

// Mutations throw TypeError
user.name = 'Bob'; // TypeError: Cannot assign to read only property
```

## List

Immutable array with functional methods.

```ts
import { List } from '@igorjs/pure-ts'

const nums = List([3, 1, 4, 1, 5]);

nums.length;           // 5
nums[0];               // 3
nums.map(n => n * 2);  // List([6, 2, 8, 2, 10])
nums.filter(n => n > 2); // List([3, 4, 5])
nums.sort((a, b) => a - b); // List([1, 1, 3, 4, 5])
nums.uniqBy(n => n);   // List([3, 1, 4, 5])
nums.groupBy(n => n > 3 ? 'big' : 'small');
// { big: [4, 5], small: [3, 1, 1] }
```

## NonEmptyList

List guaranteed to have at least one element. Enables `reduce1` without initial value.

```ts
import { NonEmptyList } from '@igorjs/pure-ts'

const nel = NonEmptyList.of(1, 2, 3);
nel.head;              // 1
nel.tail;              // [2, 3]
nel.reduce1((a, b) => a + b); // 6 (no init needed)
```

## Schema

Composable runtime validators that parse unknown input into typed values.

```ts
import { Schema } from '@igorjs/pure-ts'

// Primitives
Schema.string.parse('hello');      // Ok('hello')
Schema.number.parse('not a num');  // Err({ expected: 'number', ... })

// Object shapes
const UserSchema = Schema.object({
  name: Schema.string,
  age: Schema.number,
  role: Schema.enum(['admin', 'user', 'guest']),
  email: Schema.email,
});
type User = Schema.Infer<typeof UserSchema>;

const result = UserSchema.parse(untrustedInput);
// Result<User, SchemaError>

// Composable
Schema.string
  .refine(s => s.length > 0, 'non-empty')
  .transform(s => s.toUpperCase())
  .optional()
  .default('ANONYMOUS');

// Recursive types
type Tree = { value: number; children: readonly Tree[] };
const TreeSchema: Schema.SchemaType<Tree> = Schema.object({
  value: Schema.number,
  children: Schema.array(Schema.lazy(() => TreeSchema)),
});

// Date parsing
Schema.date.parse('2024-01-15T10:30:00Z'); // Ok(Date)

// Available validators
Schema.string / .number / .boolean
Schema.email / .url / .uuid / .isoDate / .date
Schema.regex(pattern) / .nonEmpty / .minLength(n) / .maxLength(n)
Schema.int / .min(n) / .max(n) / .range(lo, hi) / .positive / .nonNegative
Schema.enum(values) / .literal(value)
Schema.object(shape) / .array(schema) / .tuple(...schemas)
Schema.union(...schemas) / .discriminatedUnion(key, mapping)
Schema.intersection(a, b) / .record(valueSchema) / .lazy(factory)
```

## Codec

Bidirectional encode/decode paired with Schema validation.

```ts
import { Codec, Schema } from '@igorjs/pure-ts'

const DateCodec = Codec.from(
  Schema.string.refine(s => !isNaN(Date.parse(s)), 'date string'),
  s => new Date(s),       // decode
  d => d.toISOString(),   // encode
);

DateCodec.decode('2024-01-15T00:00:00Z'); // Ok(Date)
DateCodec.encode(new Date());              // '2024-...'
```

## ADT

Generic algebraic data type (discriminated union) factory.

```ts
import { ADT, Match } from '@igorjs/pure-ts'

// Define variants
const Color = ADT({
  Red: null,                                    // unit (no payload)
  Green: null,
  Blue: (intensity: number) => ({ intensity }), // with payload
});

// Construct
const r = Color.Red();     // { tag: 'Red' } (frozen singleton)
const b = Color.Blue(0.8); // { tag: 'Blue', intensity: 0.8 } (frozen)

// Type guards
Color.is.Red(r);   // true, narrows type
Color.is.Blue(r);  // false

// Extract the union type
type ColorType = ADT.Infer<typeof Color>;
// = { tag: 'Red' } | { tag: 'Green' } | { tag: 'Blue'; intensity: number }

// Exhaustive matching (works with Match)
const hex = Match(b as ColorType)
  .with({ tag: 'Red' }, () => '#ff0000')
  .with({ tag: 'Green' }, () => '#00ff00')
  .with({ tag: 'Blue' }, v => `rgba(0,0,255,${v.intensity})`)
  .exhaustive(); // compile error if a variant is missing

// Multi-field payloads
const Shape = ADT({
  Circle: (radius: number) => ({ radius }),
  Rect: (w: number, h: number) => ({ width: w, height: h }),
  Point: null,
});
```

## StableVec

Dense, index-stable collection with O(1) insert, remove, and access. Elements are referenced by handles that survive mutations to other elements.

```ts
import { StableVec } from '@igorjs/pure-ts'

const vec = StableVec.create<{ x: number; y: number }>();
const h1 = vec.insert({ x: 1, y: 2 });
const h2 = vec.insert({ x: 3, y: 4 });

vec.get(h1);     // Some({ x: 1, y: 2 })
vec.length;      // 2

vec.remove(h1);  // true
vec.get(h1);     // None (handle invalidated)
vec.isValid(h1); // false
vec.length;      // 1

// Dense iteration (no gaps, cache-friendly)
for (const item of vec) {
  console.log(item.x, item.y);
}

// Iterate with handles
for (const [handle, value] of vec.entries()) {
  console.log(handle, value);
}

vec.toArray();   // snapshot as plain array
vec.clear();     // remove all elements
```

**When to use:** long-lived collections with frequent insert/remove where external code holds references (game loops, simulations, ECS).

**When NOT to use:** short-lived arrays or ordered collections (removal reorders via swap).
