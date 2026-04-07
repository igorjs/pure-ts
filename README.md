# Pure TS

Functional application framework for TypeScript. Zero dependencies.

Errors are values, not exceptions. Data is immutable, enforced at runtime. Async is lazy and composable. The type system carries everything.

```ts
import {
  // Core
  Result, Option, pipe, flow, Match, Eq, Ord, State,
  Lens, LensOptional, Prism, Traversal,
  // Data
  Record, List, NonEmptyList, Schema, Codec,
  // Types
  ErrType, Duration, Cron,
  // Async
  Task, Stream, Lazy, Env, Retry, CircuitBreaker,
  Semaphore, Mutex, RateLimiter, Cache, Channel,
  // IO
  Json, File, Client,
  // Runtime
  Server, Program, Logger, Config, WebSocket,
  Path, Eol, Platform,
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

## What's in the box

| Layer | Primitives |
|-------|------------|
| **Core** | `Result`, `Option`, `pipe`, `flow`, `Match`, `Eq`, `Ord`, `State`, `Lens`, `Prism`, `Traversal` |
| **Data** | `Record`, `List`, `NonEmptyList`, `Schema`, `Codec` |
| **Types** | `Type` (nominal branding), `ErrType`, `Duration`, `Cron` |
| **Async** | `Task`, `Stream`, `Lazy`, `Env`, `Retry`, `CircuitBreaker`, `Semaphore`, `Mutex`, `RateLimiter`, `Cache`, `Channel` |
| **IO** | `Json`, `File`, `Client` (HTTP), `WebSocket` |
| **Runtime** | `Server`, `Program`, `Logger`, `Config`, `Path`, `Eol`, `Platform`, adapters for Node, Deno, Bun, Lambda |

## Why

- **Runtime enforcement**: mutations on Records and Lists throw `TypeError`
- **Type-level enforcement**: `readonly` all the way down, `tsc --strict` clean
- **Errors as values**: `Result<T, E>` replaces try/catch, making failure explicit
- **Lazy async**: `Task` and `Stream` describe work without executing it
- **Composable optics**: `Lens`, `Prism`, `Traversal` for immutable nested updates
- **Boundary validation**: `Schema` parses unknown input into typed values
- **Resilience**: `Retry`, `CircuitBreaker`, `RateLimiter`, `Semaphore` for production systems
- **Safe IO**: `Json.parse`, `File.read`, `Client.get` return `Result`/`Task`, never throw
- **Production-ready server**: trie-based routing, typed middleware, graceful shutdown
- **Zero dependencies**: ships as ESM

## Quick start

### Immutable data

```ts
const user = Record({ name: 'Alice', address: { city: 'Sydney' } })
user.name                                    // 'Alice'
user.address.city                            // 'Sydney' (also a Record)
user.name = 'X'                              // TypeError

user.set(u => u.address.city, 'Melbourne')   // new Record
user.produce(d => { d.name = 'Bob' })        // batch mutations via draft

const nums = List([3, 1, 4])
nums.sortByOrd(Ord.number)                   // List [1, 3, 4]
nums.uniqBy(Eq.number)                       // deduplicated
nums.groupBy(n => n > 2 ? 'big' : 'small')  // { big: List[3,4], small: List[1] }

const nel = NonEmptyList.of(1, 2, 3)
nel.first()                                  // 1 (not Option, guaranteed)
nel.reduce1((a, b) => a + b)                 // 6 (no init needed)
```

### Error handling

```ts
const parseAge = (input: unknown): Result<number, string> =>
  typeof input === 'number' && input > 0 ? Ok(input) : Err('invalid age')

parseAge(25).map(n => n + 1).unwrapOr(0)     // 26
parseAge('x').map(n => n + 1).unwrapOr(0)    // 0

// traverse: map + collect in one pass
Result.traverse(['1', '2'], s => parseAge(Number(s)))  // Ok([1, 2])

// Structured errors
const NotFound = ErrType('NotFound')          // code: 'NOT_FOUND' (auto-derived)
NotFound('User not found', { id: 'u_123' })
  .toResult()                                 // Result<never, ErrType<'NotFound'>>

