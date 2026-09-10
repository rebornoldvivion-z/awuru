import type { StructureRead } from "../domain/constants.ts";
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

export function interpretPattern(pattern: Structure["pattern"]): StructureRead {
  if (pattern === "hh_hl") return "BULLISH_STRUCTURE";
  if (pattern === "lh_ll") return "BEARISH_STRUCTURE";
  if (pattern === "hh_ll") return "EXPANDING_RANGE";
  if (pattern === "lh_hl") return "RANGE_TRANSITION";
  return "UNKNOWN";
}

export function patternLabel(pattern: Structure["pattern"]): string {
  if (pattern === "hh_hl") return "HH/HL";
  if (pattern === "lh_ll") return "LH/LL";
  if (pattern === "hh_ll") return "HH+LL";
  if (pattern === "lh_hl") return "LH+HL";
  return "undefined";
}

export function readLabel(read: StructureRead): string {
  if (read === "BULLISH_STRUCTURE") return "BULLISH — HH/HL";
  if (read === "BEARISH_STRUCTURE") return "BEARISH — LH/LL";
  if (read === "EXPANDING_RANGE") return "EXPANDING RANGE — HH+LL";
  if (read === "RANGE_TRANSITION") return "RANGE/TRANSITION — LH+HL";
  return "UNKNOWN";
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
  const read = interpretPattern(pattern);
  const reasons: string[] = [`structure ${patternLabel(pattern)} → ${read}`];
  if (breakout !== "none") reasons.push(`${breakout} ${breakoutDir} of prior range`);
  return {
    lastSwingHigh,
    lastSwingLow,
    priorSwingHigh,
    priorSwingLow,
    pattern,
    read,
    rangeHigh,
    rangeLow,
    breakout,
    breakoutDir,
    reclaim,
    reasons,
  };
}

export function invalidatorPrice(structure: Structure, direction: Direction): number | null {
  if (direction === "long") return structure.lastSwingLow?.price ?? structure.rangeLow;
  return structure.lastSwingHigh?.price ?? structure.rangeHigh;
}

export function structureInvalidation(structure: Structure, direction: Direction): string {
  const lvl = invalidatorPrice(structure, direction);
  const label = `${patternLabel(structure.pattern)} · ${readLabel(structure.read)}`;
  if (direction === "long") {
    return lvl
      ? `15m close back under ${lvl} (${label})`
      : "15m close back under last swing low";
  }
  return lvl
    ? `15m close back over ${lvl} (${label})`
    : "15m close back over last swing high";
}

export function continuationLocation(
  candles: Candle[],
  last: Candle,
  emaFast: number,
  atr: number,
  direction: Direction,
): { pulled: boolean; reclaimed: boolean; note: string } {
  const look = candles.slice(-8);
  const band = Math.max(atr * 0.35, last.close * 0.0004);
  if (direction === "long") {
    const pulled = look.some((c) => c.low <= emaFast + band);
    const reclaimed = pulled && last.close > emaFast && last.close >= last.open;
    const note = !pulled
      ? "no pullback into EMA21 / mean yet"
      : reclaimed
        ? "pullback into EMA21 then closed back above"
        : "pullback into EMA21, reclaim not closed";
    return { pulled, reclaimed, note };
  }
  const pulled = look.some((c) => c.high >= emaFast - band);
  const reclaimed = pulled && last.close < emaFast && last.close <= last.open;
  const note = !pulled
    ? "no pullback into EMA21 / mean yet"
    : reclaimed
      ? "pullback into EMA21 then closed back below"
      : "pullback into EMA21, rejection not closed";
  return { pulled, reclaimed, note };
}
