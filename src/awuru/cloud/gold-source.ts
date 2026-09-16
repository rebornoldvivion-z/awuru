import { VENUE_SYMBOLS, type MarketClass, type Venue } from "../domain/constants.ts";

export type GoldAdapterId = "PAXG" | "XAUUSD_FREE" | "XAUUSD_PAID";

export type GoldDataSource = {
  id: GoldAdapterId;
  instrument: string;
  marketClass: MarketClass;
  engineValid: boolean;
  venueSymbol: (venue: Venue) => string;
};

/** Active engine tape for GOLD. Not XAUUSD. */
export const PAXG_GOLD_SOURCE: GoldDataSource = {
  id: "PAXG",
  instrument: "PAXGUSDT",
  marketClass: "TOKENIZED_GOLD_PROXY",
  engineValid: true,
  venueSymbol: (venue) => VENUE_SYMBOLS[venue].GOLD.native,
};

export const XAUUSD_FREE_SOURCE: GoldDataSource = {
  id: "XAUUSD_FREE",
  instrument: "XAUUSD",
  marketClass: "XAUUSD_SPOT",
  engineValid: false,
  venueSymbol: () => "XAUUSD",
};

export const XAUUSD_PAID_SOURCE: GoldDataSource = {
  id: "XAUUSD_PAID",
  instrument: "XAUUSD",
  marketClass: "XAUUSD_SPOT",
  engineValid: false,
  venueSymbol: () => "XAUUSD",
};

export const ACTIVE_GOLD_SOURCE: GoldDataSource = PAXG_GOLD_SOURCE;

export function assertGoldIdentity(instrument: string, marketClass: string): void {
  if (ACTIVE_GOLD_SOURCE.id !== "PAXG") throw new Error("active gold adapter must be PAXG");
  if (instrument !== "PAXGUSDT" || marketClass !== "TOKENIZED_GOLD_PROXY") {
    throw new Error(`GOLD identity violation: ${instrument}/${marketClass}`);
  }
}
