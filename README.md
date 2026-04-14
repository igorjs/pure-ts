# Pure TS

[![npm](https://img.shields.io/npm/v/@igorjs/pure-ts?color=blue)](https://www.npmjs.com/package/@igorjs/pure-ts)
[![JSR](https://jsr.io/badges/@igorjs/pure-ts)](https://jsr.io/@igorjs/pure-ts)
[![JSR Score](https://jsr.io/badges/@igorjs/pure-ts/score)](https://jsr.io/@igorjs/pure-ts)
[![License](https://img.shields.io/npm/l/@igorjs/pure-ts)](https://github.com/igorjs/pure-ts/blob/main/LICENSE)
[![Tests](https://img.shields.io/badge/tests-1035_passing-brightgreen)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()

Functional application framework for TypeScript. Zero dependencies.

Errors are values, not exceptions. Data is immutable, enforced at runtime. Async is lazy and composable.

![Node.js](https://img.shields.io/badge/Node.js_22+-339933?logo=nodedotjs&logoColor=white)
![Deno](https://img.shields.io/badge/Deno_2+-000000?logo=deno&logoColor=white)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/CF_Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Chromium-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript_5.5+-3178C6?logo=typescript&logoColor=white)

## Install

```bash
npm install @igorjs/pure-ts
```

Also available on [JSR](https://jsr.io/@igorjs/pure-ts):

```bash
npx jsr add @igorjs/pure-ts
```

## Quick Example

```ts
import { Ok, Err, pipe, Task, Schema, File, Match } from '@igorjs/pure-ts'

// Errors as values
const parse = (s: string) => {
  const n = Number(s);
  return Number.isNaN(n) ? Err('not a number') : Ok(n);
};

pipe(parse('42'), r => r.map(n => n * 2)); // Ok(84)

// Lazy async with Result
const data = await Task.fromPromise(() => fetch('/api'), String)
  .map(r => r.json())
  .timeout(5000, () => 'timed out')
  .run(); // Result<unknown, string>

// Validate unknown input
const User = Schema.object({ name: Schema.string, age: Schema.number });
User.parse(untrustedData); // Result<{ name: string; age: number }, SchemaError>

// Read a file (works on Node, Deno, Bun)
const content = await File.read('./config.json').run();
```

## Modules

| Layer | Primitives | Docs |
|-------|------------|------|
| **Core** | `Result`, `Option`, `pipe`, `flow`, `Match`, `Eq`, `Ord`, `State`, `Lens`, `Iso` | [docs/core.md](docs/core.md) |
| **Data** | `Record`, `List`, `NonEmptyList`, `Schema`, `Codec`, `ADT` | [docs/data.md](docs/data.md) |
| **Types** | `ErrType`, `Type`, `Duration`, `Cron` | [docs/types.md](docs/types.md) |
| **Async** | `Task`, `Stream`, `Retry`, `CircuitBreaker`, `StateMachine`, `EventEmitter`, `Pool`, `Queue`, `CronRunner`, and more | [docs/async.md](docs/async.md) |
| **IO** | `File`, `Command`, `Json`, `Crypto`, `Encoding`, `Client`, `Dns`, `Net` | [docs/io.md](docs/io.md) |
| **Runtime** | `Server`, `Program`, `Logger`, `Config`, `Os`, `Process`, `Path` | [docs/runtime.md](docs/runtime.md) |

[Full documentation with examples](docs/index.md)

## Subpath Imports

```ts
// Import everything
import { Ok, Task, Schema } from '@igorjs/pure-ts'

// Or import specific modules for smaller bundles
import { Ok, Err, pipe } from '@igorjs/pure-ts/core'
import { Schema } from '@igorjs/pure-ts/data'
import { Task, Stream } from '@igorjs/pure-ts/async'
import { File, Command } from '@igorjs/pure-ts/io'
```

## License

[Apache-2.0](LICENSE)
