import { Err, Program, Task } from "../../dist/index.js";

const circular = {};
circular.self = circular;
await Program("test", Task.fromResult(Err(circular))).run();
