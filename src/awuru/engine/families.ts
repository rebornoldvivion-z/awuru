import type { EvidenceGrade, Family, HtfStance, LifecycleState } from "../domain/constants.ts";
import type { Candle, Direction, FamilyEvidence, IndicatorSnapshot, Regime, Structure } from "../domain/types.ts";
import { priorDonchian } from "./indicators.ts";
import { regimeFits } from "./regime.ts";
import { structureInvalidation } from "./structure.ts";

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

export function htfStance(bias: Direction | "neutral", direction: Direction): HtfStance {
  if (bias === "neutral") return "NEUTRAL";
  if (bias === direction) return "SUPPORTIVE";
  return "OPPOSING";
}

export type FamilyEval = FamilyEvidence & {
  state: LifecycleState;
  trigger: string;
  blockers: string[];
};

export function evaluateTrend(
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
  structure: Structure,
  regime: Regime,
): FamilyEval {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let direction: Direction | null = null;
  if (structure.pattern === "hh_hl" || (last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi)) {
    direction = "long";
  } else if (structure.pattern === "lh_ll" || (last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi)) {
    direction = "short";
  }
  if (structure.pattern === "hh_hl") reasons.push("HH/HL structure");
  if (structure.pattern === "lh_ll") reasons.push("LH/LL structure");
  if (direction === "long") reasons.push("close > EMA21 > EMA50");
  if (direction === "short") reasons.push("close < EMA21 < EMA50");
  const trending = ind.adx >= 20;
  if (!trending) {
    reasons.push(`ADX ${ind.adx.toFixed(1)} < 20`);
    blockers.push("trend strength not confirmed");
  }
  if (!regimeFits(regime.kind, "trend")) blockers.push(`regime ${regime.kind} is not a trend continuation`);
  let score = 0;
  if (direction && trending) {
    score = 0.4;
    if (structure.pattern === "hh_hl" || structure.pattern === "lh_ll") score += 0.15;
    if (ind.adx >= 25) score += 0.15;
    if (h1 === direction) score += 0.1;
    if (h4 === direction) score += 0.15;
  }
  let state: LifecycleState = "FORMING";
  if (direction && trending && regimeFits(regime.kind, "trend")) {
    const pulled =
      direction === "long" ? last.close < ind.emaFast && last.low <= ind.emaFast : last.close > ind.emaFast && last.high >= ind.emaFast;
    state = pulled ? "WATCH" : "TRIGGERED";
    if (pulled) {
      blockers.push("waiting for EMA reclaim after pullback");
      reasons.push("pullback into EMA — continuation not confirmed");
    }
  }
  const eligible = Boolean(direction && score >= 0.4);
  return {
    family: "trend",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: direction ? structureInvalidation(structure, direction) : null,
    state,
    trigger: direction === "long" ? "close reclaimed above EMA21 with HH/HL intact" : "close rejected below EMA21 with LH/LL intact",
    blockers,
  };
}

export function evaluateBreakout(
  candles: Candle[],
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
  structure: Structure,
  regime: Regime,
): FamilyEval {
  const prior = priorDonchian(candles);
  const reasons: string[] = [];
  const blockers: string[] = [];
  let direction: Direction | null = null;
  let state: LifecycleState = "FORMING";
  if (prior) {
    if (last.close > prior.high) {
      direction = "long";
      state = "TRIGGERED";
      reasons.push(`close ${last.close} broke prior Donchian high ${prior.high}`);
    } else if (last.close < prior.low) {
      direction = "short";
      state = "TRIGGERED";
      reasons.push(`close ${last.close} broke prior Donchian low ${prior.low}`);
    } else if (last.high > prior.high) {
      direction = "long";
      state = "FORMING";
      reasons.push("wick through range high — close still inside");
      blockers.push("needs closing breakout, not a wick");
    } else if (last.low < prior.low) {
      direction = "short";
      state = "FORMING";
      reasons.push("wick through range low — close still inside");
      blockers.push("needs closing breakout, not a wick");
    } else {
      reasons.push("no Donchian break of the prior 20-bar range");
    }
  }
  if (structure.breakout === "wick") {
    state = "FORMING";
    blockers.push("wick-only probe");
  }
  if (regime.kind === "TREND" && state === "TRIGGERED") reasons.push("break in an already trending tape");
  if (regime.kind === "COMPRESSION") reasons.push("break from compression");
  let score = 0;
  if (direction) {
    score = state === "TRIGGERED" ? 0.45 : 0.25;
    if (regime.volatility === "expanded") score += 0.1;
    if (ind.adx >= 18) score += 0.1;
    if (h1 === direction) score += 0.1;
    if (h4 === direction) score += 0.15;
    if (structure.reclaim) score += 0.1;
  }
  const eligible = Boolean(direction && score >= 0.25);
  return {
    family: "breakout",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: direction === "long" ? "close back inside prior range" : direction === "short" ? "close back inside prior range" : null,
    state,
    trigger: "next closed 15m holds beyond the range",
    blockers,
  };
}

export function evaluateMeanReversion(
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
  structure: Structure,
  regime: Regime,
): FamilyEval {
  const reasons: string[] = [];
  const blockers: string[] = [];
  let direction: Direction | null = null;
  const ranging = regimeFits(regime.kind, "mean_reversion") && ind.adx < 22;
  if (last.close < ind.bbLower && ind.rsi < 35) {
    direction = "long";
    reasons.push(`close below lower band, RSI ${ind.rsi.toFixed(1)}`);
  } else if (last.close > ind.bbUpper && ind.rsi > 65) {
    direction = "short";
    reasons.push(`close above upper band, RSI ${ind.rsi.toFixed(1)}`);
  } else {
    reasons.push("no statistically stretched close");
  }
  if (!ranging) {
    reasons.push(`regime ${regime.kind} / ADX ${ind.adx.toFixed(1)} — fade not appropriate`);
    blockers.push("mean reversion blocked by trend/expansion regime");
  }
  let score = 0;
  let state: LifecycleState = "FORMING";
  if (direction && ranging) {
    score = 0.45;
    if (ind.rsi < 30 || ind.rsi > 70) score += 0.15;
    if (h1 === "neutral" || h1 === direction) score += 0.1;
    if (h4 !== (direction === "long" ? "short" : "long")) score += 0.1;
    state = "TRIGGERED";
  } else if (direction && !ranging) {
    state = "WATCH";
    blockers.push("waiting for range/compression before fading");
  }
  void structure;
  const eligible = Boolean(direction && ranging && score >= 0.45);
  return {
    family: "mean_reversion",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: "close back through mid-band against the fade",
    state,
    trigger: "closed stretch holds and next bar starts back toward mid",
    blockers,
  };
}

export function evaluateFamilies(
  candles: Candle[],
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
  structure: Structure,
  regime: Regime,
): FamilyEval[] {
  return [
    evaluateTrend(last, ind, h1, h4, structure, regime),
    evaluateBreakout(candles, last, ind, h1, h4, structure, regime),
    evaluateMeanReversion(last, ind, h1, h4, structure, regime),
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
