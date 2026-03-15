import { Err, ErrType, Program, Task } from "../../dist/index.js";

const NotFound = ErrType("NotFound", "NOT_FOUND");
await Program("test", Task.fromResult(Err(NotFound("missing")))).run();
