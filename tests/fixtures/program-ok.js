import { Program, Task } from "../../dist/index.js";

await Program("test", Task.of(42)).run();
