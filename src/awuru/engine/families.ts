import type { EvidenceGrade, Family, HtfStance, LifecycleState, StructureRead } from "../domain/constants.ts";
import type { Candle, Direction, FamilyEvidence, IndicatorSnapshot, Regime, Structure } from "../domain/types.ts";
import { priorDonchian } from "./indicators.ts";
import { regimeFits } from "./regime.ts";
import {
  invalidatorPrice,
  patternLabel,
  readLabel,
  structureInvalidation,
} from "./structure.ts";
import { measureRetrace } from "./retrace.ts";
import { continuationZone } from "./zones.ts";
import { isActionableFamily } from "./honesty.ts";

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
  invalidatorPrice: number | null;
  structureRead: StructureRead | null;
  setupKey: string | null;
  zone: { origin: string; low: number; high: number; type: string } | null;
  retraceNote: string | null;
  triggerType: import("../domain/constants.ts").TriggerType | null;
  qualityGrade: import("../domain/constants.ts").QualityGrade | null;
};

function join(parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}

export function evaluateTrend(
  candles: Candle[],
  last: Candle,
  ind: IndicatorSnapshot,
  h1: Direction | "neutral",
  h4: Direction | "neutral",
  structure: Structure,
  regime: Regime,
): FamilyEval {
  const reasons: string[] = [];
  const blockers: string[] = [];
  const read = structure.read;
  const emaLong = last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi;
  const emaShort = last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi;
  reasons.push(`${readLabel(read)} (${patternLabel(structure.pattern)})`);
  if (emaLong) reasons.push(`EMA stack long (close > EMA21 > EMA50)`);
  if (emaShort) reasons.push(`EMA stack short (close < EMA21 < EMA50)`);
  reasons.push(`ADX ${ind.adx.toFixed(1)}`);

  let thesisDir: Direction | null = null;
  if (read === "BULLISH_STRUCTURE") thesisDir = "long";
  else if (read === "BEARISH_STRUCTURE") thesisDir = "short";
  else if (emaLong) thesisDir = "long";
  else if (emaShort) thesisDir = "short";

  if (read === "EXPANDING_RANGE") {
    blockers.push("HH and LL together — expanding range, not a directional trend");
  } else if (read === "RANGE_TRANSITION") {
    blockers.push("LH+HL overlapping swings — range/transition, not continuation");
  } else if (read === "UNKNOWN") {
    blockers.push("insufficient confirmed swings for directional structure");
  }

  if (read === "BULLISH_STRUCTURE" && !emaLong) blockers.push("EMA stack does not agree with bullish structure");
  if (read === "BEARISH_STRUCTURE" && !emaShort) blockers.push("EMA stack does not agree with bearish structure");
  if (ind.adx < 20) blockers.push(`ADX ${ind.adx.toFixed(1)} below trend threshold 20`);
  if (!regimeFits(regime.kind, "trend")) blockers.push(`regime ${regime.kind} is not trend/expansion context`);

  const structuralOk = read === "BULLISH_STRUCTURE" || read === "BEARISH_STRUCTURE";
  const zone = thesisDir && structuralOk ? continuationZone(structure, thesisDir, "15m") : null;
  const retrace =
    thesisDir && structuralOk
      ? measureRetrace({ candles, last, ind, structure, direction: thesisDir, zone })
      : null;
  if (retrace) reasons.push(retrace.note);
  if (retrace && retrace.phase !== "TRIGGERED") blockers.push(retrace.note);

  const emaAgrees = (thesisDir === "long" && emaLong) || (thesisDir === "short" && emaShort);
  const momentumOk = ind.adx >= 20;
  const triggered = Boolean(
    thesisDir &&
      structuralOk &&
      emaAgrees &&
      momentumOk &&
      retrace?.phase === "TRIGGERED" &&
      regimeFits(regime.kind, "trend"),
  );

  let score = 0;
  if (emaLong || emaShort) score += 0.1;
  if (structuralOk) score += 0.25;
  if (momentumOk) score += 0.1;
  if (retrace?.inZone) score += 0.15;
  if (retrace?.reacted) score += 0.15;
  if (retrace?.phase === "TRIGGERED") score += 0.2;
  if (h1 === thesisDir) score += 0.05;
  if (h4 === thesisDir) score += 0.05;
  if (read === "EXPANDING_RANGE" || read === "RANGE_TRANSITION") score = Math.min(score, 0.35);

  let state: LifecycleState = "FORMING";
  if (structuralOk && emaAgrees) state = "WATCH";
  if (read === "EXPANDING_RANGE" && (emaLong || emaShort)) state = "WATCH";
  if (retrace?.inZone || retrace?.reacted) state = "WATCH";
  if (triggered) state = "TRIGGERED";

  const invPrice = thesisDir ? invalidatorPrice(structure, thesisDir) : zone?.low && thesisDir === "long" ? zone.low : zone?.high ?? null;
  const trigger = retrace?.triggerEvidence
    || (retrace ? retrace.note : read === "EXPANDING_RANGE"
      ? "waiting for LH/LL or HH/HL — expanding range is not a trend trigger"
      : "waiting for directional swing structure");

  const whyNow = triggered ? join([readLabel(read), retrace?.triggerEvidence ?? "", `ADX ${ind.adx.toFixed(1)}`]) : "";
  const whyNot = triggered ? "" : join(blockers.length ? blockers : ["trend thesis incomplete"]);

  const eligible = Boolean(thesisDir && structuralOk && score >= 0.45);
  return {
    family: "trend",
    eligible,
    direction: thesisDir,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: thesisDir ? (zone?.invalidIf ?? structureInvalidation(structure, thesisDir)) : null,
    whyNow: whyNow || reasons[0] || "",
    whyNot,
    state,
    trigger,
    blockers,
    invalidatorPrice: invPrice,
    structureRead: read,
    setupKey: zone ? `${zone.createdAt}` : null,
    zone: zone ? { origin: zone.origin, low: zone.low, high: zone.high, type: zone.type } : null,
    retraceNote: retrace?.note ?? null,
    triggerType: retrace?.triggerType ?? "none",
    qualityGrade: retrace?.quality ?? "weak",
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
  let trigger = "waiting for a closed 15m break of the prior 20-bar range";
  if (prior) {
    if (last.close > prior.high) {
      direction = "long";
      state = "TRIGGERED";
      reasons.push(`15m close ${last.close} broke prior Donchian high ${prior.high}`);
      trigger = `closed 15m hold above ${prior.high}`;
    } else if (last.close < prior.low) {
      direction = "short";
      state = "TRIGGERED";
      reasons.push(`15m close ${last.close} broke prior Donchian low ${prior.low}`);
      trigger = `closed 15m hold below ${prior.low}`;
    } else if (last.high > prior.high) {
      direction = "long";
      state = "FORMING";
      reasons.push(`wick through ${prior.high} — close still inside`);
      blockers.push("wick is not a closed breakout");
      trigger = `waiting for 15m close above ${prior.high}`;
    } else if (last.low < prior.low) {
      direction = "short";
      state = "FORMING";
      reasons.push(`wick through ${prior.low} — close still inside`);
      blockers.push("wick is not a closed breakout");
      trigger = `waiting for 15m close below ${prior.low}`;
    } else {
      reasons.push("no Donchian break of the prior 20-bar range");
    }
  }
  if (structure.breakout === "wick") {
    state = "FORMING";
    blockers.push("wick-only probe of range");
  }
  if (regime.kind === "COMPRESSION") reasons.push("break from compression");
  let score = 0;
  if (direction) {
    score = state === "TRIGGERED" ? 0.5 : 0.25;
    if (regime.volatility === "expanded") score += 0.1;
    if (h1 === direction) score += 0.1;
    if (h4 === direction) score += 0.1;
    if (structure.reclaim) score += 0.1;
  }
  const eligible = Boolean(direction && score >= 0.25 && state === "TRIGGERED");
  const inv =
    direction === "long"
      ? prior
        ? `close back inside prior range below ${prior.high}`
        : "close back inside prior range"
      : direction === "short"
        ? prior
          ? `close back inside prior range above ${prior.low}`
          : "close back inside prior range"
        : null;
  return {
    family: "breakout",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: inv,
    whyNow: state === "TRIGGERED" ? reasons[0] ?? "" : "",
    whyNot: state === "TRIGGERED" ? "" : join(blockers.length ? blockers : reasons),
    state,
    trigger,
    blockers,
    invalidatorPrice: direction === "long" ? (prior?.high ?? null) : direction === "short" ? (prior?.low ?? null) : null,
    structureRead: structure.read,
    setupKey: prior ? String(prior.high) : null,
    zone: prior ? { origin: "donchian", low: prior.low, high: prior.high, type: "DONCHIAN" } : null,
    retraceNote: null,
    triggerType: state === "TRIGGERED" ? "closed_breakout" : "none",
    qualityGrade: state === "TRIGGERED" ? "good" : "weak",
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
  void h1;
  const eligible = Boolean(direction && ranging && score >= 0.45);
  return {
    family: "mean_reversion",
    eligible,
    direction,
    grade: gradeFrom(score),
    score,
    reasons,
    invalidation: "close back through mid-band against the fade",
    whyNow: state === "TRIGGERED" ? reasons[0] ?? "" : "",
    whyNot: state === "TRIGGERED" ? "" : join(blockers.length ? blockers : reasons),
    state,
    trigger: "closed stretch holds and next bar starts back toward mid",
    blockers,
    invalidatorPrice: ind.bbMid,
    structureRead: structure.read,
    setupKey: null,
    zone: { origin: "bollinger", low: ind.bbLower, high: ind.bbUpper, type: "RANGE_HIGH" },
    retraceNote: null,
    triggerType: state === "TRIGGERED" ? "reclaim_close" : "none",
    qualityGrade: eligible ? "mixed" : "weak",
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
    evaluateTrend(candles, last, ind, h1, h4, structure, regime),
    evaluateBreakout(candles, last, ind, h1, h4, structure, regime),
    evaluateMeanReversion(last, ind, h1, h4, structure, regime),
  ];
}

export function pickPrimary(families: FamilyEvidence[]): FamilyEvidence | null {
  const eligible = families.filter((f) => f.eligible && f.direction && isActionableFamily(f.family));
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
  return "Trend continuation";
}
