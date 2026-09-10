import {
  ASSETS,
  BINANCE_VISION,
  BUILD_ID,
  ENGINE_VERSION,
  INTERVAL_MS,
  KRAKEN_PUBLIC,
  OKX_PUBLIC,
  SURFACE,
  type Asset,
  type Venue,
} from "../domain/constants.ts";
import { splitLive } from "./candles.ts";
import {
  loadMtfBundle,
  parseBinanceKlines,
  parseKrakenOhlc,
  parseOkxCandles,
  VENUE_ORDER,
} from "./venues.ts";
import type { Corroboration, MtfBundle } from "../domain/types.ts";
import { loadSourceSnaps, measureCorroboration } from "./corroboration.ts";

export type VenuePing = {
  venue: Venue;
  ok: boolean;
  ms: number;
  lastClosedOpen: number | null;
  lastClose: number | null;
  error?: string;
};

export type HealthReport = {
  ok: boolean;
  engine: string;
  build: string;
  surface: string;
  markets: readonly Asset[];
  intelligence: "browser";
  role: "market-data-proxy";
  now: number;
  primary: Venue | null;
  venues: Record<Venue, VenuePing>;
};

export type BundleReport = {
  ok: boolean;
  engine: string;
  build: string;
  asset: Asset;
  now: number;
  cached: boolean;
  bundle: MtfBundle | null;
  failed: Venue[];
  errors: string[];
  corroboration: Corroboration | null;
};

const PING_MS = 8_000;

async function pingJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), PING_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function pingVenue(venue: Venue, now: number): Promise<VenuePing> {
  const t0 = Date.now();
  try {
    const url =
      venue === "binance"
        ? `${BINANCE_VISION}/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=2`
        : venue === "kraken"
          ? `${KRAKEN_PUBLIC}/OHLC?pair=XBTUSD&interval=15`
          : `${OKX_PUBLIC}/market/candles?instId=BTC-USDT&bar=15m&limit=2`;
    const raw = await pingJson(url);
    const parsed =
      venue === "binance"
        ? parseBinanceKlines(raw, "15m")
        : venue === "kraken"
          ? parseKrakenOhlc(raw, "15m")
          : parseOkxCandles(raw, "15m");
    const split = splitLive(parsed, INTERVAL_MS["15m"], now, venue);
    const last = split.closed[split.closed.length - 1];
    return {
      venue,
      ok: Boolean(last),
      ms: Date.now() - t0,
      lastClosedOpen: last?.openTime ?? null,
      lastClose: last?.close ?? null,
      error: last ? undefined : "no closed 15m bar",
    };
  } catch (err) {
    return {
      venue,
      ok: false,
      ms: Date.now() - t0,
      lastClosedOpen: null,
      lastClose: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function healthReport(now = Date.now()): Promise<HealthReport> {
  const pings = await Promise.all(VENUE_ORDER.map((v) => pingVenue(v, now)));
  const venues = {} as Record<Venue, VenuePing>;
  for (const p of pings) venues[p.venue] = p;
  const primary = VENUE_ORDER.find((v) => venues[v].ok) ?? null;
  return {
    ok: primary !== null,
    engine: ENGINE_VERSION,
    build: BUILD_ID,
    surface: SURFACE,
    markets: ASSETS,
    intelligence: "browser",
    role: "market-data-proxy",
    now,
    primary,
    venues,
  };
}

const BUNDLE_CACHE_MS = 35_000;
const bundleCache = new Map<Asset, { at: number; bar: number; report: BundleReport }>();

export function parseAsset(raw: string | null): Asset | null {
  if (!raw) return null;
  const v = raw.toUpperCase();
  return (ASSETS as readonly string[]).includes(v) ? (v as Asset) : null;
}

export async function bundleReport(asset: Asset, now = Date.now()): Promise<BundleReport> {
  const bar = Math.floor(now / INTERVAL_MS["15m"]);
  const hit = bundleCache.get(asset);
  if (hit && hit.bar === bar && now - hit.at < BUNDLE_CACHE_MS) {
    return { ...hit.report, now, cached: true };
  }
  const [loaded, snaps] = await Promise.all([loadMtfBundle(asset, now), loadSourceSnaps(asset, now)]);
  const corroboration = measureCorroboration(snaps, loaded.bundle?.venue ?? null);
  const report: BundleReport = {
    ok: loaded.bundle !== null,
    engine: ENGINE_VERSION,
    build: BUILD_ID,
    asset,
    now,
    cached: false,
    bundle: loaded.bundle,
    failed: loaded.failed,
    errors: loaded.errors,
    corroboration,
  };
  bundleCache.set(asset, { at: now, bar, report });
  return report;
}

export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
} as const;

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
    },
  });
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: { ...CORS } });
}
