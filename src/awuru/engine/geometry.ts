import { INTERVAL_MS, MIN_RELEASE_RR, type Timeframe } from "../domain/constants.ts";
import type { Candle, Direction, Geometry, IndicatorSnapshot, InstrumentFilters, Structure } from "../domain/types.ts";
import { roundToTick } from "../risk/sizing.ts";

export function planGeometry(args: {
  direction: Direction;
  last: Candle;
  ind: IndicatorSnapshot;
  filters: InstrumentFilters;
  timeframe: Timeframe;
  structure: Structure;
  invalidatorPrice: number;
}): Geometry | { error: string } {
  const { direction, last, ind, filters, structure, invalidatorPrice } = args;
  if (!(ind.atr > 0)) return { error: "ATR not available" };
  const tick = filters.tickSize;
  const entry = roundToTick(last.close, tick);
  const stop =
    direction === "long"
      ? roundToTick(invalidatorPrice - tick, tick)
      : roundToTick(invalidatorPrice + tick, tick);
  if (direction === "long" && !(stop < entry)) return { error: "stop cannot represent invalidator below entry" };
  if (direction === "short" && !(stop > entry)) return { error: "stop cannot represent invalidator above entry" };
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return { error: "zero stop distance" };
  if (risk / entry < 0.0004) return { error: "stop too tight versus entry" };

  const structural = uniqueSorted(
    direction === "long"
      ? [structure.lastSwingHigh?.price, structure.priorSwingHigh?.price, structure.rangeHigh]
      : [structure.lastSwingLow?.price, structure.priorSwingLow?.price, structure.rangeLow],
    direction,
  ).filter((p) => (direction === "long" ? p > entry + risk * MIN_RELEASE_RR : p < entry - risk * MIN_RELEASE_RR));

  if (!structural.length) {
    return { error: `no structural target at least ${MIN_RELEASE_RR}R beyond entry` };
  }
  const tp1 = roundToTick(structural[0]!, tick);
  const tp2 = roundToTick(structural[1] ?? (direction === "long" ? tp1 + risk : tp1 - risk), tick);
  const tp3 = roundToTick(structural[2] ?? (direction === "long" ? tp1 + 2 * risk : tp1 - 2 * risk), tick);
  const reward = Math.abs(tp1 - entry);
  const rr = Number((reward / risk).toFixed(3));
  if (rr < MIN_RELEASE_RR) return { error: `RR ${rr} below ${MIN_RELEASE_RR} versus structural target` };
  return {
    direction,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    riskPerUnit: risk,
    rr,
    expiry: last.openTime + 4 * INTERVAL_MS["1h"],
    invalidatorPrice,
    stopSource: `invalidator ${invalidatorPrice} ± 1 tick`,
    tp1Source: "nearest structural target beyond entry",
  };
}

function uniqueSorted(values: Array<number | null | undefined>, direction: Direction): number[] {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const uniq = [...new Set(nums)];
  uniq.sort((a, b) => (direction === "long" ? a - b : b - a));
  return uniq;
}

export function geometryFromBars(args: {
  direction: Direction;
  candles: Candle[];
  last: Candle;
  ind: IndicatorSnapshot;
  filters: InstrumentFilters;
  timeframe: Timeframe;
  structure: Structure;
  invalidatorPrice: number;
}): Geometry | { error: string } {
  void args.candles;
  return planGeometry(args);
}
