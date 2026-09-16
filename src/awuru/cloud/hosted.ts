import { decisionHash, inputHash } from "../engine/canonical.ts";
import { STAGE0_HASH_DECISION, STAGE0_HASH_INPUT } from "./hash-fixture.ts";
import { isHostedStagingAttached, readModelCEnvironment, type EnvMap } from "./gate.ts";
import { MODEL_C_STATUS } from "./status.ts";

export type HostedCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type HostedVerificationReport = {
  ok: boolean;
  gate: "A";
  connected: boolean;
  reason: string;
  projectUrl: string | null;
  environment: string | null;
  workerStatus: typeof MODEL_C_STATUS.workerStatus;
  checks: HostedCheck[];
  inputHash?: string;
  decisionHash?: string;
};

const REQUIRED_RELATIONS = [
  "awuru_schema_migrations",
  "candles",
  "candle_conflicts",
  "source_snapshots",
  "market_state",
  "system_health",
  "system_theses",
  "events",
  "decisions",
  "user_profiles",
  "user_notes",
];

function envOf(env?: EnvMap): EnvMap {
  if (env) return env;
  if (typeof process === "undefined") return {};
  return process.env;
}

function publicUrl(raw: string): string {
  return raw.replace(/\/$/, "");
}

async function rest(
  url: string,
  key: string,
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<Response> {
  return fetchImpl(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
}

export async function verifyHostedSupabase(opts?: {
  env?: EnvMap;
  fetch?: typeof fetch;
}): Promise<HostedVerificationReport> {
  const env = envOf(opts?.env);
  const environment = (() => {
    try {
      return readModelCEnvironment(env);
    } catch (err) {
      return err instanceof Error ? err.message : "invalid";
    }
  })();
  const url = env.AWURU_SUPABASE_URL?.trim() || null;
  const service = env.AWURU_SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
  const anon = env.AWURU_SUPABASE_ANON_KEY?.trim() || null;

  const blocked = (reason: string): HostedVerificationReport => ({
    ok: false,
    gate: "A",
    connected: false,
    reason,
    projectUrl: url,
    environment: typeof environment === "string" ? environment : null,
    workerStatus: MODEL_C_STATUS.workerStatus,
    checks: [],
  });

  if (!url || !service) return blocked("NO_HOSTED_SUPABASE");
  if (environment !== "staging") return blocked("ENVIRONMENT_NOT_STAGING");
  if (!isHostedStagingAttached(env)) return blocked("NO_HOSTED_SUPABASE");

  const fetchImpl = opts?.fetch ?? globalThis.fetch;
  if (!fetchImpl) return blocked("FETCH_UNAVAILABLE");

  const checks: HostedCheck[] = [];
  const base = publicUrl(url);

  let connected = false;
  try {
    const health = await rest(base, service, "awuru_schema_migrations?select=version,name", { method: "GET" }, fetchImpl);
    connected = health.ok;
    if (!health.ok) {
      return {
        ok: false,
        gate: "A",
        connected: false,
        reason: `CANNOT_CONNECT HTTP ${health.status}`,
        projectUrl: url,
        environment,
        workerStatus: MODEL_C_STATUS.workerStatus,
        checks: [{ name: "connect", ok: false, detail: `schema_migrations HTTP ${health.status}` }],
      };
    }
    const versions = (await health.json()) as Array<{ version: string; name: string }>;
    const found = versions.some((v) => v.version === "20260913000001" && v.name === "stage1_foundation");
    checks.push({
      name: "schema_version",
      ok: found,
      detail: found ? "20260913000001 stage1_foundation" : JSON.stringify(versions),
    });
  } catch (err) {
    return blocked(`CANNOT_CONNECT ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const rel of REQUIRED_RELATIONS) {
    const res = await rest(base, service, `${rel}?select=*&limit=1`, { method: "GET" }, fetchImpl);
    checks.push({
      name: `table:${rel}`,
      ok: res.ok,
      detail: res.ok ? "present" : `HTTP ${res.status}`,
    });
  }

  const healthRow = await rest(
    base,
    service,
    "system_health?select=worker_status,engine_version&id=eq.awuru",
    { method: "GET" },
    fetchImpl,
  );
  if (healthRow.ok) {
    const rows = (await healthRow.json()) as Array<{ worker_status: string; engine_version: string }>;
    const workerOk = Boolean(rows[0]?.worker_status);
    const engine = rows[0]?.engine_version === "7.3.0";
    checks.push({
      name: "worker_status",
      ok: workerOk,
      detail: rows[0]?.worker_status ?? "missing",
    });
    checks.push({
      name: "engine_version",
      ok: engine,
      detail: rows[0]?.engine_version ?? "missing",
    });
  } else {
    checks.push({ name: "worker_status", ok: false, detail: `HTTP ${healthRow.status}` });
  }

  if (anon) {
    const anonPrivate = await rest(base, anon, "user_notes?select=id", { method: "GET" }, fetchImpl);
    const privateDenied = !anonPrivate.ok || ((await anonPrivate.json()) as unknown[]).length === 0;
    checks.push({
      name: "anon_private_restricted",
      ok: privateDenied,
      detail: `HTTP ${anonPrivate.status}`,
    });
    const anonMarket = await rest(base, anon, "market_state?select=asset", { method: "GET" }, fetchImpl);
    checks.push({
      name: "anon_market_readable",
      ok: anonMarket.ok,
      detail: `HTTP ${anonMarket.status}`,
    });
    const anonIngest = await rest(
      base,
      anon,
      "rpc/ingest_closed_candle",
      {
        method: "POST",
        body: JSON.stringify({
          p_venue: "binance",
          p_symbol: "BTCUSDT",
          p_timeframe: "15m",
          p_open_time: 0,
          p_close_time: 1,
          p_open: 1,
          p_high: 1,
          p_low: 1,
          p_close: 1,
          p_volume: 1,
          p_confirm: "1",
          p_asset: "BTC",
          p_instrument: "BTCUSDT",
          p_market_class: "CRYPTO_SPOT",
        }),
      },
      fetchImpl,
    );
    checks.push({
      name: "anon_cannot_ingest",
      ok: !anonIngest.ok,
      detail: `HTTP ${anonIngest.status}`,
    });
  } else {
    checks.push({ name: "anon_key", ok: false, detail: "AWURU_SUPABASE_ANON_KEY missing; RLS probe skipped" });
  }

  const open = Date.UTC(2026, 0, 15, 11, 45, 0);
  const close = open + 15 * 60 * 1000 - 1;
  const ingestBody = {
    p_venue: "binance",
    p_symbol: "PAXGUSDT",
    p_timeframe: "15m",
    p_open_time: open,
    p_close_time: close,
    p_open: 100,
    p_high: 110,
    p_low: 90,
    p_close: 105,
    p_volume: 3,
    p_confirm: "1",
    p_asset: "GOLD",
    p_instrument: "PAXGUSDT",
    p_market_class: "TOKENIZED_GOLD_PROXY",
  };
  const inserted = await rest(base, service, "rpc/ingest_closed_candle", { method: "POST", body: JSON.stringify(ingestBody) }, fetchImpl);
  const insertText = inserted.ok ? String(await inserted.json()) : `HTTP ${inserted.status}`;
  const insertNorm = insertText.replace(/"/g, "");
  checks.push({
    name: "service_role_ingest",
    ok: inserted.ok && (insertNorm === "inserted" || insertNorm === "unchanged"),
    detail: insertText,
  });

  const unchanged = await rest(base, service, "rpc/ingest_closed_candle", { method: "POST", body: JSON.stringify(ingestBody) }, fetchImpl);
  const unchangedText = unchanged.ok ? String(await unchanged.json()) : `HTTP ${unchanged.status}`;
  checks.push({ name: "duplicate_noop", ok: unchanged.ok && unchangedText.replace(/"/g, "") === "unchanged", detail: unchangedText });

  const conflictBody = { ...ingestBody, p_close: 106 };
  const conflict = await rest(base, service, "rpc/ingest_closed_candle", { method: "POST", body: JSON.stringify(conflictBody) }, fetchImpl);
  const conflictText = conflict.ok ? String(await conflict.json()) : `HTTP ${conflict.status}`;
  checks.push({ name: "conflict_quarantine", ok: conflict.ok && conflictText.replace(/"/g, "") === "conflict", detail: conflictText });

  const kept = await rest(
    base,
    service,
    `candles?select=close,instrument,market_class&venue=eq.binance&symbol=eq.PAXGUSDT&open_time=eq.${open}`,
    { method: "GET" },
    fetchImpl,
  );
  if (kept.ok) {
    const rows = (await kept.json()) as Array<{ close: number | string; instrument: string; market_class: string }>;
    const row = rows[0];
    checks.push({
      name: "canonical_unchanged",
      ok: Boolean(row) && Number(row.close) === 105,
      detail: row ? String(row.close) : "missing",
    });
    checks.push({
      name: "gold_paxg_identity",
      ok: row?.instrument === "PAXGUSDT" && row?.market_class === "TOKENIZED_GOLD_PROXY",
      detail: row ? `${row.instrument}/${row.market_class}` : "missing",
    });
  } else {
    checks.push({ name: "canonical_unchanged", ok: false, detail: `HTTP ${kept.status}` });
  }

  const ih = await inputHash(STAGE0_HASH_INPUT);
  const dh = await decisionHash(STAGE0_HASH_DECISION as never);
  const decisionId = `stage2-hash-${ih.slice(0, 12)}`;
  const insertDecision = await rest(
    base,
    service,
    "decisions",
    {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
      body: JSON.stringify({
        id: decisionId,
        decided_at: new Date(Date.UTC(2026, 0, 15, 12, 0, 0)).toISOString(),
        asset: "BTC",
        user_decision: "WAIT",
        wait_code: "WAIT_DATA",
        lifecycle: "OBSERVING",
        family: null,
        research_status: "NONE",
        research_qualification: "NONE",
        engine_version: "7.3.0",
        contract_version: "c-1",
        data_contract_version: "tape-1",
        geometry_version: "g-7.3.0",
        source_set: "binance+kraken+okx",
        input_hash: ih,
        decision_hash: dh,
        body: { probe: "stage0-hash" },
      }),
    },
    fetchImpl,
  );
  const readDecision = await rest(
    base,
    service,
    `decisions?select=input_hash,decision_hash&id=eq.${decisionId}`,
    { method: "GET" },
    fetchImpl,
  );
  if (readDecision.ok) {
    const rows = (await readDecision.json()) as Array<{ input_hash: string; decision_hash: string }>;
    const row = rows[0];
    checks.push({
      name: "input_hash_persisted",
      ok: row?.input_hash === ih,
      detail: row?.input_hash ?? `insert HTTP ${insertDecision.status}`,
    });
    checks.push({
      name: "decision_hash_persisted",
      ok: row?.decision_hash === dh,
      detail: row?.decision_hash ?? "missing",
    });
  } else {
    checks.push({ name: "input_hash_persisted", ok: false, detail: `HTTP ${readDecision.status}` });
  }

  const patch = await rest(
    base,
    service,
    `decisions?id=eq.${decisionId}`,
    { method: "PATCH", body: JSON.stringify({ wait_code: "WAIT_HTF" }) },
    fetchImpl,
  );
  checks.push({
    name: "decisions_append_only",
    ok: !patch.ok,
    detail: `HTTP ${patch.status}`,
  });

  const allOk = checks.every((c) => c.ok);
  return {
    ok: allOk,
    gate: "A",
    connected,
    reason: allOk ? "HOSTED_STAGE1_VERIFIED" : "HOSTED_CHECKS_FAILED",
    projectUrl: url,
    environment,
    workerStatus: MODEL_C_STATUS.workerStatus,
    checks,
    inputHash: ih,
    decisionHash: dh,
  };
}
