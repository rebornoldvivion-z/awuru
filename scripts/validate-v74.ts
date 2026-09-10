/**
 * AWURU v7.4 historical validation.
 * Does not modify the engine. No parameter fitting.
 * Public Binance Vision only. No accounts.
 */
import { decide } from "../src/awuru/engine/engine.ts";
import { emptyRiskDay } from "../src/awuru/risk/risk.ts";
import { utcDayKey } from "../src/awuru/domain/time.ts";
import { INTERVAL_MS, ENGINE_VERSION } from "../src/awuru/domain/constants.ts";
import { parseBinanceFilters } from "../src/awuru/market/filters.ts";
import { snapshot } from "../src/awuru/engine/indicators.ts";
import { priorDonchian } from "../src/awuru/engine/indicators.ts";
import { readStructure, interpretPattern, continuationLocation } from "../src/awuru/engine/structure.ts";
import { classifyRegime } from "../src/awuru/engine/regime.ts";
import { htfBiasFrom } from "../src/awuru/engine/families.ts";
import { lastClosed } from "../src/awuru/market/candles.ts";
import { pathOutcome } from "../src/awuru/engine/backtest.ts";
import type { Candle, Decision, InstrumentFilters, MtfBundle, Series } from "../src/awuru/domain/types.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];
const FEE = 0.001;
const SLIP = 0.0002;
const HORIZON = 16;
const IS_END = Date.UTC(2026, 7, 11); // 2026-08-11 00:00Z  — frozen before looking at OOS
const FETCH_START = Date.UTC(2026, 4, 1); // 2026-05-01
const MARKETS = [
  { asset: "BTC" as const, symbol: "BTCUSDT" },
  { asset: "ETH" as const, symbol: "ETHUSDT" },
  { asset: "GOLD" as const, symbol: "PAXGUSDT" },
];

const profile = {
  id: "profile" as const,
  persona: "Orion" as const,
  equity: 10_000,
  goalTarget: null,
  goalDeadline: null,
  createdAt: 0,
  updatedAt: 0,
};

function parseKlines(raw: unknown[], tf: "15m" | "1h" | "4h"): Candle[] {
  const iv = INTERVAL_MS[tf];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const openTime = Number(row[0]);
    out.push({
      openTime,
      closeTime: Number(row[6] ?? openTime + iv - 1),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5]),
      confirm: "1",
    });
  }
  return out;
}

async function fetchPages(symbol: string, interval: string, startMs: number, endMs: number): Promise<unknown[]> {
  const all: unknown[] = [];
  let end = endMs;
  for (let n = 0; n < 40; n++) {
    const url = `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000&endTime=${end}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${symbol} ${interval} HTTP ${res.status}`);
    const page = (await res.json()) as unknown[];
    if (!Array.isArray(page) || page.length === 0) break;
    all.unshift(...page);
    const first = Number((page[0] as unknown[])[0]);
    if (first <= startMs) break;
    end = first - 1;
  }
  return all;
}

function dedupe(c: Candle[]): Candle[] {
  const m = new Map<number, Candle>();
  for (const x of c) m.set(x.openTime, x);
  return [...m.values()].sort((a, b) => a.openTime - b.openTime);
}

function gapStats(c: Candle[], step: number) {
  let missing = 0;
  let dups = 0;
  const seen = new Set<number>();
  for (const x of c) {
    if (seen.has(x.openTime)) dups++;
    seen.add(x.openTime);
  }
  for (let i = 1; i < c.length; i++) {
    const dt = c[i]!.openTime - c[i - 1]!.openTime;
    if (dt > step) missing += Math.round(dt / step) - 1;
  }
  return { n: c.length, missing, dups, start: c[0]?.openTime ?? null, end: c.at(-1)?.openTime ?? null };
}

function seriesOf(asset: "BTC" | "ETH" | "GOLD", symbol: string, tf: "15m" | "1h" | "4h", candles: Candle[]): Series {
  return {
    venue: "binance",
    symbol,
    quote: "USDT",
    timeframe: tf,
    instrument: symbol,
    marketClass: asset === "GOLD" ? "TOKENIZED_GOLD_PROXY" : "CRYPTO_SPOT",
    asset,
    candles,
    live: null,
  };
}

