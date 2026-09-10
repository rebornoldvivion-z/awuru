/**
 * AWURU v7.6 — TREND geometry/timeframe research.
 * Engine 7.3.0 FROZEN. Same dataset/split/costs as v7.4/v7.5.
 * No new signals. No parameter search.
 */
import { decide } from "../src/awuru/engine/engine.ts";
import { emptyRiskDay } from "../src/awuru/risk/risk.ts";
import { utcDayKey } from "../src/awuru/domain/time.ts";
import { INTERVAL_MS, ENGINE_VERSION } from "../src/awuru/domain/constants.ts";
import { parseBinanceFilters } from "../src/awuru/market/filters.ts";
import { snapshot } from "../src/awuru/engine/indicators.ts";
import { priorDonchian } from "../src/awuru/engine/indicators.ts";
import { lastClosed } from "../src/awuru/market/candles.ts";
import { readStructure } from "../src/awuru/engine/structure.ts";
import { continuationZone } from "../src/awuru/engine/zones.ts";
import { measureRetrace } from "../src/awuru/engine/retrace.ts";
import type { Candle, Direction, InstrumentFilters, MtfBundle, Series } from "../src/awuru/domain/types.ts";

export type ThesisClass = "THESIS_WRONG" | "THESIS_RIGHT_GEOMETRY_MISSED" | "MIXED";
export type TargetClass = "TARGET_UNREACHABLE_IN_HORIZON" | "TARGET_REACHABLE" | "TARGET_PATH_DEPENDENT";
export type FirstEvent = "SL" | "P025" | "P05" | "P1" | "TP1" | "EXPIRY";

/** THESIS_WRONG: never +0.25R. GEOMETRY_MISSED: ≥+0.5R but no TP1. MIXED: else (incl. TP1 or 0.25–0.5R only). */
export function classifyThesis(mfeR: number, outcome: "sl" | "tp1" | "expired"): ThesisClass {
  if (mfeR < 0.25) return "THESIS_WRONG";
  if (mfeR >= 0.5 && outcome !== "tp1") return "THESIS_RIGHT_GEOMETRY_MISSED";
  return "MIXED";
}

export function classifyTarget(args: { tp1R: number; mfe16: number; outcome: string; hit05: boolean }): TargetClass {
  if (args.outcome === "tp1" || args.mfe16 >= 0.8 * args.tp1R) return "TARGET_REACHABLE";
  if (args.hit05 && args.outcome === "sl") return "TARGET_PATH_DEPENDENT";
  if (args.tp1R >= 1.5 && args.mfe16 < 0.5) return "TARGET_UNREACHABLE_IN_HORIZON";
  if (args.mfe16 < 0.5) return "TARGET_UNREACHABLE_IN_HORIZON";
  return "TARGET_PATH_DEPENDENT";
}

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];
const FEE = 0.001;
const SLIP = 0.0002;
const HORIZONS = { h4: 16, h8: 32, h12: 48, h24: 96 } as const;
const IS_END = Date.UTC(2026, 7, 11);
const FETCH_START = Date.UTC(2026, 4, 1);
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
  return all.filter((c) => c.openTime + iv <= now).slice(-keep);
}

function fav(dir: Direction, entry: number, b: Candle, mode: "intra" | "close") {
  if (dir === "long") return mode === "close" ? b.close - entry : b.high - entry;
  return mode === "close" ? entry - b.close : entry - b.low;
}
function adv(dir: Direction, entry: number, b: Candle, mode: "intra" | "close") {
  if (dir === "long") return mode === "close" ? entry - b.close : entry - b.low;
  return mode === "close" ? b.close - entry : b.high - entry;
}

