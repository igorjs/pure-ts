# Pure TS Documentation

Functional application framework for TypeScript. Zero dependencies. Errors as values. Immutability at runtime.

## Modules

| Module | Description | Doc |
|--------|-------------|-----|
| **Core** | Result, Option, pipe, flow, Match, Eq, Ord, State, Lens, Prism, Traversal, Iso | [core.md](core.md) |
| **Data** | Record, List, NonEmptyList, Schema, Codec, ADT, StableVec | [data.md](data.md) |
| **Async** | Task, Stream, Lazy, Env, Channel, Timer, Retry, CircuitBreaker, Semaphore, Mutex, RateLimiter, Cache, StateMachine, EventEmitter, Pool, Queue, CronRunner | [async.md](async.md) |
| **IO** | File, Command, Json, Crypto, Encoding, Compression, Clone, Url, Dns, Net, Client, WebSocket | [io.md](io.md) |
| **Runtime** | Server, Program, Logger, Config, Os, Process, Path, Eol, Platform | [runtime.md](runtime.md) |
| **Types** | ErrType, Duration, Cron, Type (nominal) | [types.md](types.md) |
| **StateMachine** | Type-safe FSM with compile-time transitions | [state-machine.md](state-machine.md) |

## Quick Start

```bash
npm install @igorjs/pure-ts
```

```ts
import { Ok, Err, pipe, Task, Schema, File } from '@igorjs/pure-ts'

// Or import specific modules for smaller bundles:
import { Ok, Err, pipe } from '@igorjs/pure-ts/core'
import { Schema } from '@igorjs/pure-ts/data'
import { Task } from '@igorjs/pure-ts/async'
```

## Principles

1. **Errors are values**: `Result<T, E>` instead of try/catch. Every fallible operation returns its error in the type.
2. **Immutability at runtime**: Records and Lists are deep-frozen. Mutations throw TypeError.
3. **Lazy async**: Task and Stream describe computations. Nothing runs until `.run()`.
4. **Zero dependencies**: Everything is built from scratch. No node_modules to audit.
5. **Multi-runtime**: CI-tested on Node.js 22+, Node.js 24, Deno, Bun, Cloudflare Workers (miniflare), and Chromium (Playwright).

## Runtime Compatibility

CI-tested on 7 environments:

| Runtime | Unit Tests | Smoke Tests |
|---------|-----------|-------------|
| Node.js 22 | 1035 | 96 (runtime + web) |
| Node.js 24 | - | 96 |
| Deno | - | 96 |
| Bun | - | 96 |
| CF Workers (miniflare) | - | 50 (web) |
| Chromium (Playwright) | - | 50 (web) |

Pure and web modules work everywhere. Multi-runtime modules (File, Command, Os, Process, Server) detect Deno/Bun/Node via `globalThis` and return `Err`/`None` in environments without filesystem or subprocess support.

## Building

```bash
npm run check          # Type check (TS7)
npm run build          # Build
npm test               # Test runtime
npm run test:types     # Test types (compile-time safety suite)
npm run release patch  # Bump, changelog, tag, push, GitHub release
```