// Exhaustive pattern matching
Match(result)
  .with({ tag: 'Ok' }, r => r.value)
  .with({ tag: 'Err' }, r => r.error)
  .exhaustive()
```

### Validation

```ts
const UserSchema = Schema.object({
  name: Schema.string,
  age: Schema.number.refine(n => n > 0, 'positive'),
  role: Schema.discriminatedUnion('type', {
    admin: Schema.object({ type: Schema.literal('admin'), level: Schema.number }),
    user: Schema.object({ type: Schema.literal('user') }),
  }),
})

UserSchema.parse(untrustedInput)              // Result<User, SchemaError>

// Bidirectional: decode + encode
const DateCodec = Codec.from(
  (input: unknown) => typeof input === 'string'
    ? Ok(new Date(input)) : Err({ path: [], expected: 'ISO string', received: typeof input }),
  (date: Date) => date.toISOString(),
)
```

### Async pipelines

```ts
const fetchUser = Task.fromPromise(
  () => fetch('/api/user').then(r => r.json()),
  e => String(e),
)

// Lazy: nothing executes until .run()
const pipeline = fetchUser
  .map(user => user.name)
  .timeout(Duration.seconds(5), () => 'timeout')

await pipeline.run()                          // Result<string, string>

// Retry with exponential backoff
const policy = Retry.policy()
  .maxAttempts(3)
  .exponentialBackoff(Duration.seconds(1))
  .jitter()
  .build()

Retry.apply(policy, fetchUser)

// Circuit breaker for cascading failure protection
const breaker = CircuitBreaker.create({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: Duration.seconds(30),
})
const protected = breaker.protect(fetchUser)
```

### Streams

```ts
// Lazy pull-based async sequences
const numbers = Stream.of(1, 2, 3, 4, 5)
const result = await numbers
  .filter(n => n % 2 === 0)
  .map(n => n * 10)
  .collect()
  .run()                                      // Ok([20, 40])

// Sliding window, groupBy, scan
Stream.interval(Duration.seconds(1))
  .take(10)
  .window(3)                                  // overlapping windows of 3
  .scan((sum, w) => sum + w.length, 0)        // running total
```

### Optics

```ts
type User = { name: string; address: { city: string } }

const city = Lens.prop<User>()('address')
  .compose(Lens.prop<{ city: string }>()('city'))

city.get(user)                                // 'Sydney'
pipe(user, city.set('Melbourne'))             // new object, city changed
pipe(user, city.modify(s => s.toUpperCase())) // new object, city uppercased

// Array index access (partial: returns Option)
const second = LensOptional.index<number>(1)
second.getOption([10, 20, 30])                // Some(20)
second.getOption([10])                        // None
```

### HTTP Server

```ts
import { bunAdapter } from '@igorjs/pure-ts/runtime/adapter/bun'

const app = Server('api')
  .derive(req => Task.of({ requestId: crypto.randomUUID() }))
  .get('/health', () => json({ ok: true }))
  .get('/users/:id', ctx => json({ id: ctx.params.id, rid: ctx.requestId }))
  .post('/users', ctx => Task(async () => {
    const body = await ctx.req.json()
    return Ok(json(body, { status: 201 }))
  }))
  .listen({ port: 3000 }, bunAdapter)

await app.run()
// Handles SIGINT/SIGTERM, graceful shutdown, structured logging
```

Runtime adapters:

```ts
import { nodeAdapter } from '@igorjs/pure-ts/runtime/adapter/node'
import { denoAdapter } from '@igorjs/pure-ts/runtime/adapter/deno'
import { bunAdapter } from '@igorjs/pure-ts/runtime/adapter/bun'
import { lambdaAdapter } from '@igorjs/pure-ts/runtime/adapter/lambda'
```

### Typed time

```ts
const timeout = Duration.seconds(30)
const backoff = Duration.multiply(timeout, 2)
Duration.format(backoff)                      // '1m'
Duration.toMilliseconds(backoff)              // 60000
Duration.ord.compare(timeout, backoff)        // -1

