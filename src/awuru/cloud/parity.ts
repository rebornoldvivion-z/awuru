import { isHostedStagingAttached, type EnvMap } from "./gate.ts";
import type { ParitySlice } from "../engine/canonical.ts";
import { ASSETS, LOOKBACK, TIMEFRAMES, type Asset } from "../domain/constants.ts";
import { decide } from "../engine/engine.ts";
import { decisionHash, inputHash, paritySlice } from "../engine/canonical.ts";
import { emptyRiskDay } from "../risk/risk.ts";
import { loadMtfBundle } from "../market/venues.ts";
import { loadSourceSnaps, measureCorroboration } from "../market/corroboration.ts";
import { supabaseJson } from "./rest.ts";
import type { Candle, MtfBundle, Profile } from "../domain/types.ts";

export const TAPE_OHLC_TOLERANCE = "exact";

export type TapeCandle = {
  venue: string;
  symbol: string;
  timeframe: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closed: boolean;
  ingestedAt?: number;
};

export type TapeKind = "matched" | "missing_in_b" | "missing_in_c" | "conflicting" | "delayed" | "extra";

export type TapeVerdict = {
  kind: TapeKind;
  identity: string;
  fields?: string[];
};

export type TapeWindow = { from: number; to: number };

export type TapeParityReport = {
  started: boolean;
  gate: "A" | "C";
  status: "not_started" | "compared";
  reason?: string;
  tolerance: typeof TAPE_OHLC_TOLERANCE;
  window: TapeWindow | null;
  counts: Record<TapeKind, number>;
  rows: TapeVerdict[];
};

export function candleIdentity(row: Pick<TapeCandle, "venue" | "symbol" | "timeframe" | "openTime">): string {
  return `${row.venue}|${row.symbol}|${row.timeframe}|${row.openTime}`;
}

function inWindow(row: TapeCandle, window: TapeWindow | null): boolean {
  if (!window) return true;
  return row.openTime >= window.from && row.openTime <= window.to;
}

function ohlcFields(a: TapeCandle, b: TapeCandle): string[] {
  const fields: string[] = [];
  for (const k of ["open", "high", "low", "close", "closed", "openTime"] as const) {
    if (a[k] !== b[k]) fields.push(k);
  }
  if (a.volume !== undefined && b.volume !== undefined && a.volume !== b.volume) fields.push("volume");
  return fields;
}

/** Compare closed-bar identity/content. Exact numeric equality. Does not hide mismatches. */
export function compareTape(
  modelB: TapeCandle[],
  modelC: TapeCandle[],
  window: TapeWindow | null = null,
): TapeParityReport {
  const bMap = new Map<string, TapeCandle>();
  const cMap = new Map<string, TapeCandle>();
  for (const row of modelB) {
    if (inWindow(row, window)) bMap.set(candleIdentity(row), row);
  }
  for (const row of modelC) {
    if (inWindow(row, window)) cMap.set(candleIdentity(row), row);
  }

  const rows: TapeVerdict[] = [];
  for (const [id, b] of bMap) {
    const c = cMap.get(id);
    if (!c) {
      rows.push({ kind: "missing_in_c", identity: id });
      continue;
    }
    const fields = ohlcFields(b, c);
    if (fields.length) {
      rows.push({ kind: "conflicting", identity: id, fields });
      continue;
    }
    if (c.ingestedAt !== undefined && b.ingestedAt !== undefined && c.ingestedAt - b.ingestedAt > 60_000) {
      rows.push({ kind: "delayed", identity: id });
      continue;
    }
    rows.push({ kind: "matched", identity: id });
  }
  for (const [id] of cMap) {
    if (!bMap.has(id)) rows.push({ kind: window ? "extra" : "missing_in_b", identity: id });
  }

  const counts: Record<TapeKind, number> = {
    matched: 0,
    missing_in_b: 0,
    missing_in_c: 0,
    conflicting: 0,
    delayed: 0,
    extra: 0,
  };
  for (const row of rows) counts[row.kind] += 1;

  return {
    started: true,
    gate: "C",
    status: "compared",
    tolerance: TAPE_OHLC_TOLERANCE,
    window,
    counts,
    rows,
  };
}

export type EngineParityRow = ParitySlice & {
  inputHash: string;
  decisionHash: string;
};

