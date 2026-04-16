# Async

Lazy async computation, sequences, resilience, and concurrency control.

## Task\<T, E\>

Lazy async computation that returns `Result<T, E>`. Nothing runs until `.run()`.

```ts
import { Task, Ok, Err } from '@igorjs/pure-ts'

// Create
const task = Task.of(42);
const fetched = Task.fromPromise(() => fetch('/api/data'), String);

// Chain (short-circuits on Err)
const pipeline = Task.of(10)
  .map(n => n * 2)
  .flatMap(n => n > 0 ? Task.of(n) : Task.fromResult(Err('negative')));

// Execute
const result = await pipeline.run(); // Result<number, string>

// Parallel
const [a, b, c] = await Task.all([taskA, taskB, taskC]).run();

// Race
const fastest = await Task.race([slow, fast]).run();

// Timeout
const limited = task.timeout(5000, () => 'timed out');

// Retry
const resilient = task.retry({ maxAttempts: 3, delay: 1000 });

// Memoize
const cached = task.memoize(); // subsequent .run() returns cached result
```

## Stream\<T, E\>

Lazy pull-based async sequences. Backpressure-free.

```ts
import { Stream } from '@igorjs/pure-ts'

// Create
const s = Stream.of(1, 2, 3, 4, 5);
const fromApi = Stream.from(someAsyncIterable);
const ticks = Stream.interval(Duration.seconds(1));

// Transform (all lazy)
s.map(n => n * 2)
 .filter(n => n > 4)
 .take(3)
 .flatMap(n => Stream.of(n, n + 1));

// Collect (executes the pipeline)
const result = await s.collect().run(); // Result<number[], never>

// Reactive operators
s.debounce(300);                    // emit after 300ms silence
s.throttle(1000);                   // at most one per second
s.distinctUntilChanged();           // skip consecutive duplicates
s.distinctUntilChanged((a, b) => a.id === b.id); // custom eq

// Merge multiple streams
const merged = Stream.merge(streamA, streamB, streamC);

// Window and chunk
s.chunk(3);    // groups of 3: [[1,2,3], [4,5]]
s.window(2);   // sliding window: [[1,2], [2,3], [3,4], [4,5]]

// Reduce
await s.reduce((sum, n) => sum + n, 0).run(); // Ok(15)
```

## Retry

Builder pattern for retry policies.

```ts
import { Retry, Task } from '@igorjs/pure-ts'

const policy = Retry.exponential({ base: 100, factor: 2, maxDelay: 5000 })
  .maxAttempts(5)
  .jitter(0.2)
  .when(err => err.code !== 'FATAL');

const result = await policy.execute(
  () => Task.fromPromise(() => fetch('/api'), String)
).run();
```

## CircuitBreaker

Prevent cascading failures with open/half-open/closed states.

```ts
import { CircuitBreaker } from '@igorjs/pure-ts'

const breaker = CircuitBreaker.create({
  failureThreshold: 5,
  resetTimeout: Duration.seconds(30),
  halfOpenMax: 2,
});

const result = await breaker.execute(
  () => Task.fromPromise(() => fetch('/api'), String)
).run();
// Err(CircuitOpen(...)) when circuit is open
```

## Concurrency

```ts
import { Semaphore, Mutex, RateLimiter, Cache, Channel } from '@igorjs/pure-ts'

// Semaphore: limit concurrent access
const sem = Semaphore.create(3);
await sem.acquire();
try { /* work */ } finally { sem.release(); }

// Mutex: exclusive access
const mutex = Mutex.create();
await mutex.runWith(async () => { /* exclusive work */ });

// Rate limiter: token bucket
const limiter = RateLimiter.create({ rate: 10, interval: Duration.seconds(1) });
const result = await limiter.tryAcquire(); // Ok(void) or Err(RateLimited)

// Cache: TTL-based memoization
const cache = Cache.create<string, User>({ ttl: Duration.minutes(5) });
await cache.getOrSet('user:1', () => fetchUser('1'));

// Channel: see Channel section below
```

## Lazy

Deferred computation that evaluates at most once and caches the result. Implements `Disposable` for scoped cleanup.

```ts
import { Lazy } from '@igorjs/pure-ts'

const config = Lazy(() => loadExpensiveConfig());

config.isEvaluated;         // false
const value = config.value; // evaluates and caches
config.value;               // returns cached (no re-evaluation)
config.isEvaluated;         // true

// Transform (still deferred)
const port = config.map(c => c.port);

// Safe access
config.unwrapOr(defaultConfig);
config.toOption();  // Some(value) or None if thunk throws
config.toResult(e => String(e)); // Ok(value) or Err(message)

// Scoped with `using` (ES2024 Disposable)
{
  using data = Lazy(() => parseHugeDataset());
  transform(data.value);
} // data disposed, memory released
```

