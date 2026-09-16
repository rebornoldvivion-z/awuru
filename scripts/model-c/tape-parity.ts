import { isHostedStagingAttached } from "../../src/awuru/cloud/gate.ts";
import { blockedTapeParity, runLiveTapeParity } from "../../src/awuru/cloud/parity.ts";

const env = process.env;
if (!isHostedStagingAttached(env)) {
  const report = blockedTapeParity(env);
  console.log(JSON.stringify(report, null, 2));
  console.error("TAPE PARITY NOT STARTED — GATE A BLOCKED");
  process.exit(1);
}

const report = await runLiveTapeParity(env);
console.log(JSON.stringify(report, null, 2));
const denom = report.counts.matched + report.counts.conflicting + report.counts.missing_in_c + report.counts.missing_in_b;
const pct = denom === 0 ? 0 : (100 * report.counts.matched) / denom;
console.error(`TAPE PARITY matched=${report.counts.matched} denom=${denom} pct=${pct.toFixed(4)}% tolerance=exact`);
if (!report.started || pct < 99.9 || report.counts.conflicting > 0) {
  console.error("TAPE PARITY FAIL");
  process.exit(1);
}