export type EngineParityReport = {
  started: boolean;
  gate: "A" | "D";
  status: "not_started" | "compared";
  reason?: string;
  matched: boolean;
  diffs: string[];
};

export function compareEngine(modelB: EngineParityRow, modelC: EngineParityRow): EngineParityReport {
  const diffs: string[] = [];
  const keys: (keyof EngineParityRow)[] = [
    "engineVersion",
    "userDecision",
    "waitCode",
    "lifecycle",
    "family",
    "researchQualification",
    "regimeKind",
    "structureRead",
    "direction",
    "inputHash",
    "decisionHash",
  ];
  for (const k of keys) {
    if (modelB[k] !== modelC[k]) diffs.push(`${k}: ${String(modelB[k])} ≠ ${String(modelC[k])}`);
  }
  return {
    started: true,
    gate: "D",
    status: "compared",
    matched: diffs.length === 0,
    diffs,
  };
}

export function blockedTapeParity(env?: EnvMap): TapeParityReport {
  return {
    started: false,
    gate: "A",
    status: "not_started",
    reason: isHostedStagingAttached(env)
      ? "HOSTED_ATTACHED_BUT_WORKER_NOT_PROVISIONED"
      : "NO_HOSTED_SUPABASE",
    tolerance: TAPE_OHLC_TOLERANCE,
    window: null,
    counts: { matched: 0, missing_in_b: 0, missing_in_c: 0, conflicting: 0, delayed: 0, extra: 0 },
    rows: [],
  };
}

export function blockedEngineParity(env?: EnvMap): EngineParityReport {
  return {
    started: false,
    gate: "A",
    status: "not_started",
    reason: isHostedStagingAttached(env)
      ? "HOSTED_ATTACHED_BUT_WORKER_NOT_PROVISIONED"
      : "NO_HOSTED_SUPABASE",
    matched: false,
    diffs: [],
  };
}

/** Sync entry used by unit tests. Live compare is runLiveTapeParity. */
export function runTapeParity(env?: EnvMap): TapeParityReport {
  return blockedTapeParity(env);
}