function sliceClosed(all: Candle[], iv: number, now: number, keep: number): Candle[] {
  const closed = all.filter((c) => c.openTime + iv <= now);
  return closed.slice(-keep);
}

function maeMfe(direction: "long" | "short", entry: number, future: Candle[]) {
  let mae = 0;
  let mfe = 0;
  for (const b of future) {
    if (direction === "long") {
      mae = Math.max(mae, entry - b.low);
      mfe = Math.max(mfe, b.high - entry);
    } else {
      mae = Math.max(mae, b.high - entry);
      mfe = Math.max(mfe, entry - b.low);
    }
  }
  return { mae, mfe };
}

type Rec = {
  t: number;
  asset: string;
  user: string;
  wait: string | null;
  kind: string;
  family: string | null;
  dir: string | null;
  regime: string | null;
  structure: string | null;
  pattern: string | null;
  q: string | null;
  trig: string | null;
  rr: number | null;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  v73rel: boolean;
  v72rel: boolean;
  v711rel: boolean;
  outcome: string | null;
  grossR: number | null;
  netR: number | null;
  maeR: number | null;
  mfeR: number | null;
  hypo: string | null;
  hypoR: number | null;
};

function reconstruct(c15: Candle[], c1: Candle[], c4: Candle[]) {
  const last = lastClosed(c15);
  const last1 = lastClosed(c1);
  const last4 = lastClosed(c4);
  const ind = last ? snapshot(c15) : null;
  const ind1 = last1 ? snapshot(c1) : null;
  const ind4 = last4 ? snapshot(c4) : null;
  if (!last || !ind) return { v711: false, v72: false };
  const st = readStructure(c15, priorDonchian(c15));
  const rg = classifyRegime(last, ind, c15, st);
  const emaLong = last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi;
  const emaShort = last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi;
  const dir = emaLong ? "long" as const : emaShort ? "short" as const : null;
  const v711 = Boolean(dir && ind.adx >= 20);
  const structuralOk = st.read === "BULLISH_STRUCTURE" || st.read === "BEARISH_STRUCTURE";
  const loc = dir ? continuationLocation(c15, last, ind.emaFast, ind.atr, dir) : null;
  const h1 = htfBiasFrom(ind1, last1);
  const h4 = htfBiasFrom(ind4, last4);
  void h1;
  void h4;
  void rg;
  void interpretPattern;
  const v72 = Boolean(
    dir &&
      structuralOk &&
      ((dir === "long" && emaLong) || (dir === "short" && emaShort)) &&
      ind.adx >= 20 &&
      loc?.reclaimed,
  );
  return { v711, v72 };
}

function scorePath(d: Decision, future: Candle[]) {
  if (!d.geometry || !d.direction) return null;
  const g = d.geometry;
  const o = pathOutcome(d.direction, g.entry, g.stop, g.tp1, future);
  const risk = g.riskPerUnit;
  const grossR = o === "tp1" ? g.rr : o === "sl" ? -1 : 0;
  const costR = ((FEE * 2 + SLIP) * g.entry) / risk;
  const mm = maeMfe(d.direction, g.entry, future);
  return {
    outcome: o,
    grossR,
    netR: o === "expired" ? -costR : grossR - costR,
    maeR: mm.mae / risk,
    mfeR: mm.mfe / risk,
  };
}

function stats(rows: Rec[], flag: (r: Rec) => boolean) {
  const rel = rows.filter(flag);
  const n = rows.length;
  const scored = rel.filter((r) => r.netR != null);
  const rs = scored.map((r) => r.netR!) ;
  const wins = rs.filter((x) => x > 0);
  const losses = rs.filter((x) => x < 0);
  const sum = rs.reduce((a, b) => a + b, 0);
  const avg = rs.length ? sum / rs.length : null;
  const sorted = [...rs].sort((a, b) => a - b);
  const med = sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = gl > 0 ? gp / gl : wins.length ? Infinity : null;
  let eq = 0, peak = 0, dd = 0, lose = 0, maxLose = 0;
  for (const x of rs) {
    eq += x;
    peak = Math.max(peak, eq);
    dd = Math.min(dd, eq - peak);
    if (x < 0) { lose++; maxLose = Math.max(maxLose, lose); } else lose = 0;
  }
  const nLabel = rs.length < 30 ? "tiny" : rs.length < 80 ? "limited" : rs.length < 200 ? "moderate" : "substantial";
  return {
    observations: n,
    releases: rel.length,
    scored: rs.length,
    nQuality: nLabel,
    buy: rel.filter((r) => r.user === "BUY").length,
    sell: rel.filter((r) => r.user === "SELL").length,
    watch: rows.filter((r) => r.user === "WATCH").length,
    wait: rows.filter((r) => r.user === "WAIT").length,
    releaseRate: n ? rel.length / n : 0,
    avgR: avg,
    medR: med,
    expectancyR: avg,
    profitFactor: pf,
    maxDD_R: dd,
    maxLoseStreak: maxLose,
    sl: scored.filter((r) => r.outcome === "sl").length,
    tp1: scored.filter((r) => r.outcome === "tp1").length,
    expired: scored.filter((r) => r.outcome === "expired").length,
    insufficient: rs.length < 30,
  };
}