export function scanPath(dir: Direction, entry: number, stop: number, tp1: number, risk: number, future: Candle[]) {
  let maeI = 0, mfeI = 0, maeC = 0, mfeC = 0;
  let tMfe: number | null = null, tMae: number | null = null;
  const firstAt: Record<string, number | null> = { p025: null, p05: null, p1: null, p15: null, p2: null };
  let outcome: "sl" | "tp1" | "expired" = "expired";
  let barsToSl: number | null = null;
  let barsToTp: number | null = null;
  let firstEvent: FirstEvent = "EXPIRY";
  const markFirst = (key: string, i: number, r: number, need: number) => {
    if (firstAt[key] == null && r >= need) firstAt[key] = i + 1;
  };
  for (let i = 0; i < future.length; i++) {
    const b = future[i]!;
    const fi = fav(dir, entry, b, "intra");
    const ai = adv(dir, entry, b, "intra");
    const fc = fav(dir, entry, b, "close");
    const ac = adv(dir, entry, b, "close");
    const hitSl = dir === "long" ? b.low <= stop : b.high >= stop;
    const hitTp = dir === "long" ? b.high >= tp1 : b.low <= tp1;
    if (hitSl) {
      maeI = Math.max(maeI, ai);
      maeC = Math.max(maeC, ac);
      if (tMae == null) tMae = i + 1;
      outcome = "sl";
      barsToSl = i + 1;
      if (firstEvent === "EXPIRY") firstEvent = "SL";
      break;
    }
    if (fi > mfeI) {
      mfeI = fi;
      tMfe = i + 1;
    }
    if (ai > maeI) {
      maeI = ai;
      tMae = i + 1;
    }
    mfeC = Math.max(mfeC, fc);
    maeC = Math.max(maeC, ac);
    const r = fi / risk;
    markFirst("p025", i, r, 0.25);
    markFirst("p05", i, r, 0.5);
    markFirst("p1", i, r, 1);
    markFirst("p15", i, r, 1.5);
    markFirst("p2", i, r, 2);
    if (firstEvent === "EXPIRY") {
      if (firstAt.p1 != null) firstEvent = "P1";
      else if (firstAt.p05 != null) firstEvent = "P05";
      else if (firstAt.p025 != null) firstEvent = "P025";
    }
    if (hitTp) {
      outcome = "tp1";
      barsToTp = i + 1;
      firstEvent = "TP1";
      break;
    }
  }
  const costR = ((FEE * 2 + SLIP) * entry) / risk;
  const tp1R = Math.abs(tp1 - entry) / risk;
  const gross = outcome === "tp1" ? tp1R : outcome === "sl" ? -1 : 0;
  return {
    outcome,
    netR: outcome === "expired" ? -costR : gross - costR,
    mfeR: mfeI / risk,
    maeR: maeI / risk,
    mfeCloseR: mfeC / risk,
    maeCloseR: maeC / risk,
    tMfe,
    tMae,
    firstAt,
    barsToSl,
    barsToTp,
    firstEvent,
    tp1R,
    censored: future.length,
  };
}

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function pct(xs: boolean[]) {
  return xs.length ? xs.filter(Boolean).length / xs.length : null;
}

type Rel = Record<string, unknown>;

async function collect(asset: "BTC" | "ETH" | "GOLD", symbol: string, endMs: number): Promise<Rel[]> {
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
  const out: Rel[] = [];
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
    const d = decide({ bundle, profile, riskDay: emptyRiskDay(utcDayKey(now)), now, corroboration: null });
    if (d.kind !== "RELEASE" || d.family !== "trend" || !d.geometry || !d.direction) continue;
    const last = lastClosed(s15)!;
    const ind = snapshot(s15)!;
    const st = readStructure(s15, priorDonchian(s15));
    const zone = continuationZone(st, d.direction, "15m");
    const retr = measureRetrace({ candles: s15, last, ind, structure: st, direction: d.direction, zone });
    const g = d.geometry;
    const risk = g.riskPerUnit;
    const futureMax = all15.slice(i + 1, i + 1 + HORIZONS.h24);
    const p16 = scanPath(d.direction, g.entry, g.stop, g.tp1, risk, futureMax.slice(0, 16));
    const horizons: Record<string, ReturnType<typeof scanPath> & { available: number }> = {};
    for (const [name, n] of Object.entries(HORIZONS)) {
      const sl = futureMax.slice(0, n);
      horizons[name] = { ...scanPath(d.direction, g.entry, g.stop, g.tp1, risk, sl), available: sl.length };
    }
    const emaLong = last.close > ind.emaFast && ind.emaFast > ind.emaSlow && ind.plusDi > ind.minusDi;
    const emaShort = last.close < ind.emaFast && ind.emaFast < ind.emaSlow && ind.minusDi > ind.plusDi;
    const emaAgree = (d.direction === "long" && emaLong) || (d.direction === "short" && emaShort);
    const structOk = st.read === "BULLISH_STRUCTURE" || st.read === "BEARISH_STRUCTURE";
    const adxOk = ind.adx >= 20;
    const opposing =
      d.direction === "long" ? st.lastSwingHigh?.price ?? st.rangeHigh : st.lastSwingLow?.price ?? st.rangeLow;
    const oppR = opposing != null ? Math.abs(opposing - g.entry) / risk : null;
    out.push({
      t: now,
      split: now < IS_END ? "IS" : "OOS",
      symbol,
      dir: d.direction,
      user: d.userDecision,
      regime: d.regime?.kind,
      structure: st.read,
      trigger: d.best?.triggerType,
      quality: d.best?.qualityGrade,
      entry: g.entry,
      stop: g.stop,
      tp1: g.tp1,
      rr: g.rr,
      atr: ind.atr,
      stopAtr: risk / ind.atr,
      stopPct: risk / g.entry,
      tp1Atr: Math.abs(g.tp1 - g.entry) / ind.atr,
      tp1Pct: Math.abs(g.tp1 - g.entry) / g.entry,
      oppR,
      impulse: retr.impulse,
      depthPct: retr.depthPct,
      atrDepth: retr.atrDepth,
      inZone: retr.inZone,
      reacted: retr.reacted,
      retraceQ: retr.quality,
      emaAgree,
      adx: ind.adx,
      adxOk,
      structOk,
      allThree: structOk && emaAgree && adxOk,
      thesis: classifyThesis(p16.mfeR, p16.outcome),
      targetClass: classifyTarget({ tp1R: p16.tp1R, mfe16: p16.mfeR, outcome: p16.outcome, hit05: p16.firstAt.p05 != null }),
      firstEvent: p16.firstEvent,
      slBefore025: p16.outcome === "sl" && p16.mfeR < 0.25,
      slBefore05: p16.outcome === "sl" && p16.mfeR < 0.5,
      slAfter05: p16.outcome === "sl" && p16.mfeR >= 0.5,
      slAfter1: p16.outcome === "sl" && p16.mfeR >= 1,
      p16,
      horizons,
    });
  }
  return out;
}

