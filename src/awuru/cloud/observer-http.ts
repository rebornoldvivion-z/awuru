import { authorizeObserver } from "./observer-auth.ts";
import { httpStatusForCycle, runObservationCycle, type CycleResult } from "./observe-cycle.ts";
import { MODEL_C_STATUS } from "./status.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";
import { supabaseJson } from "./rest.ts";
import { isHostedStagingAttached } from "./gate.ts";

export type HttpResult = { status: number; json: Record<string, unknown> };

let inflight: Promise<CycleResult> | null = null;
let lastCycle: CycleResult | null = null;

function header(headers: Headers | Record<string, string | undefined>, name: string): string | undefined {
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? (headers as Headers).get(name.toLowerCase()) ?? undefined;
  }
  const rec = headers as Record<string, string | undefined>;
  return rec[name] ?? rec[name.toLowerCase()] ?? rec[name.toUpperCase()];
}

export function publicHealthPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    productionAuthority: "model-b",
    engineVersion: ENGINE_VERSION,
    observerMode: "scheduled",
    continuous: false,
    streaming: false,
    renderWorker: "not_provisioned",
    cloudAuthoritative: false,
    gateA: MODEL_C_STATUS.gateA,
    ...extra,
  };
}

export async function handleObserverRoute(args: {
  method: string;
  pathname: string;
  headers: Headers | Record<string, string | undefined>;
  env?: NodeJS.ProcessEnv;
}): Promise<HttpResult> {
  const env = args.env ?? process.env;
  const method = args.method.toUpperCase();
  const path = args.pathname.replace(/\/$/, "") || "/";

  if (method === "GET" && (path === "/api/model-c/health" || path === "/healthz" || path === "/")) {
    const attached = isHostedStagingAttached(env);
    let cloud: unknown = null;
    if (attached) {
      const url = env.AWURU_SUPABASE_URL!.trim();
      const key = env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
      const health = await supabaseJson<Array<Record<string, unknown>>>(url, key, "system_health?id=eq.awuru&select=worker_status,worker_heartbeat,feed_status,database_status,engine_version,note", {
        method: "GET",
      });
      cloud = health.ok ? health.data?.[0] ?? null : { error: health.status };
    }
    return {
      status: 200,
      json: publicHealthPayload({
        ok: true,
        supabaseStatus: attached ? "attached" : "not_in_this_process",
        lastSuccessfulObservation: lastCycle?.status === "SUCCESS" ? lastCycle.observedAt : lastCycle?.health.last_success_at ?? null,
        lastClosedCandle: lastCycle?.health.last_closed_candle_at ?? null,
        dataAge: lastCycle?.health.data_age_seconds ?? null,
        leaseStatus: lastCycle?.lease ?? "unknown",
        lastCycle: lastCycle
          ? {
              status: lastCycle.status,
              observerStatus: lastCycle.observerStatus,
              durationMs: lastCycle.durationMs,
              checkpointAdvanced: lastCycle.checkpointAdvanced,
            }
          : null,
        inflight: Boolean(inflight),
        systemHealth: cloud,
      }),
    };
  }

  if (method === "POST" && path === "/internal/model-c/observe") {
    const auth = authorizeObserver(header(args.headers, "authorization") ?? header(args.headers, "x-awuru-observer-key"), env);
    if (!auth.ok) {
      return { status: auth.status, json: { status: "FAILED", error: { code: auth.code }, productionAuthority: "model-b" } };
    }
    if (!inflight) {
      inflight = runObservationCycle({ env, owner: env.AWURU_OBSERVER_OWNER })
        .catch((err): CycleResult => ({
          status: "FAILED",
          observedAt: new Date().toISOString(),
          observerMode: "scheduled",
          productionAuthority: "model-b",
          continuous: false,
          streaming: false,
          assetsProcessed: 0,
          closedCandlesInserted: 0,
          closedCandlesUnchanged: 0,
          closedCandlesRecovered: 0,
          formingIgnored: 0,
          conflicts: 0,
          decisionsProduced: 0,
          decisionsUnchanged: 0,
          executionReady: 0,
          parity: { tape: "SKIPPED", engine: "SKIPPED" },
          checkpointAdvanced: false,
          lease: "RELEASED",
          observerStatus: "FAILED",
          health: {
            last_attempt_at: new Date().toISOString(),
            last_success_at: null,
            last_closed_candle_at: null,
            last_decision_at: null,
            scheduler_received_at: new Date().toISOString(),
            scheduler_lag_seconds: 0,
            data_age_seconds: null,
            observation_duration_ms: 0,
            missed_intervals: 0,
            consecutive_failures: 1,
            observer_status: "FAILED",
            lease_status: "RELEASED",
            last_error_code: "UNHANDLED",
          },
          gold: { instrument: "PAXGUSDT", marketClass: "TOKENIZED_GOLD_PROXY" },
          error: { code: "UNHANDLED", message: err instanceof Error ? err.message : "unhandled" },
          durationMs: 0,
        }))
        .finally(() => {
          inflight = null;
        });
      inflight.then((r) => {
        lastCycle = r;
      });
    }
    const timeoutMs = Number(env.AWURU_OBSERVER_WAIT_MS ?? 22_000);
    const raced = await Promise.race([
      inflight.then((r) => ({ kind: "done" as const, r })),
      new Promise<{ kind: "timeout" }>((resolve) => setTimeout(() => resolve({ kind: "timeout" }), timeoutMs)),
    ]);
    if (raced.kind === "timeout") {
      return {
        status: 202,
        json: publicHealthPayload({
          status: "RECOVERING",
          message: "observation cycle still running after cold start; poll /api/model-c/health",
          inflight: true,
        }),
      };
    }
    lastCycle = raced.r;
    return { status: httpStatusForCycle(raced.r), json: raced.r as unknown as Record<string, unknown> };
  }

  return { status: 404, json: { error: "not found", productionAuthority: "model-b" } };
}