function group(rows: Rec[], key: (r: Rec) => string, flag: (r: Rec) => boolean) {
  const keys = [...new Set(rows.map(key))];
  const o: Record<string, ReturnType<typeof stats>> = {};
  for (const k of keys) o[k] = stats(rows.filter((r) => key(r) === k), flag);
  return o;
}

async function runMarket(asset: "BTC" | "ETH" | "GOLD", symbol: string, endMs: number) {
  const [r15, r1, r4, info] = await Promise.all([
    fetchPages(symbol, "15m", FETCH_START, endMs),
    fetchPages(symbol, "1h", FETCH_START, endMs),
    fetchPages(symbol, "4h", FETCH_START, endMs),
    fetch(`https://data-api.binance.vision/api/v3/exchangeInfo?symbol=${symbol}`).then((r) => r.json()),
  ]);
  let filters = parseBinanceFilters(info, symbol);
  if ("error" in filters) throw new Error(String((filters as { error: string }).error));
  filters = { ...filters, instrument: symbol, marketClass: asset === "GOLD" ? "TOKENIZED_GOLD_PROXY" : "CRYPTO_SPOT" };
  const all15 = dedupe(parseKlines(r15, "15m")).filter((c) => c.openTime >= FETCH_START && c.openTime <= endMs);
  const all1 = dedupe(parseKlines(r1, "1h")).filter((c) => c.openTime >= FETCH_START && c.openTime <= endMs);
  const all4 = dedupe(parseKlines(r4, "4h")).filter((c) => c.openTime >= FETCH_START && c.openTime <= endMs);
  const quality = {
    "15m": gapStats(all15, IV15),
    "1h": gapStats(all1, IV1H),
    "4h": gapStats(all4, IV4H),
  };
  const rows: Rec[] = [];
  const startIdx = all15.findIndex((c) => c.openTime >= FETCH_START + 10 * 86400000);
  const lastIdx = all15.length - 2;
  for (let i = Math.max(startIdx, 80); i <= lastIdx; i++) {
    const bar = all15[i]!;
    const now = bar.openTime + IV15;
    const s15 = sliceClosed(all15, IV15, now, 80);
    const s1 = sliceClosed(all1, IV1H, now, 60);
    const s4 = sliceClosed(all4, IV4H, now, 40);
    if (s15.length < 50 || s1.length < 30 || s4.length < 20) continue;
    const bundle: MtfBundle = {
      venue: "binance",
      asset,
      symbol,
      quote: "USDT",
      instrument: symbol,
      marketClass: asset === "GOLD" ? "TOKENIZED_GOLD_PROXY" : "CRYPTO_SPOT",
      switched: false,
      failedVenues: [],
      filters: filters as InstrumentFilters,
      series: {
        "15m": seriesOf(asset, symbol, "15m", s15),
        "1h": seriesOf(asset, symbol, "1h", s1),
        "4h": seriesOf(asset, symbol, "4h", s4),
      },
    };
    const d = decide({
      bundle,
      profile,
      riskDay: emptyRiskDay(utcDayKey(now)),
      now,
      corroboration: null,
    });
    const recon = reconstruct(s15, s1, s4);
    const future = all15.slice(i + 1, i + 1 + HORIZON);
    const scored = d.kind === "RELEASE" ? scorePath(d, future) : null;
    const hypo = d.userDecision === "WATCH" && d.geometry && d.direction ? scorePath({ ...d, kind: "RELEASE", direction: d.direction, geometry: d.geometry } as Decision, future) : null;
    rows.push({
      t: now,
      asset,
      user: d.userDecision,
      wait: d.waitCode,
      kind: d.kind,
      family: d.family,
      dir: d.direction,
      regime: d.regime?.kind ?? null,
      structure: d.structure?.read ?? null,
      pattern: d.structure?.pattern ?? null,
      q: d.best?.qualityGrade ?? null,
      trig: d.best?.triggerType ?? null,
      rr: d.geometry?.rr ?? null,
      entry: d.geometry?.entry ?? null,
      stop: d.geometry?.stop ?? null,
      tp1: d.geometry?.tp1 ?? null,
      v73rel: d.kind === "RELEASE",
      v72rel: recon.v72,
      v711rel: recon.v711,
      outcome: scored?.outcome ?? null,
      grossR: scored?.grossR ?? null,
      netR: scored?.netR ?? null,
      maeR: scored?.maeR ?? null,
      mfeR: scored?.mfeR ?? null,
      hypo: hypo?.outcome ?? null,
      hypoR: hypo?.netR ?? null,
    });
  }
  return { quality, rows };
}

