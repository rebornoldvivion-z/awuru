import type { Timeframe, Venue } from "../domain/constants.ts";
import type { Candle } from "../domain/types.ts";
import { INTERVAL_MS } from "../domain/constants.ts";
import type { MemoryTape, UpsertResult } from "./tape.ts";

export type IncomingKline = {
  venue: Venue;
  symbol: string;
  timeframe: Timeframe;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Binance `k.x`. Forming bars are not engine-valid. */
  closed: boolean;
  /** OKX confirm flag. Required "1" for OKX. */
  confirm?: "0" | "1";
};

export function incomingToCandle(k: IncomingKline): Candle | null {
  if (!k.closed) return null;
  if (k.venue === "okx" && k.confirm !== "1") return null;
  const iv = INTERVAL_MS[k.timeframe];
  return {
    openTime: k.openTime,
    closeTime: k.openTime + iv - 1,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    confirm: k.venue === "okx" ? k.confirm : "1",
  };
}

export function ingestKline(tape: MemoryTape, k: IncomingKline, now: number): UpsertResult | "ignored" {
  const candle = incomingToCandle(k);
  if (!candle) return "ignored";
  return tape.upsert({ venue: k.venue, symbol: k.symbol, timeframe: k.timeframe, candle }, now);
}
