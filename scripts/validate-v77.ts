/**
 * AWURU v7.7 — pre-specified TREND geometry.
 * Candidates declared in docs/validation-v7.7.md BEFORE results.
 * Engine 7.3.0 frozen. Same TREND release set. No fitting.
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
import { scanPath } from "./validate-v76.ts";
import type { Candle, Direction, InstrumentFilters, MtfBundle, Series } from "../src/awuru/domain/types.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];
const HORIZON = 16;
const IS_END = Date.UTC(2026, 7, 11);
const FETCH_START = Date.UTC(2026, 4, 1);
const MARKETS = [
  { asset: "BTC" as const, symbol: "BTCUSDT" },
  { asset: "ETH" as const, symbol: "ETHUSDT" },
  { asset: "GOLD" as const, symbol: "PAXGUSDT" },
];
const EXPECTED = { BTCUSDT: { IS: 106, OOS: 45 }, ETHUSDT: { IS: 171, OOS: 49 }, PAXGUSDT: { IS: 96, OOS: 33 } } as const;

/** PRE-SPECIFIED. Do not add values after seeing P&L. */
export const CANDIDATES = {
  stops: ["S1", "S2a", "S2b", "S2c", "S3", "S4"] as const,
  targets: ["T1", "T2a", "T2b", "T2c", "T3", "T4"] as const,
  atrCorridor: { S2a: 0.75, S2b: 1.0, S2c: 1.25 },
  atrBuffer: 0.25,
  fixedR: { T2a: 0.75, T2b: 1.0, T2c: 1.25 },
  atrTarget: 1.0,
  pairing: "stop variants keep T1; target variants keep S1",
};

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

function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function unconstrained(dir: Direction, entry: number, future: Candle[]) {
  let mae = 0, mfe = 0;
  for (const b of future) {
    mae = Math.max(mae, dir === "long" ? entry - b.low : b.high - entry);
    mfe = Math.max(mfe, dir === "long" ? b.high - entry : entry - b.low);
  }
  return { mae, mfe };
}

export function resolveStop(
  id: (typeof CANDIDATES.stops)[number],
  args: { dir: Direction; entry: number; origStop: number; invalidator: number; atr: number; swingLow: number | null; swingHigh: number | null },
): number | null {
  const { dir, entry, origStop, invalidator, atr, swingLow, swingHigh } = args;
  if (id === "S1") return origStop;
  if (id === "S2a" || id === "S2b" || id === "S2c") {
    const k = CANDIDATES.atrCorridor[id];
    return dir === "long" ? entry - k * atr : entry + k * atr;
  }
  if (id === "S3") {
    return dir === "long" ? invalidator - CANDIDATES.atrBuffer * atr : invalidator + CANDIDATES.atrBuffer * atr;
  }
  if (id === "S4") {
    const swing = dir === "long" ? swingLow : swingHigh;
    if (swing == null) return null;
    return dir === "long" ? swing - CANDIDATES.atrBuffer * atr : swing + CANDIDATES.atrBuffer * atr;
  }
  return null;
}

export function resolveTarget(
  id: (typeof CANDIDATES.targets)[number],
  args: { dir: Direction; entry: number; origTp1: number; stop: number; atr: number; oppSwing: number | null },
): { price: number; identicalT1: boolean } | null {
  const { dir, entry, origTp1, stop, atr, oppSwing } = args;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  if (id === "T1") return { price: origTp1, identicalT1: true };
  if (id === "T2a" || id === "T2b" || id === "T2c") {
    const r = CANDIDATES.fixedR[id];
    return { price: dir === "long" ? entry + r * risk : entry - r * risk, identicalT1: false };
  }
  if (id === "T3") {
    return { price: dir === "long" ? entry + CANDIDATES.atrTarget * atr : entry - CANDIDATES.atrTarget * atr, identicalT1: false };
  }
  if (id === "T4") {
    if (oppSwing == null) return null;
    return { price: oppSwing, identicalT1: Math.abs(oppSwing - origTp1) / entry < 1e-8 };
  }
  return null;
}

function validSide(dir: Direction, entry: number, stop: number, tp: number) {
  if (dir === "long") return stop < entry && tp > entry;
  return stop > entry && tp < entry;
}

type GeomRow = {
  id: string;
  skipped: boolean;
  skipReason: string | null;
  identicalT1: boolean;
  stopDistAtr: number | null;
  tpDistAtr: number | null;
  tpR: number | null;
  stopInsideMae: boolean | null;
  targetBeyondMfe: boolean | null;
  outcome: string | null;
  netR: number | null;
  mfeR: number | null;
  maeR: number | null;
  firstEvent: string | null;
  slBefore025: boolean | null;
  slBefore05: boolean | null;
  slAfter05: boolean | null;
  slAfter1: boolean | null;
  barsToSl: number | null;
  barsToTp: number | null;
};

