/**
 * One bounded scheduled observation cycle.
 * REST closed-bar only. Not a 24/7 worker. Model B remains production authority.
 */
import {
  ASSETS,
  ENGINE_VERSION,
  INTERVAL_MS,
  LOOKBACK,
  TIMEFRAMES,
  VENUE_SYMBOLS,
  type Asset,
  type Timeframe,
} from "../domain/constants.ts";
import type { Decision, MtfBundle, Profile } from "../domain/types.ts";
import { lastClosed } from "../market/candles.ts";
import { loadMtfBundle } from "../market/venues.ts";
import { loadSourceSnaps, measureCorroboration } from "../market/corroboration.ts";
import { emptyRiskDay } from "../risk/risk.ts";
import { decide } from "../engine/engine.ts";
import {
  CONTRACT_VERSION,
  DATA_CONTRACT_VERSION,
  GEOMETRY_VERSION,
  SOURCE_SET,
  decisionHash,
  inputHash,
  paritySlice,
} from "../engine/canonical.ts";
import { assertModelCInfrastructureReady, type EnvMap } from "./gate.ts";
import { ACTIVE_GOLD_SOURCE } from "./gold-source.ts";
import { supabaseJson } from "./rest.ts";
import {
  SCHEDULED_LEASE_MS,
  acquireLease,
  corroborateLatest,
  eventIdFor,
  ingestClosed,
  persistEvent,
  releaseLease,
  writeHealth,
  type IngestCounts,
} from "./worker.ts";
import { compareEngine, compareTape, type TapeCandle } from "./parity.ts";
import {
  computeObserverHealth,
  shouldAdvanceCheckpoint,
  type ObserverHealth,
  type ObserverStatus,
} from "./observer-health.ts";

export const REFERENCE_PROFILE: Profile = {
  id: "profile",
  persona: "Orion",
  equity: 10_000,
  goalTarget: null,
  goalDeadline: null,
  createdAt: 0,
  updatedAt: 0,
};

export type CycleStatus = "SUCCESS" | "LEASE_BLOCKED" | "FAILED" | "UNAVAILABLE";

export type CycleResult = {
  status: CycleStatus;
  observedAt: string;
  observerMode: "scheduled";
  productionAuthority: "model-b";
  continuous: false;
  streaming: false;
  assetsProcessed: number;
  closedCandlesInserted: number;
  closedCandlesUnchanged: number;
  closedCandlesRecovered: number;
  formingIgnored: number;
  conflicts: number;
  decisionsProduced: number;
  decisionsUnchanged: number;
  executionReady: number;
  parity: { tape: "PASS" | "FAIL" | "SKIPPED"; engine: "PASS" | "FAIL" | "SKIPPED" };
  checkpointAdvanced: boolean;
  lease: "ACQUIRED" | "RELEASED" | "LEASE_BLOCKED" | "RELEASE_FAILED";
  observerStatus: ObserverStatus;
  health: ObserverHealth;
  gold: { instrument: string; marketClass: string };
  error?: { code: string; message: string };
  durationMs: number;
};

type Checkpoint = { streams: Record<string, number> };

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function streamKey(venue: string, symbol: string, tf: string): string {
  return `${venue}|${symbol}|${tf}`;
}

export function decisionIdFor(asset: Asset, barOpen: number, hash: string): string {
  return `decision:${asset}:${barOpen}:${hash}`;
}

export function executionReadyLabel(d: Decision): "EXECUTION_READY" | null {
  if (d.family === "breakout") return null;
  if (d.researchStatus.qualification === "QUARANTINED") return null;
  if (d.researchStatus.qualification === "UNVALIDATED") return null;
  if (d.userDecision !== "BUY" && d.userDecision !== "SELL") return null;
  if (d.lifecycle !== "QUALIFIED" && d.lifecycle !== "CANDIDATE" && d.lifecycle !== "RELEASED") return null;
  return "EXECUTION_READY";
}

function emptyCounts(): IngestCounts {
  return { inserted: 0, unchanged: 0, conflict: 0, ignored: 0, failed: 0 };
}

function addCounts(a: IngestCounts, b: IngestCounts): IngestCounts {
  return {
    inserted: a.inserted + b.inserted,
    unchanged: a.unchanged + b.unchanged,
    conflict: a.conflict + b.conflict,
    ignored: a.ignored + b.ignored,
    failed: a.failed + b.failed,
  };
}

