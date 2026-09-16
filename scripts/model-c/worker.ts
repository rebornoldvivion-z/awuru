import { runObserverLoop, runObserverOnce } from "../../src/awuru/cloud/worker.ts";

const mode = process.argv.includes("--loop") || process.env.AWURU_WORKER_MODE === "loop" ? "loop" : "once";

if (mode === "loop") {
  const ac = new AbortController();
  process.on("SIGTERM", () => ac.abort());
  process.on("SIGINT", () => ac.abort());
  await runObserverLoop(ac.signal);
} else {
  const report = await runObserverOnce();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}