function applyGeom(
  id: string,
  dir: Direction,
  entry: number,
  stop: number | null,
  tp: number | null,
  identicalT1: boolean,
  atr: number,
  future: Candle[],
  rawMae: number,
  rawMfe: number,
): GeomRow {
  if (stop == null || tp == null || !validSide(dir, entry, stop, tp)) {
    return {
      id, skipped: true, skipReason: "undefined_or_wrong_side", identicalT1, stopDistAtr: null, tpDistAtr: null, tpR: null,
      stopInsideMae: null, targetBeyondMfe: null, outcome: null, netR: null, mfeR: null, maeR: null, firstEvent: null,
      slBefore025: null, slBefore05: null, slAfter05: null, slAfter1: null, barsToSl: null, barsToTp: null,
    };
  }
  const risk = Math.abs(entry - stop);
  const p = scanPath(dir, entry, stop, tp, risk, future);
  return {
    id,
    skipped: false,
    skipReason: null,
    identicalT1,
    stopDistAtr: risk / atr,
    tpDistAtr: Math.abs(tp - entry) / atr,
    tpR: Math.abs(tp - entry) / risk,
    stopInsideMae: risk < rawMae,
    targetBeyondMfe: Math.abs(tp - entry) > rawMfe,
    outcome: p.outcome,
    netR: p.netR,
    mfeR: p.mfeR,
    maeR: p.maeR,
    firstEvent: p.firstEvent === "TP1" ? "TP" : p.firstEvent === "SL" ? "SL" : p.firstEvent === "EXPIRY" ? "EXPIRY" : "FAVORABLE",
    slBefore025: p.outcome === "sl" && p.mfeR < 0.25,
    slBefore05: p.outcome === "sl" && p.mfeR < 0.5,
    slAfter05: p.outcome === "sl" && p.mfeR >= 0.5,
    slAfter1: p.outcome === "sl" && p.mfeR >= 1,
    barsToSl: p.barsToSl,
    barsToTp: p.barsToTp,
  };
}

function summarize(rows: GeomRow[]) {
  const used = rows.filter((r) => !r.skipped && r.netR != null);
  const n = used.length;
  const skipped = rows.filter((r) => r.skipped).length;
  const rs = used.map((r) => r.netR!);
  const wins = rs.filter((x) => x > 0);
  const losses = rs.filter((x) => x < 0);
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let lose = 0, maxLose = 0;
  for (const x of rs) {
    if (x < 0) { lose++; maxLose = Math.max(maxLose, lose); } else lose = 0;
  }
  const sl = used.filter((r) => r.outcome === "sl");
  const tp = used.filter((r) => r.outcome === "tp1");
  const exp = used.filter((r) => r.outcome === "expired");
  return {
    n,
    skipped,
    avgR: mean(rs),
    medR: median(rs),
    totalR: rs.reduce((a, b) => a + b, 0),
    pf: gl > 0 ? gp / gl : wins.length ? Infinity : null,
    winRate: n ? wins.length / n : null,
    avgWinR: mean(wins),
    avgLossR: mean(losses),
    sl: sl.length,
    tp: tp.length,
    expired: exp.length,
    slPct: n ? sl.length / n : null,
    tpPct: n ? tp.length / n : null,
    expPct: n ? exp.length / n : null,
    maxLose,
    stopInsideMae: mean(used.map((r) => (r.stopInsideMae ? 1 : 0))),
    targetBeyondMfe: mean(used.map((r) => (r.targetBeyondMfe ? 1 : 0))),
    slBefore025: mean(used.map((r) => (r.slBefore025 ? 1 : 0))),
    slBefore05: mean(used.map((r) => (r.slBefore05 ? 1 : 0))),
    slAfter05: mean(used.map((r) => (r.slAfter05 ? 1 : 0))),
    slAfter1: mean(used.map((r) => (r.slAfter1 ? 1 : 0))),
    firstSL: used.filter((r) => r.firstEvent === "SL").length,
    firstTP: used.filter((r) => r.firstEvent === "TP").length,
    firstFav: used.filter((r) => r.firstEvent === "FAVORABLE").length,
    firstExp: used.filter((r) => r.firstEvent === "EXPIRY").length,
    medStopAtr: median(used.map((r) => r.stopDistAtr!).filter((x) => x != null)),
    medTpAtr: median(used.map((r) => r.tpDistAtr!).filter((x) => x != null)),
    medTpR: median(used.map((r) => r.tpR!).filter((x) => x != null)),
    medMfeR: median(used.map((r) => r.mfeR!).filter((x) => x != null)),
    medMaeR: median(used.map((r) => r.maeR!).filter((x) => x != null)),
    medBarsToTp: median(used.map((r) => r.barsToTp).filter((x): x is number => x != null)),
    medBarsToSl: median(used.map((r) => r.barsToSl).filter((x): x is number => x != null)),
    identicalT1Pct: mean(used.map((r) => (r.identicalT1 ? 1 : 0))),
  };
}