const schedule = Cron.parse('0 9 * * 1-5')   // Result<CronExpression, SchemaError>
if (schedule.isOk) {
  Cron.next(schedule.value)                   // Option<Date> (next 9am weekday)
  Cron.matches(schedule.value, new Date())    // boolean
}
```

### Safe IO

```ts
// JSON: returns Result instead of throwing
Json.parse('{"name":"Alice"}')              // Ok({ name: 'Alice' })
Json.parse('not json')                      // Err(JsonError('...'))
Json.stringify(data)                        // Ok('{"name":"Alice"}')

// File: returns Task, never throws
const content = await File.read('./config.json').run()
await File.write('./out.json', data).run()
await File.makeDir('./logs').run()
File.exists('./config.json')                // Task<boolean, FileError>
```

### HTTP Client

```ts
const api = Client.create({
  baseUrl: 'https://api.example.com',
  headers: { Authorization: 'Bearer token' },
})

const result = await api.get('/users').run()
// Ok(ClientResponse) or Err(NetworkError | HttpError)

if (result.isOk) {
  const users = await result.value.json()   // Result<T, ParseError>
}
```

### Dependency injection

```ts
type Deps = { db: Database; logger: Logger }

const getUser = (id: string) =>
  Env.access<Deps>().flatMap(({ db }) =>
    Env.fromSync(() => db.query(id))
  )

// Provide dependencies at the edge
await getUser('u_123').run({ db: realDb, logger: realLogger })
```

### Resilience

```ts
// Semaphore: limit concurrent access
const sem = Semaphore.create(3)
const limited = sem.wrap(expensiveTask)

// Rate limiter: token bucket
const limiter = RateLimiter.create({
  capacity: 100,
  refillRate: 10,
  refillInterval: Duration.seconds(1),
})
limiter.wrap(apiCall)                       // Err(RateLimited) when empty

// Cache: TTL + LRU
const cache = Cache.create({ ttl: Duration.minutes(5), maxSize: 1000 })
cache.set('key', value)
cache.get('key')                            // Option<V>
cache.getOrElse('key', fetchFromDb)         // cache-aside pattern
```

### Channels

```ts
const ch = Channel.bounded(10)

// Producer
await ch.send('hello')
ch.close()

// Consumer (as async iterable)
for await (const msg of ch.receive()) {
  console.log(msg)
}

// Bridge to Stream
const stream = Stream.from(ch.receive())
```

### Logger and Config

```ts
// Structured logging
const log = Logger.create({ name: 'api', level: 'info' })
log.info('request', { method: 'GET', path: '/users' })
const child = log.child({ requestId: '123' })

// Type-safe config from env
const AppConfig = Config.from({
  PORT: Schema.string.transform(Number).refine(n => n > 0, 'port'),
  DATABASE_URL: Schema.string,
  LOG_LEVEL: Schema.literal('debug').optional(),
})
const config = AppConfig.loadFrom(process.env)  // Result<Config, SchemaError>
```

### Cross-platform paths

```ts
Path.join('src', 'core', 'result.ts')       // native separator
Path.basename('/home/user/file.ts')         // 'file.ts'
Path.toPosix('src\\core\\file.ts')          // 'src/core/file.ts'

Eol.normalize('line1\r\nline2')             // 'line1\nline2'
Eol.split('line1\nline2')                   // ['line1', 'line2']
```

### Concurrent servers

```ts
const publicApi = Server('public').get('/health', () => json({ ok: true }))
const adminApi = Server('admin').get('/metrics', () => json({ uptime: 0 }))

