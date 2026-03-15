import { Err, Program, Task } from "../../dist/index.js";

await Program("test", Task.fromResult(Err(new Error("boom")))).run();