type Rel = {
  t: number;
  split: "IS" | "OOS";
  symbol: string;
  dir: Direction;
  geoms: Record<string, GeomRow>;
};

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
    const g = d.geometry;
    const dir = d.direction;
    const future = all15.slice(i + 1, i + 1 + HORIZON);
    const raw = unconstrained(dir, g.entry, future);
    const stopArgs = {
      dir,
      entry: g.entry,
      origStop: g.stop,
      invalidator: g.invalidatorPrice,
      atr: ind.atr,
      swingLow: st.lastSwingLow?.price ?? null,
      swingHigh: st.lastSwingHigh?.price ?? null,
    };
    const geoms: Record<string, GeomRow> = {};
    for (const sid of CANDIDATES.stops) {
      const stop = resolveStop(sid, stopArgs);
      const tgt = resolveTarget("T1", { dir, entry: g.entry, origTp1: g.tp1, stop: stop ?? g.stop, atr: ind.atr, oppSwing: dir === "long" ? st.lastSwingHigh?.price ?? null : st.lastSwingLow?.price ?? null });
      geoms[`${sid}+T1`] = applyGeom(`${sid}+T1`, dir, g.entry, stop, tgt?.price ?? null, true, ind.atr, future, raw.mae, raw.mfe);
    }
    const origStop = g.stop;
    for (const tid of CANDIDATES.targets) {
      if (tid === "T1") continue;
      const tgt = resolveTarget(tid, {
        dir,
        entry: g.entry,
        origTp1: g.tp1,
        stop: origStop,
        atr: ind.atr,
        oppSwing: dir === "long" ? st.lastSwingHigh?.price ?? null : st.lastSwingLow?.price ?? null,
      });
      geoms[`S1+${tid}`] = applyGeom(`S1+${tid}`, dir, g.entry, origStop, tgt?.price ?? null, tgt?.identicalT1 ?? false, ind.atr, future, raw.mae, raw.mfe);
    }
    out.push({ t: now, split: now < IS_END ? "IS" : "OOS", symbol, dir, geoms });
  }
  return out;
}

if (process.argv[1]?.endsWith("validate-v77.ts")) {
  const endNow = Date.now();
  const all: Rel[] = [];
  const counts: Record<string, { IS: number; OOS: number; match: boolean }> = {};
  for (const m of MARKETS) {
    const rows = await collect(m.asset, m.symbol, endNow);
    all.push(...rows);
    const is = rows.filter((r) => r.split === "IS").length;
    const oos = rows.filter((r) => r.split === "OOS").length;
    const exp = EXPECTED[m.symbol as keyof typeof EXPECTED];
    const match = is === exp.IS && oos === exp.OOS;
    counts[m.symbol] = { IS: is, OOS: oos, match };
    console.error(JSON.stringify({ market: m.symbol, is, oos, match }));
  }
  if (Object.values(counts).some((c) => !c.match)) {
    console.log(JSON.stringify({ ok: false, reason: "TREND_SET_MISMATCH", counts }));
    process.exit(2);
  }
  const ids = [...new Set(all.flatMap((r) => Object.keys(r.geoms)))];
  const markets: Record<string, unknown> = {};
  for (const m of MARKETS) {
    const rows = all.filter((r) => r.symbol === m.symbol);
    const pack = (subset: Rel[]) => {
      const by: Record<string, unknown> = {};
      for (const id of ids) {
        const g = subset.map((r) => r.geoms[id]!).filter(Boolean);
        by[id] = {
          all: summarize(g),
          BUY: summarize(subset.filter((r) => r.dir === "long").map((r) => r.geoms[id]!)),
          SELL: summarize(subset.filter((r) => r.dir === "short").map((r) => r.geoms[id]!)),
        };
      }
      return by;
    };
    markets[m.symbol] = { IS: pack(rows.filter((r) => r.split === "IS")), OOS: pack(rows.filter((r) => r.split === "OOS")) };
  }
  console.log(JSON.stringify({
    ok: true,
    engine: ENGINE_VERSION,
    frozen: true,
    candidatesDeclaredBeforeResults: CANDIDATES,
    releaseCounts: counts,
    markets,
  }));
}
