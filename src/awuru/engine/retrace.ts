import type { RetracePhase, TriggerType } from "../domain/constants.ts";
import type { Candle, Direction, IndicatorSnapshot, Structure } from "../domain/types.ts";
import type { Zone } from "./zones.ts";

export type Retrace = {
  phase: RetracePhase;
  impulse: number;
  depthPct: number | null;
  atrDepth: number | null;
  inZone: boolean;
  reacted: boolean;
  triggerType: TriggerType;
  triggerPrice: number | null;
  triggerTime: number | null;
  triggerEvidence: string;
  quality: "weak" | "mixed" | "good" | "strong";
  note: string;
};

export function measureRetrace(args: {
  candles: Candle[];
  last: Candle;
  ind: IndicatorSnapshot;
  structure: Structure;
  direction: Direction;
  zone: Zone | null;
}): Retrace {
  const { last, ind, structure, direction, zone } = args;
  const empty: Retrace = {
    phase: "NONE",
    impulse: 0,
    depthPct: null,
    atrDepth: null,
    inZone: false,
    reacted: false,
    triggerType: "none",
    triggerPrice: null,
    triggerTime: null,
    triggerEvidence: "",
    quality: "weak",
    note: "no impulse to measure",
  };
  const hh = structure.lastSwingHigh?.price;
  const hl = structure.lastSwingLow?.price;
  const ph = structure.priorSwingHigh?.price;
  const pl = structure.priorSwingLow?.price;
  if (direction === "long") {
    if (!(hh && hl)) return { ...empty, note: "missing HL/HH for bullish impulse" };
    const impulse = hh - (pl ?? hl);
    if (!(impulse > 0)) return { ...empty, note: "no bullish impulse" };
    const retrace = hh - last.low;
    const depthPct = retrace / impulse;
    const atrDepth = ind.atr > 0 ? retrace / ind.atr : null;
    const inZone = Boolean(zone && last.low <= zone.high && last.low >= zone.low * 0.999);
    const touched = Boolean(zone && args.candles.slice(-8).some((c) => c.low <= zone.high && c.low >= zone.low));
    const reacted = Boolean(zone && touched && last.close > zone.mid && last.close >= last.open);
    const triggered = Boolean(zone && reacted && last.close > zone.high && last.close > ind.emaFast);
    const phase: RetracePhase = triggered
      ? "TRIGGERED"
      : reacted
        ? "REACTED"
        : inZone || touched
          ? "IN_ZONE"
          : depthPct > 0.12
            ? "RETRACING"
            : "IMPULSE";
    const quality =
      triggered && depthPct >= 0.25 && depthPct <= 0.75
        ? "strong"
        : reacted && depthPct >= 0.2
          ? "good"
          : inZone
            ? "mixed"
            : "weak";
    return {
      phase,
      impulse,
      depthPct,
      atrDepth,
      inZone: inZone || touched,
      reacted,
      triggerType: triggered ? "reclaim_close" : "none",
      triggerPrice: triggered ? last.close : null,
      triggerTime: triggered ? last.openTime : null,
      triggerEvidence: triggered
        ? `15m close ${last.close} reclaimed support zone ${zone!.low.toFixed(2)}–${zone!.high.toFixed(2)} after ${ (depthPct * 100).toFixed(0)}% retrace`
        : "",
      quality,
      note: triggered
        ? "reclaim after structural retracement"
        : reacted
          ? "reaction at support, reclaim not closed above zone"
          : inZone || touched
            ? "retracement into HL support — waiting for reclaim close"
            : depthPct > 0.12
              ? `retracing ${(depthPct * 100).toFixed(0)}% of impulse, not yet in HL zone`
              : "impulse in progress — no structural retracement yet",
    };
  }
  if (!(hl && hh)) return { ...empty, note: "missing LH/LL for bearish impulse" };
  const impulse = (ph ?? hh) - hl;
  if (!(impulse > 0)) return { ...empty, note: "no bearish impulse" };
  const retrace = last.high - hl;
  const depthPct = retrace / impulse;
  const atrDepth = ind.atr > 0 ? retrace / ind.atr : null;
  const inZone = Boolean(zone && last.high >= zone.low && last.high <= zone.high * 1.001);
  const touched = Boolean(zone && args.candles.slice(-8).some((c) => c.high >= zone.low && c.high <= zone.high));
  const reacted = Boolean(zone && touched && last.close < zone.mid && last.close <= last.open);
  const triggered = Boolean(zone && reacted && last.close < zone.low && last.close < ind.emaFast);
  const phase: RetracePhase = triggered
    ? "TRIGGERED"
    : reacted
      ? "REACTED"
      : inZone || touched
        ? "IN_ZONE"
        : depthPct > 0.12
          ? "RETRACING"
          : "IMPULSE";
  const quality =
    triggered && depthPct >= 0.25 && depthPct <= 0.75
      ? "strong"
      : reacted && depthPct >= 0.2
        ? "good"
        : inZone
          ? "mixed"
          : "weak";
  return {
    phase,
    impulse,
    depthPct,
    atrDepth,
    inZone: inZone || touched,
    reacted,
    triggerType: triggered ? "rejection_close" : "none",
    triggerPrice: triggered ? last.close : null,
    triggerTime: triggered ? last.openTime : null,
    triggerEvidence: triggered
      ? `15m close ${last.close} rejected resistance zone ${zone!.low.toFixed(2)}–${zone!.high.toFixed(2)} after ${(depthPct * 100).toFixed(0)}% retrace`
      : "",
    quality,
    note: triggered
      ? "rejection after structural retracement"
      : reacted
        ? "reaction at resistance, rejection not closed below zone"
        : inZone || touched
          ? "retracement into LH resistance — waiting for rejection close"
          : depthPct > 0.12
            ? `retracing ${(depthPct * 100).toFixed(0)}% of impulse, not yet in LH zone`
            : "impulse in progress — no structural retracement yet",
  };
}