export async function fetchWithRetry(
  input: string,
  init: RequestInit = {},
  opts: { retries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 8_000;
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(input, { ...init, signal: ctrl.signal, cache: "no-store" });
      if (res.status >= 500 && i < retries) {
        last = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      last = err;
      if (i >= retries) break;
    } finally {
      clearTimeout(t);
    }
  }
  const message = last instanceof Error ? last.message : "fetch failed";
  throw new Error(message.includes("abort") ? "TIMEOUT" : message);
}

function classifyError(err: unknown): { code: string; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (/TIMEOUT|abort/i.test(message)) return { code: "PROVIDER_TIMEOUT", message };
  if (/HTTP 5/i.test(message)) return { code: "PROVIDER_HTTP", message };
  if (/not an array|missing|malformed/i.test(message)) return { code: "MALFORMED_PROVIDER", message };
  if (/lease/i.test(message)) return { code: "LEASE_BLOCKED", message };
  return { code: "SYSTEM_FAILURE", message: message.slice(0, 240) };
}

async function persistDecision(
  url: string,
  key: string,
  d: Decision,
  hashes: { input: string; decision: string },
): Promise<"inserted" | "unchanged" | "failed"> {
  const id = decisionIdFor(d.asset, d.barOpen ?? 0, hashes.decision);
  const res = await supabaseJson(url, key, "decisions", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify({
      id,
      decided_at: new Date(d.decidedAt).toISOString(),
      asset: d.asset,
      venue: d.venue,
      symbol: d.symbol,
      bar_open: d.barOpen,
      market_state_asset: d.asset,
      user_decision: d.userDecision,
      wait_code: d.waitCode,
      lifecycle: d.lifecycle,
      family: d.family,
      research_status: d.researchStatus.note,
      research_qualification: d.researchStatus.qualification,
      direction: d.direction,
      engine_version: ENGINE_VERSION,
      contract_version: CONTRACT_VERSION,
      data_contract_version: DATA_CONTRACT_VERSION,
      geometry_version: GEOMETRY_VERSION,
      source_set: SOURCE_SET,
      input_hash: hashes.input,
      decision_hash: hashes.decision,
      body: { slice: paritySlice(d), executionReady: executionReadyLabel(d) },
    }),
  });
  if (res.status === 409) return "unchanged";
  if (!res.ok) return "failed";
  if (Array.isArray(res.data) && res.data.length === 0) return "unchanged";
  return "inserted";
}

