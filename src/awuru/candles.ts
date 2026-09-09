import type { Venue } from "./constants.ts";
import type { Candle } from "./types.ts";
import { isAligned, isTimeClosed } from "./time.ts";

export function ohlcValid(c: Candle): boolean {
  if (!(c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0)) return false;
  if (c.high < Math.max(c.open, c.close)) return false;
  if (c.low > Math.min(c.open, c.close)) return false;
  if (c.high < c.low) return false;
  return true;
}

export function isEngineValidCandle(
  c: Candle,
  intervalMsValue: number,
  nowMs: number,
  venue: Venue,
): boolean {
  if (!isAligned(c.openTime, intervalMsValue)) return false;
  if (!isTimeClosed(c.openTime, intervalMsValue, nowMs)) return false;
  if (!ohlcValid(c)) return false;
  if (venue === "okx" && c.confirm !== "1") return false;
  return true;
}

export function sortAscending(candles: Candle[]): Candle[] {
  return [...candles].sort((a, b) => a.openTime - b.openTime);
}

export function dedupeByOpen(candles: Candle[]): Candle[] {
  const seen = new Set<number>();
  const out: Candle[] = [];
  for (const c of candles) {
    if (seen.has(c.openTime)) continue;
    seen.add(c.openTime);
    out.push(c);
  }
  return out;
}

export function findGaps(candles: Candle[], intervalMsValue: number): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const cur = candles[i];
    if (!prev || !cur) continue;
    const expected = prev.openTime + intervalMsValue;
    if (cur.openTime !== expected) gaps.push(expected);
  }
  return gaps;
}

export function splitLive(
  raw: Candle[],
  intervalMsValue: number,
  nowMs: number,
  venue: Venue,
): { closed: Candle[]; live: Candle | null } {
  const sorted = dedupeByOpen(sortAscending(raw));
  const closed: Candle[] = [];
  let live: Candle | null = null;
  for (const c of sorted) {
    if (isEngineValidCandle(c, intervalMsValue, nowMs, venue)) {
      closed.push(c);
    } else if (ohlcValid(c) && isAligned(c.openTime, intervalMsValue)) {
      live = c;
    }
  }
  if (venue === "kraken" && sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (last && !isTimeClosed(last.openTime, intervalMsValue, nowMs)) {
      live = last;
    }
  }
  return { closed, live };
}

export function lastClosed(closed: Candle[]): Candle | null {
  return closed.length ? (closed[closed.length - 1] ?? null) : null;
}

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}
