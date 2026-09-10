import type { Candle, Direction, IndicatorSnapshot, Regime } from "../domain/types.ts";
import type { RegimeKind } from "../domain/constants.ts";
import type { Structure } from "../domain/types.ts";

function percentile(values: number[], p: number): number {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!xs.length) return NaN;
  const i = Math.min(xs.length - 1, Math.max(0, Math.floor((p / 100) * (xs.length - 1))));
  return xs[i]!;
}

export function atrSeries(candles: Candle[], atr: number): number[] {
  void atr;
  return candles.map((c) => (c.high - c.low) / c.close);
}

export function classifyRegime(
  last: Candle,
  ind: IndicatorSnapshot,
  candles: Candle[],
  structure: Structure,
): Regime {
  const bbWidthPct = (ind.bbUpper - ind.bbLower) / ind.bbMid;
  const atrPct = ind.atr / last.close;
  const ranges = candles.slice(-40).map((c) => (c.high - c.low) / c.close);
  const p70 = percentile(ranges, 70);
  const p30 = percentile(ranges, 30);
  let volatility: Regime["volatility"] = "normal";
  if (Number.isFinite(p30) && atrPct <= p30) volatility = "compressed";
  if (Number.isFinite(p70) && atrPct >= p70) volatility = "expanded";

  let direction: Direction | "neutral" = "neutral";
  if (last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi) direction = "long";
  else if (last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi) direction = "short";

  let kind: RegimeKind = "RANGE";
  const reasons: string[] = [];
  const expandingBreak = structure.breakout === "close" && volatility === "expanded";
  if (expandingBreak) {
    kind = "EXPANSION";
    reasons.push("closed range break with expanded ATR");
  } else if (ind.adx >= 25 && direction !== "neutral") {
    kind = "TREND";
    reasons.push(`ADX ${ind.adx.toFixed(1)} with directional EMAs`);
  } else if (ind.adx < 18 && (volatility === "compressed" || bbWidthPct < 0.04)) {
    kind = "COMPRESSION";
    reasons.push(`ADX ${ind.adx.toFixed(1)} and compressed range`);
  } else {
    kind = "RANGE";
    reasons.push(`ADX ${ind.adx.toFixed(1)} — no exclusive trend or squeeze`);
  }
  if (structure.pattern === "hh_hl" && kind === "TREND") reasons.push("HH/HL structure");
  if (structure.pattern === "lh_ll" && kind === "TREND") reasons.push("LH/LL structure");
  return { kind, direction, volatility, adx: ind.adx, bbWidthPct, atrPct, reasons };
}

export function regimeFits(kind: RegimeKind, family: "trend" | "breakout" | "mean_reversion"): boolean {
  if (family === "trend") return kind === "TREND" || kind === "EXPANSION";
  if (family === "breakout") return kind === "COMPRESSION" || kind === "EXPANSION" || kind === "RANGE";
  return kind === "RANGE" || kind === "COMPRESSION";
}
