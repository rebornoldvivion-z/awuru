import { INTERVAL_MS, type Timeframe } from "../domain/constants.ts";
import type { Candle, Direction, Geometry, IndicatorSnapshot, InstrumentFilters } from "../domain/types.ts";
import { roundToTick } from "../risk/sizing.ts";

export function buildGeometry(args: {
  direction: Direction;
  last: Candle;
  atr: number;
  filters: InstrumentFilters;
  timeframe: Timeframe;
}): Geometry | { error: string } {
  const { direction, last, atr, filters, timeframe } = args;
  if (!(atr > 0)) return { error: "ATR not available" };
  const tick = filters.tickSize;
  const entry = roundToTick(last.close, tick);
  const swing = swingLevel(args as never);
  const atrStop =
    direction === "long" ? entry - 1.5 * atr : entry + 1.5 * atr;
  let stop =
    direction === "long" ? Math.min(atrStop, swing) : Math.max(atrStop, swing);
  stop = roundToTick(stop, tick);
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return { error: "zero stop distance" };
  const tp1 = roundToTick(direction === "long" ? entry + risk : entry - risk, tick);
  const tp2 = roundToTick(direction === "long" ? entry + 2 * risk : entry - 2 * risk, tick);
  const tp3 = roundToTick(direction === "long" ? entry + 3 * risk : entry - 3 * risk, tick);
  const expiry = last.openTime + 4 * INTERVAL_MS["1h"];
  void timeframe;
  return {
    direction,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    riskPerUnit: risk,
    rr: 1,
    expiry,
  };
}

function swingLevel(args: { direction: Direction; last: Candle; candles?: Candle[] } & { last: Candle }): number {
  return args.last.low && args.direction === "long" ? args.last.low : args.last.high;
}

export function geometryFromBars(args: {
  direction: Direction;
  candles: Candle[];
  last: Candle;
  ind: IndicatorSnapshot;
  filters: InstrumentFilters;
  timeframe: Timeframe;
}): Geometry | { error: string } {
  const { direction, candles, last, ind, filters, timeframe } = args;
  if (!(ind.atr > 0)) return { error: "ATR not available" };
  const tick = filters.tickSize;
  const entry = roundToTick(last.close, tick);
  const look = candles.slice(-5);
  const swingLow = Math.min(...look.map((c) => c.low));
  const swingHigh = Math.max(...look.map((c) => c.high));
  const atrStop = direction === "long" ? entry - 1.5 * ind.atr : entry + 1.5 * ind.atr;
  let stop =
    direction === "long" ? Math.min(atrStop, swingLow) : Math.max(atrStop, swingHigh);
  stop = roundToTick(stop, tick);
  if (direction === "long" && !(stop < entry)) return { error: "long stop not below entry" };
  if (direction === "short" && !(stop > entry)) return { error: "short stop not above entry" };
  const risk = Math.abs(entry - stop);
  if (risk / entry < 0.0005) return { error: "stop too tight" };
  const tp1 = roundToTick(direction === "long" ? entry + risk : entry - risk, tick);
  const tp2 = roundToTick(direction === "long" ? entry + 2 * risk : entry - 2 * risk, tick);
  const tp3 = roundToTick(direction === "long" ? entry + 3 * risk : entry - 3 * risk, tick);
  return {
    direction,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    riskPerUnit: risk,
    rr: 1,
    expiry: last.openTime + INTERVAL_MS[timeframe] * 16,
  };
}
