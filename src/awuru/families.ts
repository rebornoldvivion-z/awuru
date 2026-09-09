import type { EvidenceGrade, Family } from "./constants.ts";
import type { Candle, Direction, FamilyEvidence, IndicatorSnapshot } from "./types.ts";
import { priorDonchian } from "./indicators.ts";

function gradeFrom(score: number): EvidenceGrade {
  if (score >= 0.75) return "strong";
  if (score >= 0.5) return "mixed";
  return "weak";
}

export function htfBiasFrom(ind: IndicatorSnapshot | null, last: Candle | null): Direction | "neutral" {
  if (!ind || !last) return "neutral";
  if (ind.adx < 16) return "neutral";
  const emaLong = last.close > ind.emaFast && ind.emaFast > ind.emaSlow;
  const emaShort = last.close < ind.emaFast && ind.emaFast < ind.emaSlow;
  if (emaLong && ind.plusDi >= ind.minusDi) return "long";
  if (emaShort && ind.minusDi >= ind.plusDi) return "short";
  return "neutral";
}

export function evaluateTrend(
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
): FamilyEvidence {
  const trending = ind.adx >= 20;
  let direction: Direction | null = null;
  const reasons: string[] = [];
  if (last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi) {
    direction = "long";
    reasons.push("close > EMA21 > EMA50 and +DI > −DI");
  } else if (last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi) {
    direction = "short";
    reasons.push("close < EMA21 < EMA50 and −DI > +DI");
  }
  if (!trending) reasons.push(`ADX ${ind.adx.toFixed(1)} < 20 — not a trend regime`);
  let score = 0;
  if (direction && trending) {
    score = 0.45;
    if (ind.adx >= 25) score += 0.2;
    if (h1 === direction) score += 0.15;
    if (h4 === direction) score += 0.2;
    reasons.push(`ADX ${ind.adx.toFixed(1)}`);
  }
  const eligible = Boolean(direction && trending && score >= 0.45);
  return {
    family: "trend",
    eligible,
    direction: eligible ? direction : direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: direction === "long" ? "close back under EMA21" : direction === "short" ? "close back over EMA21" : null,
  };
}

export function evaluateBreakout(
  candles: Candle[],
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
): FamilyEvidence {
  const prior = priorDonchian(candles);
  const reasons: string[] = [];
  let direction: Direction | null = null;
  if (prior && last.close > prior.high) {
    direction = "long";
    reasons.push(`close ${last.close} broke prior Donchian high ${prior.high}`);
  } else if (prior && last.close < prior.low) {
    direction = "short";
    reasons.push(`close ${last.close} broke prior Donchian low ${prior.low}`);
  } else {
    reasons.push("no Donchian break of the prior 20-bar range");
  }
  const expansion = ind.atr > 0 && ind.bbUpper - ind.bbLower > 0;
  let score = 0;
  if (direction) {
    score = 0.4;
    if (expansion) score += 0.1;
    if (ind.adx >= 18) score += 0.15;
    if (h1 === direction) score += 0.15;
    if (h4 === direction) score += 0.2;
  }
  const eligible = Boolean(direction && score >= 0.4);
  return {
    family: "breakout",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: direction === "long" ? "close back inside prior range" : direction === "short" ? "close back inside prior range" : null,
  };
}

export function evaluateMeanReversion(
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
): FamilyEvidence {
  const ranging = ind.adx < 20;
  const reasons: string[] = [];
  let direction: Direction | null = null;
  if (last.close < ind.bbLower && ind.rsi < 35) {
    direction = "long";
    reasons.push(`close below lower band, RSI ${ind.rsi.toFixed(1)}`);
  } else if (last.close > ind.bbUpper && ind.rsi > 65) {
    direction = "short";
    reasons.push(`close above upper band, RSI ${ind.rsi.toFixed(1)}`);
  } else {
    reasons.push("no statistically stretched close");
  }
  if (!ranging) reasons.push(`ADX ${ind.adx.toFixed(1)} — trend too strong for mean reversion`);
  let score = 0;
  if (direction && ranging) {
    score = 0.45;
    if (ind.rsi < 30 || ind.rsi > 70) score += 0.15;
    if (h1 === "neutral" || h1 === direction) score += 0.15;
    if (h4 !== (direction === "long" ? "short" : "long")) score += 0.15;
  }
  const eligible = Boolean(direction && ranging && score >= 0.45);
  return {
    family: "mean_reversion",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: "close back through mid-band against the fade",
  };
}

export function evaluateFamilies(
  candles: Candle[],
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
): FamilyEvidence[] {
  return [
    evaluateTrend(last, ind, h1, h4),
    evaluateBreakout(candles, last, ind, h1, h4),
    evaluateMeanReversion(last, ind, h1, h4),
  ];
}

export function pickPrimary(families: FamilyEvidence[]): FamilyEvidence | null {
  const eligible = families.filter((f) => f.eligible && f.direction);
  if (eligible.length === 0) return null;
  const dirs = new Set(eligible.map((f) => f.direction));
  if (dirs.size > 1) return null;
  return eligible.slice().sort((a, b) => b.score - a.score)[0] ?? null;
}

export function disagreement(families: FamilyEvidence[]): boolean {
  const eligible = families.filter((f) => f.eligible && f.direction);
  const dirs = new Set(eligible.map((f) => f.direction));
  return dirs.size > 1;
}

export function familyLabel(f: Family): string {
  if (f === "mean_reversion") return "Mean reversion";
  if (f === "breakout") return "Breakout";
  return "Trend";
}
