import { Program, Task } from "../../dist/index.js";

await Program("test", _signal => Task.of("done")).run();
