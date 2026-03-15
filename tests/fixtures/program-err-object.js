import { Err, Program, Task } from "../../dist/index.js";

await Program("test", Task.fromResult(Err({ code: 42 }))).run();