function summarize(rows: Rel[]) {
  const n = rows.length;
  const cls = (k: ThesisClass) => rows.filter((r) => r.thesis === k).length;
  const reach = (key: string) => {
    const times = rows.map((r) => (r.p16 as { firstAt: Record<string, number | null> }).firstAt[key]).filter((x): x is number => x != null);
    return {
      reached: times.length,
      pct: n ? times.length / n : null,
      medBars: median(times),
      meanBars: mean(times),
      censored: n - times.length,
    };
  };
  const p16s = rows.map((r) => r.p16 as ReturnType<typeof scanPath>);
  const hz: Record<string, unknown> = {};
  for (const name of Object.keys(HORIZONS)) {
    const hs = rows.map((r) => (r.horizons as Record<string, ReturnType<typeof scanPath> & { available: number }>)[name]!);
    const enough = hs.filter((h, i) => h.available >= HORIZONS[name as keyof typeof HORIZONS] || (rows[i]!.split === "IS"));
    void enough;
    hz[name] = {
      n: hs.length,
      fullyAvailable: hs.filter((h) => h.available >= HORIZONS[name as keyof typeof HORIZONS]).length,
      sl: hs.filter((h) => h.outcome === "sl").length,
      tp1: hs.filter((h) => h.outcome === "tp1").length,
      expired: hs.filter((h) => h.outcome === "expired").length,
      avgMfeR: mean(hs.map((h) => h.mfeR)),
      avgMaeR: mean(hs.map((h) => h.maeR)),
      medMfeR: median(hs.map((h) => h.mfeR)),
      medMaeR: median(hs.map((h) => h.maeR)),
      avgCloseMfeR: mean(hs.map((h) => h.mfeCloseR)),
      tp1Pct: hs.length ? hs.filter((h) => h.outcome === "tp1").length / hs.length : null,
      slPct: hs.length ? hs.filter((h) => h.outcome === "sl").length / hs.length : null,
    };
  }
  const qg = ["weak", "mixed", "good", "strong"];
  const byQ: Record<string, { n: number; avgMfe: number | null; slAfter05: number | null }> = {};
  for (const q of qg) {
    const sub = rows.filter((r) => r.retraceQ === q);
    byQ[q] = {
      n: sub.length,
      avgMfe: mean(sub.map((r) => (r.p16 as ReturnType<typeof scanPath>).mfeR)),
      slAfter05: pct(sub.map((r) => Boolean(r.slAfter05))),
    };
  }
  return {
    n,
    thesis: {
      WRONG: cls("THESIS_WRONG"),
      GEOMETRY_MISSED: cls("THESIS_RIGHT_GEOMETRY_MISSED"),
      MIXED: cls("MIXED"),
      wrongPct: n ? cls("THESIS_WRONG") / n : null,
      geoPct: n ? cls("THESIS_RIGHT_GEOMETRY_MISSED") / n : null,
      mixedPct: n ? cls("MIXED") / n : null,
    },
    reach: {
      p025: reach("p025"),
      p05: reach("p05"),
      p1: reach("p1"),
      p15: reach("p15"),
      p2: reach("p2"),
    },
    mfe: { mean: mean(p16s.map((p) => p.mfeR)), med: median(p16s.map((p) => p.mfeR)), closeMean: mean(p16s.map((p) => p.mfeCloseR)) },
    mae: { mean: mean(p16s.map((p) => p.maeR)), med: median(p16s.map((p) => p.maeR)) },
    tMfe: median(p16s.map((p) => p.tMfe).filter((x): x is number => x != null)),
    tMae: median(p16s.map((p) => p.tMae).filter((x): x is number => x != null)),
    firstEvent: Object.fromEntries(["SL", "P025", "P05", "P1", "TP1", "EXPIRY"].map((k) => [k, rows.filter((r) => r.firstEvent === k).length])),
    stop: {
      slBefore025: pct(rows.map((r) => Boolean(r.slBefore025))),
      slBefore05: pct(rows.map((r) => Boolean(r.slBefore05))),
      slAfter05: pct(rows.map((r) => Boolean(r.slAfter05))),
      slAfter1: pct(rows.map((r) => Boolean(r.slAfter1))),
      medStopAtr: median(rows.map((r) => r.stopAtr as number)),
      medStopPct: median(rows.map((r) => r.stopPct as number)),
    },
    target: {
      medTp1R: median(p16s.map((p) => p.tp1R)),
      medTp1Atr: median(rows.map((r) => r.tp1Atr as number)),
      medOppR: median(rows.map((r) => r.oppR as number).filter((x): x is number => x != null)),
      classes: {
        REACHABLE: rows.filter((r) => r.targetClass === "TARGET_REACHABLE").length,
        UNREACHABLE: rows.filter((r) => r.targetClass === "TARGET_UNREACHABLE_IN_HORIZON").length,
        PATH: rows.filter((r) => r.targetClass === "TARGET_PATH_DEPENDENT").length,
      },
    },
    retrace: {
      medDepth: median(rows.map((r) => r.depthPct as number).filter((x) => x != null) as number[]),
      medAtrDepth: median(rows.map((r) => r.atrDepth as number).filter((x) => x != null) as number[]),
      inZone: pct(rows.map((r) => Boolean(r.inZone))),
      reacted: pct(rows.map((r) => Boolean(r.reacted))),
      byQ,
    },
    align: {
      structOk: pct(rows.map((r) => Boolean(r.structOk))),
      emaAgree: pct(rows.map((r) => Boolean(r.emaAgree))),
      adxOk: pct(rows.map((r) => Boolean(r.adxOk))),
      allThree: pct(rows.map((r) => Boolean(r.allThree))),
    },
    horizons: hz,
  };
}

