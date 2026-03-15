import { Err, Program, Task } from "../../dist/index.js";

const custom = {
  toString() {
    return "CustomErr";
  },
};
await Program("test", Task.fromResult(Err(custom))).run();
