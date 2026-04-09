# Pure TS

[![npm](https://img.shields.io/npm/v/@igorjs/pure-ts?color=blue)](https://www.npmjs.com/package/@igorjs/pure-ts)
[![JSR](https://jsr.io/badges/@igorjs/pure-ts)](https://jsr.io/@igorjs/pure-ts)
[![JSR Score](https://jsr.io/badges/@igorjs/pure-ts/score)](https://jsr.io/@igorjs/pure-ts)
[![License](https://img.shields.io/npm/l/@igorjs/pure-ts)](https://github.com/igorjs/pure-ts/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-890_passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

Functional application framework for TypeScript. Zero dependencies.

Errors are values, not exceptions. Data is immutable, enforced at runtime. Async is lazy and composable. The type system carries everything.

![Node.js](https://img.shields.io/badge/Node.js_22+-339933?logo=nodedotjs&logoColor=white)
![Deno](https://img.shields.io/badge/Deno_2+-000000?logo=deno&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![QuickJS](https://img.shields.io/badge/QuickJS-F7DF1E?logo=javascript&logoColor=black)
![LLRT](https://img.shields.io/badge/LLRT-FF9900?logo=amazonaws&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/CF_Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5.5+-3178C6?logo=typescript&logoColor=white)

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
  Task, Stream, Lazy, Env, Timer, Retry, CircuitBreaker,
  Semaphore, Mutex, RateLimiter, Cache, Channel,
  // IO
  Json, File, Crypto, Url, Encoding, Clone, Compression,
  Client, WebSocket, Command, Dns, Net,
  // Runtime
  Server, Program, Logger, Config,
  Path, Eol, Platform, Os, Process,
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
| **Async** | `Task`, `Stream`, `Lazy`, `Env`, `Timer`, `Retry`, `CircuitBreaker`, `Semaphore`, `Mutex`, `RateLimiter`, `Cache`, `Channel` |
| **IO** | `Json`, `File`, `Crypto`, `Url`, `Encoding`, `Clone`, `Compression`, `Client`, `WebSocket`, `Command`, `Dns`, `Net` |
| **Runtime** | `Server`, `Program`, `Logger`, `Config`, `Path`, `Eol`, `Platform`, `Os`, `Process`, adapters for Node, Deno, Bun, QuickJS, LLRT, Lambda |

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

// File: multi-runtime (Deno + Node + Bun + QuickJS), returns Task
const content = await File.read('./config.json').run()
await File.write('./out.json', data).run()
await File.stat('./file.txt').run()         // Ok({ isFile, isDirectory, size })
File.copy('./a.txt', './b.txt')             // Task<void, FileError>

// Crypto: web standard (all runtimes including browsers)
Crypto.uuid()                               // 'a1b2c3d4-...'
await Crypto.hash('SHA-256', 'hello').run() // Ok(Uint8Array)
Crypto.timingSafeEqual(a, b)                // boolean

// URL: returns Result instead of throwing
Url.parse('https://example.com?q=1')        // Ok(URL)
Url.parse('not a url')                      // Err(UrlError)

// Encoding: base64, hex, utf8
Encoding.base64.encode(bytes)               // 'SGVsbG8='
Encoding.base64.decode('SGVsbG8=')          // Ok(Uint8Array)
Encoding.hex.encode(bytes)                  // 'deadbeef'

// Compression: web standard streams
await Compression.gzip(data).run()          // Ok(Uint8Array)
await Compression.gunzip(compressed).run()  // roundtrip

// Clone: safe structuredClone
Clone.deep({ nested: [1, 2] })              // Ok(deepCopy)
Clone.deep({ fn: () => {} })                // Err(CloneError)
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

### Subprocess

```ts
const result = await Command.exec('git', ['status']).run()
// Ok({ exitCode: 0, stdout: '...', stderr: '' })
// Works across Node, Deno, Bun, and QuickJS
```

### Timers

```ts
await Timer.sleep(Duration.seconds(1)).run()    // Task<void, never>
Timer.interval(Duration.seconds(1))             // Stream<number, never>
await Timer.deadline(Duration.seconds(5), task) // Err(TimeoutError) if slow
```

### DNS and TCP

```ts
await Dns.lookup('example.com').run()           // Ok({ address, family })
await Dns.resolve('example.com', 'MX').run()    // Ok(['mx1.example.com', ...])

const conn = await Net.connect({ host: '127.0.0.1', port: 8080 }).run()
if (conn.isOk) {
  await conn.value.send('hello').run()
  const data = await conn.value.receive().run() // Ok(Uint8Array)
  conn.value.close()
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
| `File.read` / `.write` / `.exists` / `.stat` / `.copy` / `.rename` | Multi-runtime file ops as Task |
| `File.makeDir` / `.remove` / `.list` / `.tempDir` | Directory operations as Task |
| `Crypto.uuid()` | Random UUID v4 (web standard) |
| `Crypto.randomBytes(n)` / `.hash(algo, data)` | Crypto ops returning Result/Task |
| `Crypto.timingSafeEqual(a, b)` | Constant-time byte comparison |
| `Url.parse(input)` | `Result<URL, UrlError>`, wraps `new URL()` |
| `Url.searchParams(obj)` / `.parseSearchParams(str)` | Query string utilities |
| `Encoding.base64` / `.hex` / `.utf8` | `.encode()` / `.decode()` with Result |
| `Compression.gzip` / `.gunzip` / `.deflate` / `.inflate` | Web standard CompressionStream as Task |
| `Clone.deep(value)` | `Result<T, CloneError>`, wraps `structuredClone` |
| `Client.create(options?)` | HTTP client: `baseUrl`, `headers`, custom `fetch` |
| `client.get` / `.post` / `.put` / `.patch` / `.delete` | Returns `Task<ClientResponse, ClientError>` |
| `WebSocket.router()` | WebSocket route builder: `.route(path, handler)`, `.match(path)` |
| `Command.exec(cmd, args?)` | Multi-runtime subprocess: `Task<CommandResult, CommandError>` |
| `Dns.lookup(host)` / `.resolve(host, type?)` | DNS resolution as Task |
| `Net.connect({ host, port })` | TCP client: `Task<TcpConnection, NetError>` |
| `Stream.fromReadable(stream)` | Bridge web ReadableStream to `Stream<Uint8Array>` |

### Timer

| Export | Description |
|---|---|
| `Timer.sleep(duration)` | `Task<void, never>` |
| `Timer.interval(period)` | `Stream<number, never>` |
| `Timer.delay(duration, task)` | Run task after delay |
| `Timer.deadline(duration, task)` | Race task against timeout |
| `Timer.now()` | `performance.now()` wrapper |

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
| `Path.resolve` / `.relative` / `.isAbsolute` / `.parse` | Advanced path operations |
| `Path.toPosix(path)` | Convert to forward slashes |
| `Eol.normalize(text)` | Replace `\r\n` with `\n` |
| `Eol.split(text)` | Split on `\r?\n` |
| `Platform.os` / `.isWindows` | Runtime detection |
| `Os.hostname` / `.arch` / `.platform` / `.cpuCount` | System info as `Option` |
| `Os.totalMemory` / `.freeMemory` / `.tmpDir` / `.homeDir` | Resource info |
| `Process.cwd()` | `Result<string, ProcessError>` |
| `Process.pid` / `.uptime` / `.memoryUsage` | Process info as `Option` |
| `Process.argv()` / `.parseArgs(schema)` | Argument parsing with Schema validation |

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

## Runtime compatibility

Works with: &nbsp; ![Node.js](https://img.shields.io/badge/Node.js_22+-339933?logo=nodedotjs&logoColor=white) &nbsp; ![Deno](https://img.shields.io/badge/Deno_2+-000000?logo=deno&logoColor=white) &nbsp; ![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white) &nbsp; ![QuickJS](https://img.shields.io/badge/QuickJS-F7DF1E?logo=javascript&logoColor=black) &nbsp; ![LLRT](https://img.shields.io/badge/LLRT-FF9900?logo=amazonaws&logoColor=white) &nbsp; ![Cloudflare Workers](https://img.shields.io/badge/CF_Workers-F38020?logo=cloudflare&logoColor=white) &nbsp; ![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

Every module is classified by its runtime requirements. Web standard modules work everywhere. Multi-runtime modules detect Deno/Bun/QuickJS/Node via `globalThis`. Server-only modules gracefully return `Err` or `None` in unsupported runtimes. LLRT uses the Node.js code path.

| Module | API | <img src="https://img.shields.io/badge/-339933?logo=nodedotjs&logoColor=white" height="14"> | <img src="https://img.shields.io/badge/-000000?logo=deno&logoColor=white" height="14"> | <img src="https://img.shields.io/badge/-000000?logo=bun&logoColor=white" height="14"> | <img src="https://img.shields.io/badge/-F7DF1E?logo=javascript&logoColor=black" height="14"> | <img src="https://img.shields.io/badge/-FF9900?logo=amazonaws&logoColor=white" height="14"> | <img src="https://img.shields.io/badge/-F38020?logo=cloudflare&logoColor=white" height="14"> | <img src="https://img.shields.io/badge/-4285F4?logo=googlechrome&logoColor=white" height="14"> |
|--------|-----|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Result** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Option** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **pipe / flow** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Match** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Eq / Ord** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **State** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Lens / Prism / Traversal** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Record / List / NonEmptyList** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Schema / Codec** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **ErrType / Type** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Duration / Cron** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Task / Stream / Lazy** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Env / Channel / Cache** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Semaphore / Mutex** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Json** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Clone** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Crypto** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Url** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Encoding** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Compression** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Timer** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Client** | web (fetch) | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Path / Eol** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Platform** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Server.fetch** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Stream.fromReadable** | web | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **File** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Command** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :warning: | :white_check_mark: | :x: | :x: |
| **Os** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :warning: | :white_check_mark: | :x: | :x: |
| **Process** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Config** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :x: | :x: |
| **Logger** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: |
| **Server.serve/.listen** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | :x: |
| **Program** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :x: | :x: | :x: |
| **Dns** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :x: | :x: |
| **Net** | multi-runtime | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :x: | :x: |
| **WebSocket** | router only | :white_check_mark: | :white_check_mark: | :white_check_mark: | :x: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **Retry / CircuitBreaker** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| **RateLimiter** | pure | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: | :white_check_mark: |

**Legend:**
- **pure**: No runtime APIs used. Pure TypeScript logic.
- **web**: Uses web standard APIs (`crypto.subtle`, `URL`, `TextEncoder`, `CompressionStream`, `fetch`, `setTimeout`, `performance`). Available in all modern runtimes.
- **multi-runtime**: Detects Deno/Bun/QuickJS/Node via `globalThis` and dispatches to the appropriate API. Returns `Err`/`None` in runtimes without the capability.
- :white_check_mark: = full support, :warning: = partial (see notes below), :x: = not available

**QuickJS notes:**
- **Command**: No timeout support. The `env` option is ignored.
- **Os**: Limited info. Most fields return `None` or `"unknown"`.
- **Crypto/Compression/Client/Server/Stream.fromReadable**: Require web standard APIs not available in base QuickJS builds.
- **LLRT** uses the Node.js code path for all modules (it implements `node:fs`, `node:child_process`, etc.).

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
