import { httpStatusForCycle, runObservationCycle } from "../../src/awuru/cloud/observe-cycle.ts";

const report = await runObservationCycle({
  withParity: !process.argv.includes("--no-parity"),
});
console.log(JSON.stringify(report, null, 2));
process.exit(httpStatusForCycle(report) === 200 ? 0 : 1);
