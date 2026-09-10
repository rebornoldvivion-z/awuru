import type { Candle, Direction, Structure, SwingPoint } from "../domain/types.ts";

const LEFT = 2;
const RIGHT = 2;

export function swingPoints(candles: Candle[]): SwingPoint[] {
  const out: SwingPoint[] = [];
  const last = candles.length - 1 - RIGHT;
  for (let i = LEFT; i <= last; i++) {
    const c = candles[i]!;
    let isHigh = true;
    let isLow = true;
    for (let j = i - LEFT; j <= i + RIGHT; j++) {
      if (j === i) continue;
      const o = candles[j]!;
      if (o.high >= c.high) isHigh = false;
      if (o.low <= c.low) isLow = false;
    }
    if (isHigh) out.push({ openTime: c.openTime, price: c.high, kind: "high" });
    else if (isLow) out.push({ openTime: c.openTime, price: c.low, kind: "low" });
  }
  return out;
}

export function readStructure(candles: Candle[], priorRange?: { high: number; low: number } | null): Structure {
  const swings = swingPoints(candles);
  const highs = swings.filter((s) => s.kind === "high");
  const lows = swings.filter((s) => s.kind === "low");
  const lastSwingHigh = highs.at(-1) ?? null;
  const priorSwingHigh = highs.at(-2) ?? null;
  const lastSwingLow = lows.at(-1) ?? null;
  const priorSwingLow = lows.at(-2) ?? null;
  let pattern: Structure["pattern"] = "undefined";
  if (lastSwingHigh && priorSwingHigh && lastSwingLow && priorSwingLow) {
    const hh = lastSwingHigh.price > priorSwingHigh.price;
    const hl = lastSwingLow.price > priorSwingLow.price;
    const lh = lastSwingHigh.price < priorSwingHigh.price;
    const ll = lastSwingLow.price < priorSwingLow.price;
    if (hh && hl) pattern = "hh_hl";
    else if (lh && ll) pattern = "lh_ll";
    else if (hh && ll) pattern = "hh_ll";
    else if (lh && hl) pattern = "lh_hl";
  }
  const window = candles.slice(-20);
  const rangeHigh = window.length ? Math.max(...window.map((c) => c.high)) : null;
  const rangeLow = window.length ? Math.min(...window.map((c) => c.low)) : null;
  const last = candles[candles.length - 1] ?? null;
  let breakout: Structure["breakout"] = "none";
  let breakoutDir: Direction | null = null;
  if (last && priorRange) {
    if (last.close > priorRange.high) {
      breakout = "close";
      breakoutDir = "long";
    } else if (last.close < priorRange.low) {
      breakout = "close";
      breakoutDir = "short";
    } else if (last.high > priorRange.high) {
      breakout = "wick";
      breakoutDir = "long";
    } else if (last.low < priorRange.low) {
      breakout = "wick";
      breakoutDir = "short";
    }
  }
  const reclaim =
    Boolean(last && priorRange && last.open < priorRange.high && last.close > priorRange.high) ||
    Boolean(last && priorRange && last.open > priorRange.low && last.close < priorRange.low);
  const reasons: string[] = [`structure ${pattern}`];
  if (breakout !== "none") reasons.push(`${breakout} ${breakoutDir} of prior range`);
  return {
    lastSwingHigh,
    lastSwingLow,
    priorSwingHigh,
    priorSwingLow,
    pattern,
    rangeHigh,
    rangeLow,
    breakout,
    breakoutDir,
    reclaim,
    reasons,
  };
}

export function structureInvalidation(structure: Structure, direction: Direction): string {
  if (direction === "long") {
    const lvl = structure.lastSwingLow?.price;
    return lvl ? `close back under swing low ${lvl}` : "close back under last higher low";
  }
  const lvl = structure.lastSwingHigh?.price;
  return lvl ? `close back over swing high ${lvl}` : "close back over last lower high";
}