Program('platform', signal => Task.all([
  publicApi.serve({ port: 3000, signal }),
  adminApi.serve({ port: 3001, signal }),
])).run()
// Ctrl+C gracefully shuts down both
```

## API reference

### Record

| Method | Description |
|---|---|
| `Record(obj)` | Create immutable record. Freezes in-place |
| `Record.clone(obj)` | Deep clone then freeze |
| `.set(accessor, val)` | Replace nested value |
| `.update(accessor, fn)` | Transform nested value |
| `.produce(draft => ...)` | Batch mutations via draft |
| `.merge({ ... })` | Shallow merge |
| `.at(accessor)` | Safe deep access -> `Option` |
| `.equals(other)` | Structural deep equality |

### List

| Method | Description |
|---|---|
| `List(arr)` | Create immutable list |
| `.append` / `.prepend` / `.setAt` / `.updateAt` / `.removeAt` | Mutations -> new List |
| `.map` / `.filter` / `.reduce` / `.flatMap` | Transformations |
| `.find` / `.findIndex` / `.at` / `.first` / `.last` | Queries -> `Option` |
| `.sortBy(cmp)` / `.sortByOrd(ord)` | Sorting |
| `.uniqBy(eq)` / `.groupBy(fn)` | Dedup and grouping |
| `.equals(other)` | Structural deep equality |

### NonEmptyList

Extends List. `first()`, `last()`, `head` return `T` directly (not `Option`).
`reduce1(fn)` folds without initial value. `sortByOrd(ord)` and `uniqBy(eq)` preserve non-emptiness.

### Result\<T, E\>

| Method | Description |
|---|---|
| `Ok(value)` / `Err(error)` | Construct |
| `Result.tryCatch(fn, onError)` | Wrap throwing code |
| `Result.collect` / `.sequence` | All-or-nothing collection |
| `Result.traverse(items, fn)` | Map + collect in one pass |
| `.map` / `.mapErr` / `.flatMap` | Transform |
| `.tap` / `.tapErr` | Side effects |
| `.match({ Ok, Err })` | Exhaustive pattern match |
| `.unwrap` / `.unwrapOr` / `.unwrapOrElse` | Extract |
| `.zip(other)` / `.ap(fnResult)` | Combine |
| `.toOption()` / `.toJSON()` | Convert |

### Option\<T\>

| Method | Description |
|---|---|
| `Some(value)` / `None` | Construct |
| `Option.fromNullable(v)` | Null-safe wrapping |
| `Option.traverse(items, fn)` | Map + collect |
| `.map` / `.flatMap` / `.filter` | Transform |
| `.match({ Some, None })` | Exhaustive pattern match |
| `.unwrap` / `.unwrapOr` / `.unwrapOrElse` | Extract |
| `.zip` / `.or` / `.ap` | Combine |
| `.toResult(error)` | Convert |

### Schema

| Method | Description |
|---|---|
| `.string` / `.number` / `.boolean` | Primitives |
| `.object({ ... })` / `.array(el)` / `.tuple(...)` | Composite |
| `.literal(v)` / `.union(...)` / `.discriminatedUnion(key, map)` | Sum types |
| `.record(val)` / `.intersection(a, b)` / `.lazy(fn)` | Advanced |
| `.parse(unknown)` -> `Result` | Validate |
| `.refine(pred, label)` / `.transform(fn)` / `.optional()` / `.default(v)` | Compose |

### Codec

| Method | Description |
|---|---|
| `Codec.from(decode, encode)` | Custom bidirectional codec |
| `Codec.fromSchema(schema, encode)` | Bridge from Schema |
| `Codec.string` / `.number` / `.boolean` | Primitives |
| `Codec.object({ ... })` / `.array(el)` / `.nullable(codec)` | Composite |
| `.decode(input)` -> `Result` / `.encode(value)` | Transform |
| `.pipe(other)` | Chain codecs |

### Task\<T, E\>

| Method | Description |
|---|---|
| `Task(async () => ...)` | Create lazy async computation |
| `Task.of` / `.fromResult` / `.fromPromise` | Constructors |
| `Task.all` / `.race` / `.allSettled` | Parallel execution |
| `Task.traverse(items, fn)` / `.sequence(tasks)` | Collection |
| `Task.ap(fnTask, argTask)` | Applicative |
| `.map` / `.mapErr` / `.flatMap` / `.tap` / `.tapErr` | Transform |
| `.timeout(ms, onTimeout)` / `.retry(n, delay?)` | Resilience |
| `.memoize()` | Cache result |
| `.run()` | Execute |

### Stream\<T, E\>

| Method | Description |
|---|---|
| `Stream.of(...)` / `.from(iterable)` / `.fromArray(arr)` | Create |
| `Stream.unfold(seed, fn)` / `.interval(duration)` | Generate |
| `.map` / `.flatMap` / `.filter` / `.take` / `.drop` / `.takeWhile` | Transform |
| `.chunk(size)` / `.window(size)` / `.scan(fn, init)` | Batch |
| `.mapErr` / `.tap` / `.concat` / `.zip` | Combine |
| `.collect()` / `.forEach(fn)` / `.reduce(fn, init)` / `.first()` / `.groupBy(fn)` | Collect -> Task |

### Optics

| Export | Description |
|---|---|
| `Lens.prop<S>()(key)` | Total lens for a property |
| `Lens.from(get, set)` | Custom lens |
| `LensOptional.index<T>(i)` | Array index (partial) |
| `LensOptional.fromNullable<S>()(key)` | Nullable field |
| `Prism.from(getOption, reverseGet)` | Sum type variant |
| `Traversal.fromArray<T>()` | All array elements |
| `.compose(other)` | Compose optics |
| `.get` / `.set(v)(s)` / `.modify(fn)(s)` | Access and update |

### Resilience

| Export | Description |
|---|---|
| `Retry.policy()` | Builder: `.maxAttempts`, `.exponentialBackoff`, `.jitter`, `.maxDelay`, `.shouldRetry` |
| `Retry.apply(policy, task)` | Apply policy to a Task |
| `CircuitBreaker.create(policy)` | Create breaker: `failureThreshold`, `successThreshold`, `timeout` |
| `breaker.protect(task)` | Wrap Task with circuit protection |
| `breaker.state()` | `'closed'` / `'open'` / `'half-open'` |
| `Semaphore.create(n)` | Counting semaphore: `.acquire()`, `.wrap(task)`, `.available()` |
| `Mutex.create()` | Mutual exclusion (semaphore with 1 permit): `.wrap(task)`, `.isLocked()` |
| `RateLimiter.create(policy)` | Token bucket: `capacity`, `refillRate`, `refillInterval` |
| `limiter.wrap(task)` | Returns `Err(RateLimited)` when bucket is empty |
| `Cache.create(options)` | TTL + LRU: `ttl`, `maxSize` |
| `cache.get(key)` / `.set(key, value)` | Returns `Option`, auto-expires |
| `cache.getOrElse(key, task)` | Cache-aside: returns cached or runs task |
| `Channel.bounded(n)` / `.unbounded()` | Async producer/consumer with backpressure |
| `ch.send(value)` / `ch.receive()` | Send blocks when full, receive is AsyncIterable |

### Env\<R, T, E\>

| Export | Description |
|---|---|
| `Env.of(value)` | Wrap value, ignore environment |
| `Env.access()` | Read the full environment |
| `Env.from(fn)` / `.fromSync(fn)` | Create from async/sync function |
| `.map` / `.mapErr` / `.flatMap` / `.tap` | Transform |
| `.provide(fn)` | Narrow the environment type |
| `.provideAll(env)` | Provide all dependencies, get Task-like |

### State\<S, A\>

| Export | Description |
|---|---|
| `State.of(value)` | Pure value, state unchanged |
| `State.get()` | Read state as value |
| `State.set(s)` / `.modify(fn)` | Replace or transform state |
| `.map` / `.flatMap` / `.tap` | Compose |
| `.run(init)` | Execute: returns `[value, finalState]` |
| `.eval(init)` / `.exec(init)` | Extract value or state only |

### IO

| Export | Description |
|---|---|
| `Json.parse(str)` | `Result<T, JsonError>`, never throws |
| `Json.stringify(value)` | `Result<string, JsonError>`, handles circular refs |
| `File.read(path)` | `Task<string, FileError>`, auto-normalizes line endings |
| `File.write(path, content)` | `Task<void, FileError>` |
| `File.exists(path)` / `.makeDir(path)` / `.remove(path)` / `.list(path)` | File system operations as Task |
| `Client.create(options?)` | HTTP client: `baseUrl`, `headers`, custom `fetch` |
| `client.get` / `.post` / `.put` / `.patch` / `.delete` | Returns `Task<ClientResponse, ClientError>` |
| `WebSocket.router()` | WebSocket route builder: `.route(path, handler)`, `.match(path)` |

### Time

| Export | Description |
|---|---|
| `Duration.seconds(n)` / `.minutes` / `.hours` / `.days` / `.milliseconds` | Create |
| `Duration.add` / `.subtract` / `.multiply` | Arithmetic |
| `Duration.toMilliseconds` / `.toSeconds` / `.toMinutes` / `.toHours` | Convert |
| `Duration.format(d)` | Human-readable: `'2h 30m 15s'` |
| `Duration.eq` / `.ord` | Typeclass instances |
| `Cron.parse(expr)` -> `Result` | Validate 5-field cron |
| `Cron.next(expr, after?)` -> `Option<Date>` | Next occurrence |
| `Cron.matches(expr, date)` | Check match |

### Typeclasses

| Export | Description |
|---|---|
| `Eq(fn)` / `Eq.string` / `.number` / `.boolean` / `.date` | Equality |
| `Eq.struct({ ... })` / `Eq.contramap(eq, fn)` | Compose |
| `Ord(fn)` / `Ord.string` / `.number` / `.date` | Ordering |
| `Ord.reverse` / `.contramap` / `.min` / `.max` / `.clamp` / `.between` | Compose |

### Server

| Method | Description |
|---|---|
| `Server(name)` | Create builder |
| `.get` / `.post` / `.put` / `.patch` / `.delete` / `.head` / `.options` / `.all` | Routes |
| `.use(...middlewares)` | Untyped middleware |
| `.middleware(typedMw)` | Typed context-extending middleware |
| `.derive(resolver)` | Sequential context derivation |
| `.onError(handler)` | Custom error handler |
| `.fetch(request)` | WHATWG fetch handler |
| `.serve({ port, signal })` | Returns Task for composable concurrency |
| `.listen(options, adapter?)` | Start with Program lifecycle |
| `json` / `text` / `html` / `redirect` | Response helpers |

### Program

| Method | Description |
|---|---|
| `Program(name, (signal) => task)` | Create named program |
| `.run()` | Execute: logging, signals, exit codes |
| `.execute(signal?)` | Execute for testing: raw Result |

### Logger

| Export | Description |
|---|---|
| `Logger.create({ name, level?, sink? })` | Create structured logger |
| `Logger.json` / `.pretty` / `.silent` | Built-in sinks |
| `log.debug` / `.info` / `.warn` / `.error` | Log at level with optional context |
| `log.child(context)` | Inherit context, add fields |
| `log.named(name)` | Change logger name |

### Config

| Export | Description |
|---|---|
| `Config.from(shape)` | Define config schema from env |
| `.load()` | Read from `process.env`, returns `Result` |
| `.loadFrom(env)` | Read from custom record |

### Platform

| Export | Description |
|---|---|
| `Path.join` / `.normalize` / `.basename` / `.dirname` / `.extname` | OS-aware path operations |
| `Path.toPosix(path)` | Convert to forward slashes |
| `Eol.normalize(text)` | Replace `\r\n` with `\n` |
| `Eol.split(text)` | Split on `\r?\n` |
| `Platform.os` / `.isWindows` | Runtime detection |

### Utilities

| Export | Description |
|---|---|
| `pipe(val, f1, f2, ...)` | Left-to-right transformation (1-9 stages) |
| `flow(f1, f2, ...)` | Point-free composition (1-6 stages) |
| `Match(value).with(...).exhaustive()` | Exhaustive pattern matching |
| `match(result, { Ok, Err })` | Two-arm match for Result/Option |
| `ErrType(tag)` | Structured error constructor |
| `Type<'Name', Base>` | Nominal typing (zero runtime) |
| `Lazy(() => expr)` | Deferred cached computation |
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
npm run check          # Type check (TS7)
npm run build          # Build
npm test               # Test runtime
npm run test:types     # Test types (compile-time safety suite)
npm run prepublishOnly # Full prepublish pipeline
```

## License

Apache-2.0