function report(tag: string, rows: Rec[]) {
  const v73 = stats(rows, (r) => r.v73rel);
  const v72 = {
    flags: rows.filter((r) => r.v72rel).length,
    rate: rows.length ? rows.filter((r) => r.v72rel).length / rows.length : 0,
  };
  const v711 = {
    flags: rows.filter((r) => r.v711rel).length,
    rate: rows.length ? rows.filter((r) => r.v711rel).length / rows.length : 0,
  };
  const watchHypo = rows.filter((r) => r.hypoR != null);
  const watchAvg = watchHypo.length ? watchHypo.reduce((a, r) => a + r.hypoR!, 0) / watchHypo.length : null;
  const expandingRelease = rows.filter((r) => r.v73rel && r.structure === "EXPANDING_RANGE").length;
  const bothBE = rows.filter((r) => r.v73rel);
  return {
    tag,
    n: rows.length,
    v73,
    v72flags: v72,
    v711flags: v711,
    expandingTrendReleases: expandingRelease,
    byRegime: group(rows, (r) => r.regime ?? "none", (r) => r.v73rel),
    byStructure: group(rows, (r) => r.structure ?? "none", (r) => r.v73rel),
    byDir: group(rows, (r) => r.dir ?? "none", (r) => r.v73rel),
    byQuality: group(rows, (r) => r.q ?? "none", (r) => r.v73rel),
    byTrig: group(rows, (r) => r.trig ?? "none", (r) => r.v73rel),
    byRr: group(rows, (r) => {
      if (r.rr == null) return "none";
      if (r.rr < 1.5) return "1.2-1.5";
      if (r.rr < 2) return "1.5-2.0";
      if (r.rr < 3) return "2.0-3.0";
      return "3.0+";
    }, (r) => r.v73rel),
    watchHypoN: watchHypo.length,
    watchHypoAvgNetR: watchAvg,
    waitCodes: Object.fromEntries(
      [...new Set(rows.map((r) => r.wait ?? "null"))].map((k) => [k, rows.filter((r) => (r.wait ?? "null") === k).length]),
    ),
  };
}

const endNow = Date.now();
const out: Record<string, unknown> = {
  engine: ENGINE_VERSION,
  method: "no-lookahead closed-bar walk, independent empty risk each bar, SL-first same bar, 16-bar horizon, 10bps fee/side + 2bps slip",
  fitting: "NONE — engine 7.3.0 frozen",
  isEnd: IS_END,
  fetchStart: FETCH_START,
  generatedAt: endNow,
  markets: {},
};

for (const m of MARKETS) {
  const { quality, rows } = await runMarket(m.asset, m.symbol, endNow);
  const isRows = rows.filter((r) => r.t < IS_END);
  const oosRows = rows.filter((r) => r.t >= IS_END);
  (out.markets as Record<string, unknown>)[m.symbol] = {
    quality,
    inSample: report("IS", isRows),
    outOfSample: report("OOS", oosRows),
    overlapNote: "BTC/ETH contemporaneous releases are correlated; not independent trials",
  };
  console.error(JSON.stringify({ market: m.symbol, is: isRows.length, oos: oosRows.length, q: quality["15m"] }));
}

console.log(JSON.stringify(out));