/** Sync entry used by unit tests. Live compare is runLiveEngineParity. */
export function runEngineParity(env?: EnvMap): EngineParityReport {
  return blockedEngineParity(env);
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

const PARITY_PROFILE: Profile = {
  id: "profile",
  persona: "Orion",
  equity: 10_000,
  goalTarget: null,
  goalDeadline: null,
  createdAt: 0,
  updatedAt: 0,
};

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

async function fetchCloudCandles(
  url: string,
  key: string,
  venue: string,
  symbol: string,
  timeframe: string,
  from: number,
): Promise<TapeCandle[]> {
  const path = `candles?venue=eq.${venue}&symbol=eq.${symbol}&timeframe=eq.${timeframe}&open_time=gte.${from}&select=venue,symbol,timeframe,open_time,open,high,low,close,volume,closed&order=open_time.asc`;
  const res = await supabaseJson<
    Array<{
      venue: string;
      symbol: string;
      timeframe: string;
      open_time: number | string;
      open: number | string;
      high: number | string;
      low: number | string;
      close: number | string;
      volume: number | string;
      closed: boolean;
    }>
  >(url, key, path, { method: "GET" });
  if (!res.ok || !res.data) return [];
  return res.data.map((row) => ({
    venue: row.venue,
    symbol: row.symbol,
    timeframe: row.timeframe,
    openTime: num(row.open_time),
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    close: num(row.close),
    volume: num(row.volume),
    closed: row.closed === true,
  }));
}

export async function runLiveTapeParity(env: EnvMap = process.env): Promise<TapeParityReport> {
  if (!isHostedStagingAttached(env)) return blockedTapeParity(env);
  const url = env.AWURU_SUPABASE_URL!.trim();
  const key = env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const now = Date.now();
  const modelB: TapeCandle[] = [];
  const modelC: TapeCandle[] = [];
  let windowFrom = now;
  for (const asset of ASSETS) {
    const loaded = await loadMtfBundle(asset, now);
    if (!loaded.bundle || loaded.bundle.venue !== "binance") continue;
    for (const tf of TIMEFRAMES) {
      const series = loaded.bundle.series[tf];
      const closed = series.candles.slice(-LOOKBACK[tf]);
      for (const c of closed) {
        windowFrom = Math.min(windowFrom, c.openTime);
        modelB.push({
          venue: "binance",
          symbol: series.symbol,
          timeframe: tf,
          openTime: c.openTime,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
          closed: true,
        });
      }
      const cloud = await fetchCloudCandles(url, key, "binance", series.symbol, tf, closed[0]?.openTime ?? now);
      modelC.push(...cloud.filter((row) => row.closed));
    }
  }
  return compareTape(modelB, modelC, { from: windowFrom, to: now });
}

export type EngineParitySuite = {
  started: boolean;
  gate: "D";
  matched: boolean;
  mismatches: number;
  assets: Record<string, EngineParityReport>;
};

function toEngineRow(d: ReturnType<typeof decide>, input: string, decision: string): EngineParityRow {
  const slice = paritySlice(d);
  return { ...slice, inputHash: input, decisionHash: decision };
}

export async function runLiveEngineParity(env: EnvMap = process.env): Promise<EngineParitySuite> {
  const empty: EngineParitySuite = {
    started: false,
    gate: "D",
    matched: false,
    mismatches: 1,
    assets: {},
  };
  if (!isHostedStagingAttached(env)) {
    return { ...empty, assets: { _: blockedEngineParity(env) } };
  }
  const url = env.AWURU_SUPABASE_URL!.trim();
  const key = env.AWURU_SUPABASE_SERVICE_ROLE_KEY!.trim();
  const now = Date.now();
  const assets: Record<string, EngineParityReport> = {};
  let mismatches = 0;
  for (const asset of ASSETS as readonly Asset[]) {
    const loaded = await loadMtfBundle(asset, now);
    const bundleB = loaded.bundle;
    if (!bundleB) {
      assets[asset] = { started: true, gate: "D", status: "compared", matched: false, diffs: ["bundle_b_missing"] };
      mismatches += 1;
      continue;
    }
    const snaps = await loadSourceSnaps(asset, now);
    const corroboration = measureCorroboration(snaps, bundleB.venue);
    const argsB = {
      bundle: bundleB,
      profile: PARITY_PROFILE,
      riskDay: emptyRiskDay(utcDay(now)),
      now,
      corroboration,
    };
    const reconstructed: MtfBundle = {
      ...bundleB,
      series: { ...bundleB.series },
    };
    let missing = 0;
    for (const tf of TIMEFRAMES) {
      const series = bundleB.series[tf];
      const windowed = series.candles.slice(-LOOKBACK[tf]);
      const from = windowed[0]?.openTime ?? now;
      const cloud = await fetchCloudCandles(url, key, bundleB.venue, series.symbol, tf, from);
      const byOpen = new Map(cloud.map((c) => [c.openTime, c]));
      const candles: Candle[] = [];
      for (const c of windowed) {
        const hit = byOpen.get(c.openTime);
        if (!hit) {
          missing += 1;
          continue;
        }
        candles.push({
          openTime: hit.openTime,
          closeTime: c.closeTime,
          open: hit.open,
          high: hit.high,
          low: hit.low,
          close: hit.close,
          volume: hit.volume ?? c.volume,
          confirm: c.confirm,
        });
      }
      reconstructed.series[tf] = { ...series, candles };
    }
    const bundleBWindow: MtfBundle = {
      ...bundleB,
      series: { ...bundleB.series },
    };
    for (const tf of TIMEFRAMES) {
      const series = bundleB.series[tf];
      bundleBWindow.series[tf] = { ...series, candles: series.candles.slice(-LOOKBACK[tf]) };
    }
    const argsWindow = { ...argsB, bundle: bundleBWindow };
    const dB = decide(argsWindow);
    const dC = decide({ ...argsWindow, bundle: reconstructed });
    const [hB, hC, dhB, dhC] = await Promise.all([
      inputHash({ bundle: bundleBWindow, corroboration, profile: PARITY_PROFILE, riskDay: argsB.riskDay, now }),
      inputHash({ bundle: reconstructed, corroboration, profile: PARITY_PROFILE, riskDay: argsB.riskDay, now }),
      decisionHash(dB),
      decisionHash(dC),
    ]);
    const compared = compareEngine(toEngineRow(dB, hB, dhB), toEngineRow(dC, hC, dhC));
    if (missing) {
      compared.diffs.push(`missing_cloud_bars:${missing}`);
      compared.matched = false;
    }
    assets[asset] = compared;
    if (!compared.matched) mismatches += 1;
  }
  return { started: true, gate: "D", matched: mismatches === 0, mismatches, assets };
}
