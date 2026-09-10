import type { Timeframe, ZoneType } from "../domain/constants.ts";
import type { Direction, Structure } from "../domain/types.ts";

export type Zone = {
  type: ZoneType;
  origin: string;
  low: number;
  high: number;
  mid: number;
  timeframe: Timeframe;
  createdAt: number;
  valid: boolean;
  invalidIf: string;
};

export function continuationZone(structure: Structure, direction: Direction, timeframe: Timeframe): Zone | null {
  if (direction === "long") {
    const px = structure.lastSwingLow?.price;
    const at = structure.lastSwingLow?.openTime;
    if (!(px && at)) return null;
    const pad = Math.max(px * 0.0008, 0.01);
    return {
      type: "SWING_SUPPORT",
      origin: `last HL ${px}`,
      low: px - pad,
      high: px + pad,
      mid: px,
      timeframe,
      createdAt: at,
      valid: true,
      invalidIf: `15m close below ${px - pad}`,
    };
  }
  const px = structure.lastSwingHigh?.price;
  const at = structure.lastSwingHigh?.openTime;
  if (!(px && at)) return null;
  const pad = Math.max(px * 0.0008, 0.01);
  return {
    type: "SWING_RESISTANCE",
    origin: `last LH ${px}`,
    low: px - pad,
    high: px + pad,
    mid: px,
    timeframe,
    createdAt: at,
    valid: true,
    invalidIf: `15m close above ${px + pad}`,
  };
}

export function opposingTarget(structure: Structure, direction: Direction): { price: number; source: string } | null {
  if (direction === "long") {
    const px = structure.lastSwingHigh?.price ?? structure.rangeHigh;
    return px ? { price: px, source: "opposing swing/range high" } : null;
  }
  const px = structure.lastSwingLow?.price ?? structure.rangeLow;
  return px ? { price: px, source: "opposing swing/range low" } : null;
}

export function setupIdentity(args: {
  asset: string;
  venue: string;
  family: string;
  direction: string;
  zoneCreatedAt: number;
  engineVersion: string;
}): string {
  return `${args.asset}|${args.venue}|${args.family}|${args.direction}|${args.zoneCreatedAt}|${args.engineVersion}`;
}