if (process.argv[1]?.endsWith("validate-v76.ts")) {
  const endNow = Date.now();
  const all: Rel[] = [];
  for (const m of MARKETS) {
    const rows = await collect(m.asset, m.symbol, endNow);
    all.push(...rows);
    console.error(JSON.stringify({ market: m.symbol, trendReleases: rows.length, is: rows.filter((r) => r.split === "IS").length, oos: rows.filter((r) => r.split === "OOS").length }));
  }
  const pack = (rows: Rel[]) => ({
    all: summarize(rows),
    BUY: summarize(rows.filter((r) => r.dir === "long")),
    SELL: summarize(rows.filter((r) => r.dir === "short")),
  });
  const markets: Record<string, unknown> = {};
  for (const m of MARKETS) {
    const rows = all.filter((r) => r.symbol === m.symbol);
    markets[m.symbol] = { IS: pack(rows.filter((r) => r.split === "IS")), OOS: pack(rows.filter((r) => r.split === "OOS")) };
  }
  console.log(JSON.stringify({
    engine: ENGINE_VERSION,
    frozen: true,
    fitting: "NONE",
    contract: "identical to v7.4/v7.5; TREND releases only; no new signals",
    classifications: {
      THESIS_WRONG: "MFE < 0.25R within production 16-bar path (SL-first)",
      THESIS_RIGHT_GEOMETRY_MISSED: "MFE >= 0.5R and outcome is not TP1",
      MIXED: "TP1, or 0.25R <= MFE < 0.5R",
    },
    markets,
  }));
}
