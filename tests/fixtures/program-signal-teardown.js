import { Program, Task } from "../../dist/index.js";

// Task ignores abort - relies on teardown timeout to force-exit
await Program(
  "test",
  Task.fromPromise(
    () =>
      new Promise(resolve => {
        setTimeout(() => resolve("timeout"), 60_000);
      }),
  ),
  { teardownTimeoutMs: 200 },
).run();
