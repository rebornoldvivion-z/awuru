import { verifyHostedSupabase } from "../../src/awuru/cloud/hosted.ts";

const report = await verifyHostedSupabase();
console.log(JSON.stringify(report, null, 2));
if (!report.ok) {
  console.error("GATE A BLOCKED");
  process.exit(1);
}
