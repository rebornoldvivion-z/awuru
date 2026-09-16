import type { Asset, Timeframe, Venue } from "../domain/constants.ts";

export function candleKey(venue: Venue, symbol: string, timeframe: Timeframe, openTime: number): string {
  return `${venue}|${symbol}|${timeframe}|${openTime}`;
}

export function decisionKey(asset: Asset, engineVersion: string, venue: Venue, symbol: string, barOpen: number): string {
  return `${asset}|${engineVersion}|${venue}|${symbol}|${barOpen}`;
}

export function thesisEventKey(thesisId: string, at: number, change: string): string {
  return `${thesisId}|${at}|${change}`;
}

export function seriesKey(venue: Venue, symbol: string, timeframe: Timeframe): string {
  return `${venue}|${symbol}|${timeframe}`;
}
