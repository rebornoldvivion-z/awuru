import type { Family, Persona, Timeframe, Venue } from "../domain/constants.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";

export function seriesKey(venue: Venue, symbol: string, quote: string, tf: Timeframe): string {
  return `${venue}:${symbol}:${quote}:${tf}`;
}

export function signalId(args: {
  accountId: string;
  venue: Venue;
  symbol: string;
  timeframe: Timeframe;
  barOpen: number;
  family: Family;
  persona: Persona;
  engineVersion?: string;
}): string {
  const v = args.engineVersion ?? ENGINE_VERSION;
  return [
    args.accountId,
    args.venue,
    args.symbol,
    args.timeframe,
    String(args.barOpen),
    args.family,
    args.persona,
    v,
  ].join("|");
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
