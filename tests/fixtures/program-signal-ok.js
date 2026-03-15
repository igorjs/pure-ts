import { Program, Task } from "../../dist/index.js";

// Task resolves Ok on abort - verifies interrupt takes priority over Ok
await Program("test", signal =>
  Task.fromPromise(
    () =>
      new Promise(resolve => {
        const keepAlive = setTimeout(() => resolve("timeout"), 60_000);
        signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          resolve("aborted-ok");
        });
      }),
  ),
).run();
