import { proveLeaseRefusal, proveWebsocketRecovery, writeHealth } from "../../src/awuru/cloud/worker.ts";
import { assertModelCInfrastructureReady } from "../../src/awuru/cloud/gate.ts";

const lease = await proveLeaseRefusal();
const recovery = await proveWebsocketRecovery(12_000);
const ready = assertModelCInfrastructureReady(process.env);
const key = process.env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
await writeHealth(ready.url, key, {
  worker_heartbeat: "2020-01-01T00:00:00.000Z",
  worker_status: "observing",
  feed_status: { owner: null, note: "lease released after recovery proof" },
  note: "Stage 2 recovery proof complete. Render.com not provisioned.",
});
const report = { lease, recovery, render: "not_provisioned" };
console.log(JSON.stringify(report, null, 2));
const leaseOk = lease.second.ok === false && /lease_held_by_/.test(lease.second.reason);
if (!leaseOk || !recovery.ok) {
  console.error("RECOVERY FAIL");
  process.exit(1);
}
console.error("RECOVERY PASS");
