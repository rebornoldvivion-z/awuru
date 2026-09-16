import type { Timeframe, Venue } from "../domain/constants.ts";
import type { Candle } from "../domain/types.ts";
import { isEngineValidCandle } from "../market/candles.ts";
import { INTERVAL_MS } from "../domain/constants.ts";
import { candleKey, seriesKey } from "./keys.ts";

export type TapeRow = {
  venue: Venue;
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
};

export type UpsertResult = "inserted" | "unchanged" | "conflict";

export function createMemoryTape() {
  const rows = new Map<string, TapeRow>();

  return {
    size(): number {
      return rows.size;
    },

    get(venue: Venue, symbol: string, timeframe: Timeframe, openTime: number): TapeRow | undefined {
      return rows.get(candleKey(venue, symbol, timeframe, openTime));
    },

    series(venue: Venue, symbol: string, timeframe: Timeframe): Candle[] {
      const prefix = `${seriesKey(venue, symbol, timeframe)}|`;
      const found: Candle[] = [];
      for (const [k, row] of rows) {
        if (k.startsWith(prefix)) found.push(row.candle);
      }
      return found.sort((a, b) => a.openTime - b.openTime);
    },

    /** Closed bars only. First write wins. Never invents a bar. */
    upsert(row: TapeRow, now: number): UpsertResult {
      const interval = INTERVAL_MS[row.timeframe];
      if (!isEngineValidCandle(row.candle, interval, now, row.venue)) return "unchanged";
      const id = candleKey(row.venue, row.symbol, row.timeframe, row.candle.openTime);
      const prev = rows.get(id);
      if (!prev) {
        rows.set(id, row);
        return "inserted";
      }
      const a = prev.candle;
      const b = row.candle;
      const same =
        a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close && a.volume === b.volume;
      return same ? "unchanged" : "conflict";
    },
  };
}

export type MemoryTape = ReturnType<typeof createMemoryTape>;
