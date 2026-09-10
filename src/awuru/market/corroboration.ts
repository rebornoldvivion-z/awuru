import {
  AGREE_SPREAD_PCT,
  AGREE_TS_MS,
  BINANCE_VISION,
  DIVERGE_SPREAD_PCT,
  INTERVAL_MS,
  KRAKEN_PUBLIC,
  OKX_PUBLIC,
  VENUE_SYMBOLS,
  type Asset,
  type Venue,
} from "../domain/constants.ts";
import type { Corroboration, SourceSnap } from "../domain/types.ts";
import { parseBinanceKlines, parseKrakenOhlc, parseOkxCandles, VENUE_ORDER, type FetchLike } from "./venues.ts";
import { splitLive } from "./candles.ts";

async function json(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export async function loadSourceSnaps(
  asset: Asset,
  now: number,
  fetchImpl: FetchLike = fetch,
): Promise<SourceSnap[]> {
  const jobs = VENUE_ORDER.map(async (venue): Promise<SourceSnap> => {
    const t0 = Date.now();
    const spec = VENUE_SYMBOLS[venue][asset];
    try {
      const url =
        venue === "binance"
          ? `${BINANCE_VISION}/api/v3/klines?symbol=${spec.native}&interval=15m&limit=2`
          : venue === "kraken"
            ? `${KRAKEN_PUBLIC}/OHLC?pair=${spec.native}&interval=15`
            : `${OKX_PUBLIC}/market/candles?instId=${spec.native}&bar=15m&limit=2`;
      const raw = await json(url, fetchImpl);
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
        lastClosedOpen: last?.openTime ?? null,
        lastClose: last?.close ?? null,
        ms: Date.now() - t0,
        error: last ? undefined : "no closed 15m",
      };
    } catch (err) {
      return {
        venue,
        ok: false,
        lastClosedOpen: null,
        lastClose: null,
        ms: Date.now() - t0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
  return Promise.all(jobs);
}

export function measureCorroboration(snaps: SourceSnap[], primary: Venue | null): Corroboration {
  const ok = snaps.filter((s) => s.ok && s.lastClose != null && s.lastClosedOpen != null);
  if (ok.length === 0) {
    return {
      status: "INSUFFICIENT",
      primary,
      snaps,
      spreadPct: null,
      timestampDeltaMs: null,
      reason: "no venue returned a closed 15m bar",
    };
  }
  if (ok.length === 1) {
    return {
      status: "PRIMARY_ONLY",
      primary: ok[0]!.venue,
      snaps,
      spreadPct: null,
      timestampDeltaMs: 0,
      reason: `only ${ok[0]!.venue} has a closed 15m bar`,
    };
  }
  const opens = ok.map((s) => s.lastClosedOpen!);
  const timestampDeltaMs = Math.max(...opens) - Math.min(...opens);
  const closes = ok.map((s) => s.lastClose!);
  const mid = (Math.max(...closes) + Math.min(...closes)) / 2;
  const spreadPct = mid > 0 ? (Math.max(...closes) - Math.min(...closes)) / mid : null;
  if (timestampDeltaMs > AGREE_TS_MS) {
    return {
      status: "INSUFFICIENT",
      primary,
      snaps,
      spreadPct,
      timestampDeltaMs,
      reason: "closed-bar timestamps disagree by more than one 15m interval",
    };
  }
  if (spreadPct != null && spreadPct >= DIVERGE_SPREAD_PCT) {
    return {
      status: "SOURCE_DIVERGENCE",
      primary,
      snaps,
      spreadPct,
      timestampDeltaMs,
      reason: `closed 15m spread ${(spreadPct * 100).toFixed(2)}% exceeds ${(DIVERGE_SPREAD_PCT * 100).toFixed(2)}%`,
    };
  }
  if (spreadPct != null && spreadPct <= AGREE_SPREAD_PCT) {
    return {
      status: "SOURCE_AGREEMENT",
      primary,
      snaps,
      spreadPct,
      timestampDeltaMs,
      reason: `closed 15m spread ${(spreadPct * 100).toFixed(2)}% across ${ok.length} venues`,
    };
  }
  return {
    status: "SOURCE_AGREEMENT",
    primary,
    snaps,
    spreadPct,
    timestampDeltaMs,
    reason: `spread ${spreadPct != null ? (spreadPct * 100).toFixed(2) : "n/a"}% — usable, not an anomaly`,
  };
}
