/**
 * Staging health web. Not the public Command Center.
 * Bind PORT from Render, never 8080 in the App Builder preview.
 */
import http from "node:http";
import { assertModelCInfrastructureReady } from "../../src/awuru/cloud/gate.ts";
import { supabaseJson } from "../../src/awuru/cloud/rest.ts";
import { MODEL_C_STATUS } from "../../src/awuru/cloud/status.ts";
import { ENGINE_VERSION } from "../../src/awuru/domain/constants.ts";

const port = Number(process.env.PORT ?? 8787);
if (port === 8080) {
  throw new Error("staging web must not bind the Model B preview port");
}

const server = http.createServer(async (_req, res) => {
  let body: Record<string, unknown> = {
    ok: false,
    role: "model-c-staging-web",
    productionAuthority: "model-b",
    engine: ENGINE_VERSION,
    render: MODEL_C_STATUS.render,
    cloudAuthoritative: false,
  };
  try {
    const ready = assertModelCInfrastructureReady(process.env);
    const key = process.env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
    const health = await supabaseJson(ready.url, key, "system_health?id=eq.awuru&select=worker_status,engine_version,database_status,worker_heartbeat", {
      method: "GET",
    });
    body = {
      ...body,
      ok: health.ok,
      environment: ready.environment,
      worker: health.data,
    };
  } catch (err) {
    body.error = err instanceof Error ? err.message : "unready";
  }
  const json = JSON.stringify(body);
  res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(json);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`model-c staging web :${port}`);
});
