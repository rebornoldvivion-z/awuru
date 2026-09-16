import { isHostedStagingAttached } from "../../src/awuru/cloud/gate.ts";
import { blockedEngineParity, runLiveEngineParity } from "../../src/awuru/cloud/parity.ts";

const env = process.env;
if (!isHostedStagingAttached(env)) {
  const report = blockedEngineParity(env);
  console.log(JSON.stringify(report, null, 2));
  console.error("ENGINE PARITY NOT STARTED — GATE A BLOCKED");
  process.exit(1);
}

const report = await runLiveEngineParity(env);
console.log(JSON.stringify(report, null, 2));
if (!report.started || !report.matched || report.mismatches !== 0) {
  console.error("ENGINE PARITY FAIL");
  process.exit(1);
}
console.error("ENGINE PARITY PASS mismatches=0");
