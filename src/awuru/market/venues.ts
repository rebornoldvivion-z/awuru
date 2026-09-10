import {
  BINANCE_INTERVAL,
  BINANCE_VISION,
  FETCH_LIMIT,
  FETCH_TIMEOUT_MS,
  INTERVAL_MS,
  KRAKEN_INTERVAL,
  KRAKEN_PUBLIC,
  OKX_BAR,
  OKX_PUBLIC,
  TIMEFRAMES,
  VENUE_SYMBOLS,
  type Asset,
  type Timeframe,
  type Venue,
} from "../domain/constants.ts";
import type { Candle, InstrumentFilters, MtfBundle, Series } from "../domain/types.ts";
import { num, splitLive } from "./candles.ts";
import { parseFilters } from "./filters.ts";
import { coerceMs, scheduledCloseTime } from "../domain/time.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

class VenueError extends Error {
  venue: Venue;
  constructor(venue: Venue, message: string) {
    super(message);
    this.venue = venue;
  }
}

async function getJson(fetchImpl: FetchLike, url: string, venue: Venue): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new VenueError(venue, `${venue} HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof VenueError) throw err;
    const msg = err instanceof Error ? err.message : "fetch failed";
    throw new VenueError(venue, `${venue} ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

function parseBinanceKlines(raw: unknown, tf: Timeframe): Candle[] {
  if (!Array.isArray(raw)) throw new Error("binance klines not an array");
  const iv = INTERVAL_MS[tf];
  return raw.map((row) => {
    const r = row as unknown[];
    const openTime = num(r[0]);
    return {
      openTime,
      closeTime: num(r[6]) || scheduledCloseTime(openTime, iv),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: num(r[5]),
    };
  });
}

function parseKrakenOhlc(raw: unknown, tf: Timeframe): Candle[] {
  const result = (raw as { error?: string[]; result?: Record<string, unknown> }).result;
  const err = (raw as { error?: string[] }).error;
  if (err && err.length) throw new Error(`kraken ${err.join(",")}`);
  if (!result) throw new Error("kraken missing result");
  let rows: unknown[] | undefined;
  for (const [k, v] of Object.entries(result)) {
    if (k === "last") continue;
    if (Array.isArray(v)) rows = v;
  }
  if (!rows) throw new Error("kraken missing OHLC array");
  const iv = INTERVAL_MS[tf];
  return rows.map((row) => {
    const r = row as unknown[];
    const openTime = coerceMs(num(r[0]));
    return {
      openTime,
      closeTime: scheduledCloseTime(openTime, iv),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: num(r[6]),
    };
  });
}

function parseOkxCandles(raw: unknown, tf: Timeframe): Candle[] {
  const code = (raw as { code?: string }).code;
  if (code && code !== "0") throw new Error(`okx code ${code}`);
  const data = (raw as { data?: unknown[] }).data;
  if (!Array.isArray(data)) throw new Error("okx missing data");
  const iv = INTERVAL_MS[tf];
  return data.map((row) => {
    const r = row as unknown[];
    const openTime = num(r[0]);
    const confirmRaw = String(r[8] ?? "");
    const confirm: "0" | "1" | undefined = confirmRaw === "1" ? "1" : confirmRaw === "0" ? "0" : undefined;
    return {
      openTime,
      closeTime: scheduledCloseTime(openTime, iv),
      open: num(r[1]),
      high: num(r[2]),
      low: num(r[3]),
      close: num(r[4]),
      volume: num(r[5]),
      confirm,
    };
  });
}

async function loadBinance(asset: Asset, now: number, fetchImpl: FetchLike): Promise<MtfBundle> {
  const meta = VENUE_SYMBOLS.binance[asset];
  const series = {} as Record<Timeframe, Series>;
  for (const tf of TIMEFRAMES) {
    const url = `${BINANCE_VISION}/api/v3/klines?symbol=${meta.native}&interval=${BINANCE_INTERVAL[tf]}&limit=${FETCH_LIMIT[tf]}`;
    const raw = await getJson(fetchImpl, url, "binance");
    const parsed = parseBinanceKlines(raw, tf);
    const split = splitLive(parsed, INTERVAL_MS[tf], now, "binance");
    series[tf] = {
      venue: "binance",
      symbol: meta.native,
      quote: meta.quote,
      timeframe: tf,
      instrument: meta.instrument,
      marketClass: meta.marketClass,
      asset,
      candles: split.closed,
      live: split.live,
    };
  }
  const infoUrl = `${BINANCE_VISION}/api/v3/exchangeInfo?symbols=${encodeURIComponent(JSON.stringify([meta.native]))}`;
  const info = await getJson(fetchImpl, infoUrl, "binance");
  const filters = parseFilters("binance", info, meta.native);
  if ("error" in filters) throw new VenueError("binance", filters.error);
  filters.instrument = meta.instrument;
  filters.marketClass = meta.marketClass;
  return bundle("binance", asset, meta, series, filters, false, []);
}

async function loadKraken(asset: Asset, now: number, fetchImpl: FetchLike): Promise<MtfBundle> {
  const meta = VENUE_SYMBOLS.kraken[asset];
  const series = {} as Record<Timeframe, Series>;
  for (const tf of TIMEFRAMES) {
    const url = `${KRAKEN_PUBLIC}/OHLC?pair=${meta.native}&interval=${KRAKEN_INTERVAL[tf]}`;
    const raw = await getJson(fetchImpl, url, "kraken");
    const parsed = parseKrakenOhlc(raw, tf);
    const split = splitLive(parsed, INTERVAL_MS[tf], now, "kraken");
    series[tf] = {
      venue: "kraken",
      symbol: meta.native,
      quote: meta.quote,
      timeframe: tf,
      instrument: meta.instrument,
      marketClass: meta.marketClass,
      asset,
      candles: split.closed,
      live: split.live,
    };
  }
  const info = await getJson(fetchImpl, `${KRAKEN_PUBLIC}/AssetPairs?pair=${meta.native}`, "kraken");
  const filters = parseFilters("kraken", info, meta.native);
  if ("error" in filters) throw new VenueError("kraken", filters.error);
  filters.instrument = meta.instrument;
  filters.marketClass = meta.marketClass;
  return bundle("kraken", asset, meta, series, filters, false, []);
}

async function loadOkx(asset: Asset, now: number, fetchImpl: FetchLike): Promise<MtfBundle> {
  const meta = VENUE_SYMBOLS.okx[asset];
  const series = {} as Record<Timeframe, Series>;
  for (const tf of TIMEFRAMES) {
    const url = `${OKX_PUBLIC}/market/candles?instId=${meta.native}&bar=${OKX_BAR[tf]}&limit=300`;
    const raw = await getJson(fetchImpl, url, "okx");
    const parsed = parseOkxCandles(raw, tf);
    const split = splitLive(parsed, INTERVAL_MS[tf], now, "okx");
    series[tf] = {
      venue: "okx",
      symbol: meta.native,
      quote: meta.quote,
      timeframe: tf,
      instrument: meta.instrument,
      marketClass: meta.marketClass,
      asset,
      candles: split.closed,
      live: split.live,
    };
  }
  const info = await getJson(
    fetchImpl,
    `${OKX_PUBLIC}/public/instruments?instType=SPOT&instId=${meta.native}`,
    "okx",
  );
  const filters = parseFilters("okx", info, meta.native);
  if ("error" in filters) throw new VenueError("okx", filters.error);
  filters.instrument = meta.instrument;
  filters.marketClass = meta.marketClass;
  return bundle("okx", asset, meta, series, filters, false, []);
}

function bundle(
  venue: Venue,
  asset: Asset,
  meta: { native: string; quote: string; instrument: string; marketClass: import("../domain/constants.ts").MarketClass },
  series: Record<Timeframe, Series>,
  filters: InstrumentFilters,
  switched: boolean,
  failedVenues: Venue[],
): MtfBundle {
  return {
    venue,
    asset,
    symbol: meta.native,
    quote: meta.quote,
    instrument: meta.instrument,
    marketClass: meta.marketClass,
    series,
    filters,
    switched,
    failedVenues,
  };
}

const LOADERS: Record<Venue, (asset: Asset, now: number, fetchImpl: FetchLike) => Promise<MtfBundle>> = {
  binance: loadBinance,
  kraken: loadKraken,
  okx: loadOkx,
};

export const VENUE_ORDER: Venue[] = ["binance", "kraken", "okx"];

export async function loadMtfBundle(
  asset: Asset,
  now: number,
  fetchImpl: FetchLike = fetch,
): Promise<{ bundle: MtfBundle | null; failed: Venue[]; errors: string[] }> {
  const failed: Venue[] = [];
  const errors: string[] = [];
  for (const venue of VENUE_ORDER) {
    try {
      const b = await LOADERS[venue](asset, now, fetchImpl);
      b.switched = failed.length > 0;
      b.failedVenues = [...failed];
      return { bundle: b, failed, errors };
    } catch (err) {
      failed.push(venue);
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { bundle: null, failed, errors };
}

export { parseBinanceKlines, parseKrakenOhlc, parseOkxCandles, VenueError };
