# Runtime

HTTP server, program lifecycle, logging, configuration, and cross-runtime utilities.

## Server

Production-grade HTTP server with typed routing, middleware, and runtime adapters.

```ts
import { Server, json, text, html } from '@igorjs/pure-ts'
import { nodeAdapter } from '@igorjs/pure-ts/runtime/adapter/node'

const app = Server.create()
  .get('/health', () => json({ status: 'ok' }))
  .get('/users/:id', ctx => {
    const { id } = ctx.params; // typed from route pattern
    return json({ id });
  })
  .post('/users', async ctx => {
    const body = await ctx.body.json();
    return json(body, { status: 201 });
  });

// Start with runtime adapter
await app.listen(nodeAdapter, { port: 3000 });
```

Adapters: `nodeAdapter`, `denoAdapter`, `bunAdapter`, `lambdaAdapter`

## Program

Process lifecycle wrapper for Task-based CLI programs with signal handling and graceful shutdown.

```ts
import { Program, Task } from '@igorjs/pure-ts'

// Create from a Task or effect function receiving AbortSignal
const main = Program('my-service', (signal) =>
  Task.fromPromise(
    () => startServer({ signal }),
    String,
  ),
  { teardownTimeoutMs: 5000 },
);

// Production: handles SIGINT/SIGTERM, logs, calls process.exit
await main.run();

// Testing: returns raw Result, no process lifecycle
const result = await main.execute();

// With a plain Task (no signal needed)
const simple = Program('worker', Task.of('done'));
await simple.run();
```

## Logger

Structured logging with levels and JSON output.

```ts
import { Logger } from '@igorjs/pure-ts'

const log = Logger.create({ level: 'info', json: true });
log.info('server started', { port: 3000 });
log.error('request failed', { path: '/api', status: 500 });
```

## Config

Environment variable validation via Schema.

```ts
import { Config, Schema } from '@igorjs/pure-ts'

const AppConfig = Config.from({
  PORT: Schema.string.transform(Number),
  DATABASE_URL: Schema.string,
  DEBUG: Schema.boolean.default(false),
});

// Load from process.env / Deno.env (auto-detected)
const config = AppConfig.load();
// Result<{ PORT: number, DATABASE_URL: string, DEBUG: boolean }, SchemaError>

// Load from a custom env record (useful for testing)
const testConfig = AppConfig.loadFrom({
  PORT: '3000',
  DATABASE_URL: 'postgres://localhost/test',
});
```

## Platform

Runtime platform detection and OS-aware constants. Works everywhere (Node, Deno, Bun, browsers, edge runtimes) without importing `node:os` or `node:path`.

```ts
import { Platform } from '@igorjs/pure-ts'

Platform.isWindows; // true on Windows, false elsewhere
Platform.isPosix;   // true on macOS/Linux/Deno/browsers
```

## Os / Process / Path

Cross-runtime OS info, process control, and path utilities.

```ts
import { Os, Process, Path, Eol } from '@igorjs/pure-ts'

Os.hostname();    // Option<string>
Os.platform();    // 'darwin' | 'linux' | 'win32' | ...
Os.tmpDir();      // '/tmp'
Os.homeDir();     // Option<string>

Process.cwd();    // Result<string, ProcessError>
Process.pid();    // Option<number>
Process.argv();   // readonly string[]
Process.uptime();      // Option<number> (seconds)
Process.memoryUsage(); // Option<{ heapUsed, heapTotal, rss }>
Process.exit(0);       // never (terminates the process)
Process.parseArgs({ port: Schema.string.transform(Number) });
// Result<{ port: number }, SchemaError>

Path.join('src', 'index.ts');   // 'src/index.ts'
Path.resolve('..', 'file.ts'); // absolute path
Path.parse('/home/user/file.ts');
// { root: '/', dir: '/home/user', base: 'file.ts', ext: '.ts', name: 'file' }

Eol.normalize('line1\r\nline2'); // 'line1\nline2'
```

## Adapter Layer

Cross-runtime modules (File, Command, Terminal, Os, Process, Dns, Net) are backed by an internal adapter layer that normalises runtime differences behind unified interfaces. Public modules delegate to these adapters; the adapters themselves are not re-exported.

```
Public module          Adapter interface       Implementations
─────────────          ─────────────────       ───────────────
File                   Fs                      Deno, Node/Bun
Command                Subprocess              Deno, Bun, Node
Terminal               Stdin / Stdout          Deno, Node/Bun
Os                     OsInfo                  Deno, Node/Bun
Process                ProcessInfo             Deno, Node/Bun
Dns                    Dns                     Deno, Node/Bun
Net                    TcpClient               Deno, Node/Bun
```

Each adapter has a `resolve*()` function that auto-detects the runtime via `globalThis` structural typing (no `node:` imports). Detection order: Deno first, then Node/Bun, returning `null` when neither is available. Public modules convert `null` into typed `Err` values so consumers never see raw failures.
