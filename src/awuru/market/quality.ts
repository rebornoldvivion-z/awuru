import {
  AGE_DELAYED_MULT,
  AGE_STALE_MULT,
  LOOKBACK,
  type QualityState,
  type Timeframe,
  type Venue,
} from "../domain/constants.ts";
import type { Quality, Series } from "../domain/types.ts";
import { findGaps, lastClosed } from "./candles.ts";
import { INTERVAL_MS } from "../domain/constants.ts";

export function ageState(ageMs: number, intervalMsValue: number): QualityState {
  if (ageMs >= AGE_STALE_MULT * intervalMsValue) return "STALE";
  if (ageMs >= AGE_DELAYED_MULT * intervalMsValue) return "DELAYED";
  return "LIVE";
}

export function assessSeries(
  series: Series,
  nowMs: number,
  lookback = LOOKBACK[series.timeframe],
): { state: QualityState; reason: string; lastClosedOpen: number | null; ageMs: number | null } {
  const iv = INTERVAL_MS[series.timeframe];
  const last = lastClosed(series.candles);
  if (!last) {
    return { state: "INVALID", reason: "no closed candles", lastClosedOpen: null, ageMs: null };
  }
  if (series.candles.length < lookback) {
    return {
      state: "PARTIAL",
      reason: `need ${lookback} closed ${series.timeframe} bars, have ${series.candles.length}`,
      lastClosedOpen: last.openTime,
      ageMs: nowMs - (last.openTime + iv),
    };
  }
  const gaps = findGaps(series.candles.slice(-lookback), iv);
  if (gaps.length > 0) {
    return {
      state: "PARTIAL",
      reason: `missing bar at ${new Date(gaps[0]!).toISOString()}`,
      lastClosedOpen: last.openTime,
      ageMs: nowMs - (last.openTime + iv),
    };
  }
  const ageMs = nowMs - (last.openTime + iv);
  const state = ageState(ageMs, iv);
  if (state === "STALE") {
    return { state, reason: "last closed bar is stale", lastClosedOpen: last.openTime, ageMs };
  }
  if (state === "DELAYED") {
    return { state, reason: "last closed bar is delayed", lastClosedOpen: last.openTime, ageMs };
  }
  return { state: "LIVE", reason: "closed, contiguous, fresh", lastClosedOpen: last.openTime, ageMs };
}

export function combineQuality(
  parts: { tf: Timeframe; state: QualityState; reason: string; lastClosedOpen: number | null; ageMs: number | null }[],
  venue: Venue | null,
  nowMs: number,
  switched: boolean,
): Quality {
  if (!venue) {
    return { state: "UNAVAILABLE", venue: null, reason: "all venues failed", lastClosedOpen: null, ageMs: null, now: nowMs };
  }
  const rank: Record<QualityState, number> = {
    UNAVAILABLE: 7,
    INVALID: 6,
    SOURCE_SWITCH: 5,
    PARTIAL: 4,
    STALE: 3,
    DELAYED: 2,
    LIVE: 1,
  };
  let worst = parts[0];
  if (!worst) {
    return { state: "INVALID", venue, reason: "empty quality", lastClosedOpen: null, ageMs: null, now: nowMs };
  }
  for (const p of parts) {
    if (rank[p.state] > rank[worst.state]) worst = p;
  }
  if (switched && worst.state === "PARTIAL") {
    return {
      state: "SOURCE_SWITCH",
      venue,
      reason: `WAIT_SOURCE_TRANSITION: ${worst.reason}`,
      lastClosedOpen: worst.lastClosedOpen,
      ageMs: worst.ageMs,
      now: nowMs,
    };
  }
  return {
    state: worst.state,
    venue,
    reason: `${worst.tf}: ${worst.reason}`,
    lastClosedOpen: worst.lastClosedOpen,
    ageMs: worst.ageMs,
    now: nowMs,
  };
}

export function releaseAllowed(state: QualityState): boolean {
  return state === "LIVE";
}

export function waitCodeForQuality(state: QualityState): "WAIT_DATA" | "WAIT_SOURCE_TRANSITION" {
  if (state === "SOURCE_SWITCH") return "WAIT_SOURCE_TRANSITION";
  return "WAIT_DATA";
}