## Env

Reader-style dependency injection for async pipelines. Compose first, provide dependencies at the edge.

```ts
import { Env } from '@igorjs/pure-ts'

type Deps = { db: Database; logger: Logger };

const getUser = (id: string) =>
  Env.access<Deps>().flatMap(({ db }) =>
    Env.fromSync(env => db.query('SELECT ...', [id]))
  );

// Provide environment at the entry point
const result = await getUser('u_123').run({ db, logger });

// Compose
Env.of<Deps, number>(42);           // wrap a plain value
Env.access<Deps>();                   // access the full environment
Env.from<Deps, User, Error>(async env => /* ... */);
Env.fromSync<Deps, string>(env => env.db.url);

// Narrow environment
const narrowed = getUser('u_1').provide((small: { db: Database }) =>
  ({ ...small, logger: console })
);
```

## Channel

Async producer/consumer communication with backpressure. Bounded channels block sends when the buffer is full.

```ts
import { Channel, Stream } from '@igorjs/pure-ts'

// Bounded channel (backpressure when buffer fills)
const ch = Channel.bounded<number>(10);

// Unbounded channel (never blocks on send)
const uch = Channel.unbounded<string>();

// Producer
await ch.send(1);
await ch.send(2);
ch.close();

// Consumer (as async iterable)
for await (const value of ch.receive()) {
  console.log(value); // 1, 2
}

ch.isClosed(); // true
ch.size();     // 0 (buffered items)

// Bridge to Stream
const stream = Stream.from(ch.receive());
```

## StateMachine

See [state-machine.md](state-machine.md) for the full guide.

## EventEmitter

Type-safe event emitter with per-event typed handlers.

```ts
import { EventEmitter } from '@igorjs/pure-ts'

type Events = {
  userCreated: { id: string; name: string };
  error: { message: string };
  shutdown: void;
};

const emitter = EventEmitter.create<Events>();

emitter.on('userCreated', user => console.log(user.name));
emitter.once('shutdown', () => console.log('bye'));
emitter.emit('userCreated', { id: 'u1', name: 'Alice' });

emitter.listenerCount('userCreated'); // 1
emitter.off('userCreated', handler);
emitter.removeAll('userCreated');
```

## Pool

Generic resource pool for connections, handles, or any reusable resource.

```ts
import { Pool } from '@igorjs/pure-ts'

const pool = Pool.create({
  create: () => connectToDb(),
  destroy: conn => conn.close(),
  validate: conn => conn.isAlive(),
  maxSize: 10,
  idleTimeout: 30_000,
});

// Auto-release with use()
const result = await pool.use(async conn => {
  return conn.query('SELECT 1');
}).run();

pool.size();   // total resources
pool.idle();   // available
pool.active(); // in use
await pool.drain(); // destroy all
```

## Queue

Async job queue with concurrency control and priorities.

```ts
import { Queue } from '@igorjs/pure-ts'

const queue = Queue.create({
  concurrency: 3,
  handler: async job => {
    await sendEmail(job.data.userId);
  },
  onError: (err, job) => console.log(`Job ${job.id} failed`),
});

queue.push({ userId: 'u1' });
queue.push({ userId: 'u2' }, { priority: 0 }); // higher priority

queue.size();      // pending
queue.active();    // processing
queue.processed(); // completed
await queue.drain();

queue.pause();
queue.resume();
```

## CronRunner

Execute async tasks on cron schedules.

```ts
import { CronRunner } from '@igorjs/pure-ts'

const runner = CronRunner.create({
  schedule: '*/5 * * * *', // every 5 minutes
  handler: async () => {
    await cleanupExpiredSessions();
  },
  onError: (err) => console.log('Cron failed:', err),
  runImmediately: true,
});

runner.start();
runner.isRunning(); // true
runner.nextRun();   // Date | undefined
runner.stop();
```

## Timer

Type-safe time-based operations using web standard APIs. Wraps `setTimeout` and `performance.now()` in Task/Stream for lazy, composable timing.

```ts
import { Timer, Duration } from '@igorjs/pure-ts'

// Sleep for 1 second
await Timer.sleep(Duration.seconds(1)).run();

// Tick every 500ms, take 5 ticks
const ticks = await Timer.interval(Duration.milliseconds(500))
  .take(5)
  .collect()
  .run();
// Ok([0, 1, 2, 3, 4])

// Delay a task by 2 seconds before running it
await Timer.delay(Duration.seconds(2), myTask).run();

// Race a task against a deadline
const result = await Timer.deadline(Duration.seconds(5), slowTask).run();
// Err(TimeoutError('Deadline of 5s exceeded')) if it takes too long

// High-resolution timestamp (performance.now())
const start = Timer.now();
doWork();
const elapsed = Timer.now() - start;
```