async function persistThesis(url: string, key: string, d: Decision, decisionId: string): Promise<boolean> {
  const id = `thesis:${d.asset}`;
  const body = {
    id,
    asset: d.asset,
    direction: d.direction,
    invalidator: d.invalidation,
    lifecycle: d.lifecycle,
    family: d.family,
    user_decision: d.userDecision,
    engine_version: ENGINE_VERSION,
    decision_id: decisionId,
    body: { waitCode: d.waitCode, research: d.researchStatus },
  };
  const patch = await supabaseJson(url, key, `system_theses?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (patch.ok) return true;
  const inserted = await supabaseJson(url, key, "system_theses", {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=ignore-duplicates" },
    body: JSON.stringify(body),
  });
  return inserted.ok || inserted.status === 409;
}

function failResult(
  partial: Partial<CycleResult> & { health: ObserverHealth; durationMs: number; observedAt: string },
): CycleResult {
  return {
    status: "FAILED",
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
    gold: { instrument: ACTIVE_GOLD_SOURCE.instrument, marketClass: ACTIVE_GOLD_SOURCE.marketClass },
    ...partial,
  };
}

export async function runObservationCycle(opts?: {
  env?: EnvMap;
  now?: number;
  owner?: string;
  withParity?: boolean;
}): Promise<CycleResult> {
  const started = Date.now();
  const now = opts?.now ?? started;
  const env = opts?.env ?? process.env;
  const observedAt = new Date(now).toISOString();
  const withParity = opts?.withParity !== false;

  const ready = assertModelCInfrastructureReady(env);
  if (ready.engineVersion !== ENGINE_VERSION || ready.contractVersion !== CONTRACT_VERSION) {
    throw new Error("worker version mismatch");
  }
  const url = ready.url;
  const key = env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const mine = opts?.owner ?? process.env.AWURU_OBSERVER_OWNER?.trim() ?? `scheduled-observer-${process.pid}`;

  const prior = await supabaseJson<
    Array<{ feed_status: Record<string, unknown> | null; last_successful_decide: string | null }>
  >(url, key, "system_health?id=eq.awuru&select=feed_status,last_successful_decide", { method: "GET" });
  const previous = prior.data?.[0]?.feed_status && typeof prior.data[0].feed_status === "object" ? prior.data[0].feed_status : {};
  const checkpoint = (previous.checkpoint as Checkpoint | undefined) ?? { streams: {} };
  const priorHealth = (previous.observerHealth as ObserverHealth | undefined) ?? null;
  const priorSuccess = priorHealth?.last_success_at ? Date.parse(priorHealth.last_success_at) : null;
  const priorFails = typeof priorHealth?.consecutive_failures === "number" ? priorHealth.consecutive_failures : 0;

  const lease = await acquireLease(url, key, now, {
    owner: mine,
    leaseMs: SCHEDULED_LEASE_MS,
    note: "SCHEDULED CLOUD OBSERVER. Not 24/7. Model B remains production authority.",
  });
  if (!lease.ok) {
    const health = computeObserverHealth({
      now,
      lastAttemptAt: now,
      lastSuccessAt: priorSuccess,
      lastClosedCloseTime: priorHealth?.last_closed_candle_at ? Date.parse(priorHealth.last_closed_candle_at) : null,
      lastDecisionAt: priorHealth?.last_decision_at ? Date.parse(priorHealth.last_decision_at) : null,
      durationMs: Date.now() - started,
      consecutiveFailures: priorFails,
      leaseStatus: "LEASE_BLOCKED",
      lastErrorCode: "LEASE_BLOCKED",
      cycleFailed: false,
      recovering: false,
      leaseBlocked: true,
    });
    await persistEvent(url, key, {
      type: "SYSTEM_FAILURE",
      id: eventIdFor("SYSTEM_FAILURE", ["LEASE_BLOCKED", now]),
      detail: lease.reason,
      payload: { code: "LEASE_BLOCKED" },
    });
    return {
      status: "LEASE_BLOCKED",
      observedAt,
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
      lease: "LEASE_BLOCKED",
      observerStatus: "LEASE_BLOCKED",
      health,
      gold: { instrument: ACTIVE_GOLD_SOURCE.instrument, marketClass: ACTIVE_GOLD_SOURCE.marketClass },
      error: { code: "LEASE_BLOCKED", message: lease.reason },
      durationMs: Date.now() - started,
    };
  }

  let ingestFailed = false;
  let decideFailed = false;
  let persistFailed = false;
  let formingIgnored = 0;
  let counts = emptyCounts();
  let recovered = 0;
  let decisionsProduced = 0;
  let decisionsUnchanged = 0;
  let executionReady = 0;
  let assetsProcessed = 0;
  let lastClosedClose: number | null = null;
  let lastDecisionAt: number | null = null;
  const nextCheckpoint: Checkpoint = { streams: { ...checkpoint.streams } };
  const modelBTape: TapeCandle[] = [];
  const modelCTape: TapeCandle[] = [];
  const engineDiffs: string[] = [];
  let error: { code: string; message: string } | undefined;
  const newOpenTimes: number[] = [];

  try {
    await writeHealth(url, key, { worker_status: "reconciling", worker_heartbeat: new Date().toISOString() });

    for (const asset of ASSETS) {
      const loaded = await loadMtfBundle(asset, now, fetchWithRetry);
      if (!loaded.bundle || loaded.bundle.venue !== "binance" || loaded.bundle.switched) {
        ingestFailed = true;
        error = {
          code: "PRIMARY_UNAVAILABLE",
          message: loaded.errors.join("; ") || `${asset} binance unavailable — not substituting venue`,
        };
        continue;
      }
      if (asset === "GOLD" && loaded.bundle.instrument !== ACTIVE_GOLD_SOURCE.instrument) {
        ingestFailed = true;
        error = { code: "GOLD_IDENTITY", message: "refusing non-PAXG GOLD tape" };
        continue;
      }
      assetsProcessed += 1;
      const bundle = loaded.bundle;
      for (const tf of TIMEFRAMES) {
        const series = bundle.series[tf];
        if (series.live) formingIgnored += 1;
        const closed = series.candles.slice(-LOOKBACK[tf]);
        const keyName = streamKey("binance", series.symbol, tf);
        const watermark = checkpoint.streams[keyName] ?? 0;
        for (const candle of closed) {
          modelBTape.push({
            venue: "binance",
            symbol: series.symbol,
            timeframe: tf,
            openTime: candle.openTime,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            closed: true,
          });
          const result = await ingestClosed(url, key, {
            venue: "binance",
            symbol: series.symbol,
            timeframe: tf,
            candle,
            asset,
          });
          if (result === "failed") {
            counts.failed += 1;
            ingestFailed = true;
            continue;
          }
          counts[result] += 1;
          if (candle.openTime > watermark) {
            newOpenTimes.push(candle.openTime);
            if (result === "inserted") recovered += 1;
          }
          if (result === "inserted" || result === "unchanged") {
            modelCTape.push({
              venue: "binance",
              symbol: series.symbol,
              timeframe: tf,
              openTime: candle.openTime,
              open: candle.open,
              high: candle.high,
              low: candle.low,
              close: candle.close,
              volume: candle.volume,
              closed: true,
            });
            const last = lastClosed([candle]);
            if (last && (lastClosedClose == null || last.closeTime > lastClosedClose)) lastClosedClose = last.closeTime;
            if (!ingestFailed) nextCheckpoint.streams[keyName] = Math.max(nextCheckpoint.streams[keyName] ?? 0, candle.openTime);
          }
        }
      }

      const snaps = await loadSourceSnaps(asset, now);
      const corroboration = measureCorroboration(snaps, "binance");
      const riskDay = emptyRiskDay(utcDay(now));
      const windowed: MtfBundle = {
        ...bundle,
        series: { ...bundle.series },
      };
      const reconstructed: MtfBundle = {
        ...bundle,
        series: { ...bundle.series },
      };
      for (const tf of TIMEFRAMES) {
        const series = bundle.series[tf];
        const sliced = series.candles.slice(-LOOKBACK[tf]);
        windowed.series[tf] = { ...series, candles: sliced };
        const cloudSlice = sliced.filter((c) =>
          modelCTape.some((row) => row.symbol === series.symbol && row.timeframe === tf && row.openTime === c.openTime),
        );
        reconstructed.series[tf] = { ...series, candles: cloudSlice };
        if (cloudSlice.length !== sliced.length) decideFailed = true;
      }
      const argsB = { bundle: windowed, profile: REFERENCE_PROFILE, riskDay, now, corroboration };
      const dB = decide(argsB);
      const dC = decide({ ...argsB, bundle: reconstructed });
      const [inB, inC, dhB, dhC] = await Promise.all([
        inputHash({ bundle: windowed, corroboration, profile: REFERENCE_PROFILE, riskDay, now }),
        inputHash({ bundle: reconstructed, corroboration, profile: REFERENCE_PROFILE, riskDay, now }),
        decisionHash(dB),
        decisionHash(dC),
      ]);
      const compared = compareEngine(
        { ...paritySlice(dB), inputHash: inB, decisionHash: dhB },
        { ...paritySlice(dC), inputHash: inC, decisionHash: dhC },
      );
      if (!compared.matched) {
        engineDiffs.push(...compared.diffs);
        decideFailed = true;
      }
      const decision = dC;
      const hashes = { input: inC, decision: dhC };
      const persisted = await persistDecision(url, key, decision, hashes);
      if (persisted === "failed") {
        persistFailed = true;
        decideFailed = true;
      } else if (persisted === "inserted") {
        decisionsProduced += 1;
        lastDecisionAt = now;
      } else {
        decisionsUnchanged += 1;
        lastDecisionAt = now;
      }
      const decId = decisionIdFor(decision.asset, decision.barOpen ?? 0, hashes.decision);
      if (!(await persistThesis(url, key, decision, decId))) persistFailed = true;
      const readyLabel = executionReadyLabel(decision);
      if (readyLabel && !decideFailed) {
        executionReady += 1;
        await persistEvent(url, key, {
          type: "CANDIDATE_CREATED",
          asset,
          id: eventIdFor("CANDIDATE_CREATED", [asset, decision.barOpen ?? 0, hashes.decision]),
          detail: "EXECUTION_READY — all AWURU-defined technical qualification gates passed. Not guaranteed profit.",
          payload: {
            technicalState: "EXECUTION_READY",
            lifecycle: decision.lifecycle,
            family: decision.family,
            researchQualification: decision.researchStatus.qualification,
            notGuaranteedProfit: true,
          },
        });
      }
    }

    await corroborateLatest(url, key, now);
  } catch (err) {
    ingestFailed = true;
    error = classifyError(err);
  }

  const tapeReport = compareTape(modelBTape, modelCTape);
  const tapePass = tapeReport.counts.conflicting === 0 && tapeReport.counts.missing_in_c === 0 && tapeReport.counts.matched > 0;
  if (withParity && !tapePass) ingestFailed = true;

  const checkpointAdvanced = shouldAdvanceCheckpoint({ ingestFailed, decideFailed, persistFailed });
  const cycleFailed = ingestFailed || decideFailed || persistFailed;
  const recovering = recovered > 0 && !cycleFailed;
  const consecutiveFailures = cycleFailed ? priorFails + 1 : 0;
  const durationMs = Date.now() - started;
  const health = computeObserverHealth({
    now,
    lastAttemptAt: now,
    lastSuccessAt: cycleFailed ? priorSuccess : now,
    lastClosedCloseTime: lastClosedClose,
    lastDecisionAt,
    durationMs,
    consecutiveFailures,
    leaseStatus: "RELEASED",
    lastErrorCode: cycleFailed ? error?.code ?? "CYCLE_FAILED" : null,
    cycleFailed,
    recovering,
    leaseBlocked: false,
    degraded: counts.conflict > 0,
  });

  const feed = {
    ...lease.previous,
    owner: mine,
    kind: "scheduled",
    continuous: false,
    streaming: false,
    productionAuthority: "model-b",
    gold: ACTIVE_GOLD_SOURCE.id,
    checkpoint: checkpointAdvanced ? nextCheckpoint : checkpoint,
    observerHealth: health,
    lastCycle: {
      status: cycleFailed ? (error?.code === "PRIMARY_UNAVAILABLE" ? "UNAVAILABLE" : "FAILED") : "SUCCESS",
      durationMs,
      counts,
    },
  };

  await writeHealth(url, key, {
    worker_status: cycleFailed ? "degraded" : "scheduled",
    worker_heartbeat: new Date().toISOString(),
    last_valid_market_event: cycleFailed ? undefined : new Date().toISOString(),
    last_successful_decide: lastDecisionAt ? new Date(lastDecisionAt).toISOString() : undefined,
    last_closed_candle: lastClosedClose ? { closeTime: lastClosedClose } : undefined,
    last_persisted_event: new Date().toISOString(),
    database_status: "connected",
    engine_version: ENGINE_VERSION,
    feed_status: feed,
    note: "SCHEDULED CLOUD OBSERVER. Not 24/7. Not production authority.",
  });

  await persistEvent(url, key, {
    type: cycleFailed ? "SYSTEM_FAILURE" : "WORKER_HEARTBEAT",
    id: eventIdFor(cycleFailed ? "SYSTEM_FAILURE" : "WORKER_HEARTBEAT", [mine, now]),
    detail: cycleFailed ? error?.message ?? "cycle failed" : "scheduled observation complete",
    payload: { checkpointAdvanced, counts, health },
  });

  const released = await releaseLease(url, key, mine, {
    kind: "scheduled",
    continuous: false,
    checkpoint: checkpointAdvanced ? nextCheckpoint : checkpoint,
    observerHealth: health,
  });

  const status: CycleStatus = cycleFailed ? (error?.code === "PRIMARY_UNAVAILABLE" ? "UNAVAILABLE" : "FAILED") : "SUCCESS";
  return {
    status,
    observedAt,
    observerMode: "scheduled",
    productionAuthority: "model-b",
    continuous: false,
    streaming: false,
    assetsProcessed,
    closedCandlesInserted: counts.inserted,
    closedCandlesUnchanged: counts.unchanged,
    closedCandlesRecovered: recovered,
    formingIgnored,
    conflicts: counts.conflict,
    decisionsProduced,
    decisionsUnchanged,
    executionReady,
    parity: {
      tape: withParity ? (tapePass ? "PASS" : "FAIL") : "SKIPPED",
      engine: withParity ? (engineDiffs.length === 0 && !decideFailed ? "PASS" : "FAIL") : "SKIPPED",
    },
    checkpointAdvanced,
    lease: released ? "RELEASED" : "RELEASE_FAILED",
    observerStatus: health.observer_status,
    health,
    gold: { instrument: ACTIVE_GOLD_SOURCE.instrument, marketClass: ACTIVE_GOLD_SOURCE.marketClass },
    error: cycleFailed ? error ?? { code: "CYCLE_FAILED", message: "observation cycle failed" } : undefined,
    durationMs,
  };
}

export function httpStatusForCycle(result: CycleResult): number {
  if (result.status === "SUCCESS") return 200;
  if (result.status === "LEASE_BLOCKED") return 409;
  if (result.status === "UNAVAILABLE") return 503;
  return 500;
}
