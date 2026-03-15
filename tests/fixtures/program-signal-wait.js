import { Program, Task } from "../../dist/index.js";

await Program("test", signal =>
  Task.fromPromise(
    () =>
      new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => resolve("timeout"), 60_000);
        signal.addEventListener("abort", () => {
          clearTimeout(keepAlive);
          reject(new Error("aborted"));
        });
      }),
  ),
).run();
