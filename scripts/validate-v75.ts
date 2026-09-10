/**
 * AWURU v7.5 — TREND vs BREAKOUT isolation.
 * Engine 7.3.0 FROZEN. No fitting. No threshold changes.
 * Classification uses decide().family at decision time only.
 */
import { decide } from "../src/awuru/engine/engine.ts";
import { emptyRiskDay } from "../src/awuru/risk/risk.ts";
import { utcDayKey } from "../src/awuru/domain/time.ts";
import { INTERVAL_MS, ENGINE_VERSION } from "../src/awuru/domain/constants.ts";
import { parseBinanceFilters } from "../src/awuru/market/filters.ts";
import { snapshot } from "../src/awuru/engine/indicators.ts";
import { lastClosed } from "../src/awuru/market/candles.ts";
import type { Candle, InstrumentFilters, MtfBundle, Series } from "../src/awuru/domain/types.ts";

export type FamilyLabel = "TREND" | "BREAKOUT" | "OTHER";

export function classifyFamily(family: string | null | undefined): FamilyLabel {
  if (family === "trend") return "TREND";
  if (family === "breakout") return "BREAKOUT";
  return "OTHER";
}

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];
const FEE = 0.001;
const SLIP = 0.0002;
const HORIZON = 16;
const IS_END = Date.UTC(2026, 7, 11);
const FETCH_START = Date.UTC(2026, 4, 1);
const MARKETS = [
  { asset: "BTC" as const, symbol: "BTCUSDT" },
  { asset: "ETH" as const, symbol: "ETHUSDT" },
  { asset: "GOLD" as const, symbol: "PAXGUSDT" },
];

/** Frozen v7.4 headline numbers. Reproduction must match closely. */
export const V74_BASELINE = {
  BTCUSDT: {
    IS: { n: 8831, rel: 184, buy: 82, sell: 102, avgR: -2.074164526619746, pf: 0.051393392056453935, sl: 120, tp1: 53, exp: 11, maxLose: 23 },
    OOS: { n: 2892, rel: 62, buy: 30, sell: 32, avgR: -1.69077520432315, pf: 0.0628127914919658, sl: 43, tp1: 12, exp: 7, maxLose: 30 },
  },
  ETHUSDT: {
    IS: { n: 8831, rel: 232, buy: 107, sell: 125, avgR: -1.217931020700131, pf: 0.22944518255813853, sl: 133, tp1: 74, exp: 25, maxLose: 20 },
    OOS: { n: 2892, rel: 71, buy: 41, sell: 30, avgR: -1.7168769427472432, pf: 0.07251639034916908, sl: 52, tp1: 15, exp: 4, maxLose: 20 },
  },
  PAXGUSDT: {
    IS: { n: 8831, rel: 120, buy: 48, sell: 72, avgR: -1.727201651928101, pf: 0.10849761995979355, sl: 67, tp1: 42, exp: 11, maxLose: 26 },
    OOS: { n: 2892, rel: 43, buy: 18, sell: 25, avgR: -2.0278821319858227, pf: 0.043052432636804895, sl: 24, tp1: 11, exp: 8, maxLose: 12 },
  },
} as const;

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

export function pathDetail(
  direction: "long" | "short",
  entry: number,
  stop: number,
  tp1: number,
  risk: number,
  future: Candle[],
) {
  let mae = 0;
  let mfe = 0;
  let mfeBeforeSl = 0;
  let hit05 = false;
  let hit1 = false;
  let barsToSl: number | null = null;
  let barsToTp: number | null = null;
  let outcome: "sl" | "tp1" | "expired" = "expired";
  for (let i = 0; i < future.length; i++) {
    const b = future[i]!;
    const adv = direction === "long" ? entry - b.low : b.high - entry;
    const fav = direction === "long" ? b.high - entry : entry - b.low;
    mae = Math.max(mae, adv);
    const hitSl = direction === "long" ? b.low <= stop : b.high >= stop;
    const hitTp = direction === "long" ? b.high >= tp1 : b.low <= tp1;
    if (hitSl) {
      outcome = "sl";
      barsToSl = i + 1;
      break;
    }
    mfe = Math.max(mfe, fav);
    mfeBeforeSl = mfe;
    if (mfe >= 0.5 * risk) hit05 = true;
    if (mfe >= risk) hit1 = true;
    if (hitTp) {
      outcome = "tp1";
      barsToTp = i + 1;
      break;
    }
  }
  const costR = ((FEE * 2 + SLIP) * entry) / risk;
  const grossR = outcome === "tp1" ? Math.abs(tp1 - entry) / risk : outcome === "sl" ? -1 : 0;
  const netR = outcome === "expired" ? -costR : grossR - costR;
  return {
    outcome,
    grossR,
    netR,
    maeR: mae / risk,
    mfeR: mfe / risk,
    mfeBeforeSlR: mfeBeforeSl / risk,
    barsToSl,
    barsToTp,
    hit05,
    hit1,
  };
}

export type Rel = {
  t: number;
  asset: string;
  symbol: string;
  user: string;
  familyRaw: string | null;
  family: FamilyLabel;
  trigger: string | null;
  regime: string | null;
  structure: string | null;
  dir: string | null;
  wait: string | null;
  released: boolean;
  reason: string | null;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  rr: number | null;
  atr: number | null;
  stopPct: number | null;
  stopAtr: number | null;
  outcome: string | null;
  netR: number | null;
  maeR: number | null;
  mfeR: number | null;
  mfeBeforeSlR: number | null;
  barsToSl: number | null;
  barsToTp: number | null;
  hit05: boolean | null;
  hit1: boolean | null;
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function familyStats(rows: Rel[], fam?: FamilyLabel, extra?: (r: Rel) => boolean) {
  const pool = rows.filter((r) => (fam ? r.family === fam : true) && (extra ? extra(r) : true));
  const rel = pool.filter((r) => r.released);
  const rs = rel.map((r) => r.netR).filter((x): x is number => x != null);
  const wins = rs.filter((x) => x > 0);
  const losses = rs.filter((x) => x < 0);
  const sum = rs.reduce((a, b) => a + b, 0);
  const gp = wins.reduce((a, b) => a + b, 0);
  const gl = Math.abs(losses.reduce((a, b) => a + b, 0));
  let eq = 0, peak = 0, lose = 0, maxLose = 0;
  for (const x of rs) {
    eq += x;
    peak = Math.max(peak, eq);
    if (x < 0) {
      lose++;
      maxLose = Math.max(maxLose, lose);
    } else lose = 0;
  }
  const sl = rel.filter((r) => r.outcome === "sl");
  const tp = rel.filter((r) => r.outcome === "tp1");
  const exp = rel.filter((r) => r.outcome === "expired");
  const mae = rel.map((r) => r.maeR).filter((x): x is number => x != null);
  const mfe = rel.map((r) => r.mfeR).filter((x): x is number => x != null);
  const stopPct = rel.map((r) => r.stopPct).filter((x): x is number => x != null);
  const stopAtr = rel.map((r) => r.stopAtr).filter((x): x is number => x != null);
  const tsl = sl.map((r) => r.barsToSl).filter((x): x is number => x != null);
  const mfeSl = sl.map((r) => r.mfeBeforeSlR).filter((x): x is number => x != null);
  const maeTp = tp.map((r) => r.maeR).filter((x): x is number => x != null);
  return {
    observations: pool.length,
    releases: rel.length,
    releaseRate: pool.length ? rel.length / pool.length : 0,
    buy: rel.filter((r) => r.user === "BUY").length,
    sell: rel.filter((r) => r.user === "SELL").length,
    avgR: mean(rs),
    medR: median(rs),
    totalR: rs.length ? sum : 0,
    pf: gl > 0 ? gp / gl : wins.length ? Infinity : null,
    winRate: rs.length ? wins.length / rs.length : null,
    sl: sl.length,
    tp1: tp.length,
    expired: exp.length,
    slPct: rel.length ? sl.length / rel.length : null,
    tpPct: rel.length ? tp.length / rel.length : null,
    expPct: rel.length ? exp.length / rel.length : null,
    maxLoseStreak: maxLose,
    meanMaeR: mean(mae),
    medMaeR: median(mae),
    meanMfeR: mean(mfe),
    medMfeR: median(mfe),
    medStopPct: median(stopPct),
    medStopAtr: median(stopAtr),
    medBarsToSl: median(tsl),
    medMfeBeforeSlR: median(mfeSl),
    medMaeBeforeTpR: median(maeTp),
    fracHit05: rel.length ? rel.filter((r) => r.hit05).length / rel.length : null,
    fracHit1: rel.length ? rel.filter((r) => r.hit1).length / rel.length : null,
    nQuality: rel.length < 30 ? "tiny" : rel.length < 80 ? "limited" : rel.length < 200 ? "moderate" : "substantial",
  };
}

function headline(rows: Rel[]) {
  const s = familyStats(rows);
  return {
    n: rows.length,
    rel: s.releases,
    buy: s.buy,
    sell: s.sell,
    avgR: s.avgR,
    pf: s.pf,
    sl: s.sl,
    tp1: s.tp1,
    exp: s.expired,
    maxLose: s.maxLoseStreak,
  };
}

export function baselineDelta(
  got: ReturnType<typeof headline>,
  exp: { n: number; rel: number; buy: number; sell: number; avgR: number; pf: number; sl: number; tp1: number; exp: number; maxLose: number },
) {
  const nOk = got.n === exp.n && got.rel === exp.rel && got.buy === exp.buy && got.sell === exp.sell;
  const slOk = got.sl === exp.sl && got.tp1 === exp.tp1 && got.exp === exp.exp && got.maxLose === exp.maxLose;
  const avgOk = got.avgR != null && Math.abs(got.avgR - exp.avgR) < 0.02;
  const pfOk = got.pf != null && Math.abs(got.pf - exp.pf) < 0.02;
  return { match: nOk && slOk && avgOk && pfOk, nOk, slOk, avgOk, pfOk, got, exp };
}

async function runMarket(asset: "BTC" | "ETH" | "GOLD", symbol: string, endMs: number): Promise<Rel[]> {
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
  const rows: Rel[] = [];
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
    const last = lastClosed(s15);
    const ind = last ? snapshot(s15) : null;
    const atr = ind?.atr ?? null;
    const released = d.kind === "RELEASE";
    const fam = classifyFamily(d.family);
    let scored: ReturnType<typeof pathDetail> | null = null;
    if (released && d.geometry && d.direction) {
      const future = all15.slice(i + 1, i + 1 + HORIZON);
      scored = pathDetail(d.direction, d.geometry.entry, d.geometry.stop, d.geometry.tp1, d.geometry.riskPerUnit, future);
    }
    const g = d.geometry;
    const risk = g?.riskPerUnit ?? null;
    rows.push({
      t: now,
      asset,
      symbol,
      user: d.userDecision,
      familyRaw: d.family,
      family: fam,
      trigger: d.best?.triggerType ?? d.trigger,
      regime: d.regime?.kind ?? null,
      structure: d.structure?.read ?? null,
      dir: d.direction,
      wait: d.waitCode,
      released,
      reason: d.whyNow || d.waitDetail,
      entry: g?.entry ?? null,
      stop: g?.stop ?? null,
      tp1: g?.tp1 ?? null,
      rr: g?.rr ?? null,
      atr,
      stopPct: g && risk ? risk / g.entry : null,
      stopAtr: g && risk && atr ? risk / atr : null,
      outcome: scored?.outcome ?? null,
      netR: scored?.netR ?? null,
      maeR: scored?.maeR ?? null,
      mfeR: scored?.mfeR ?? null,
      mfeBeforeSlR: scored?.mfeBeforeSlR ?? null,
      barsToSl: scored?.barsToSl ?? null,
      barsToTp: scored?.barsToTp ?? null,
      hit05: scored?.hit05 ?? null,
      hit1: scored?.hit1 ?? null,
    });
  }
  return rows;
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate-v75.ts")) {
  const endNow = Date.now();
  const all: Rel[] = [];
  const repro: Record<string, unknown> = {};
  let reproOk = true;
  for (const m of MARKETS) {
    const rows = await runMarket(m.asset, m.symbol, endNow);
    all.push(...rows);
    const is = rows.filter((r) => r.t < IS_END);
    const oos = rows.filter((r) => r.t >= IS_END);
    const base = V74_BASELINE[m.symbol as keyof typeof V74_BASELINE];
    const dIs = baselineDelta(headline(is), base.IS);
    const dOos = baselineDelta(headline(oos), base.OOS);
    if (!dIs.match || !dOos.match) reproOk = false;
    repro[m.symbol] = { IS: dIs, OOS: dOos };
    console.error(JSON.stringify({ market: m.symbol, is: is.length, oos: oos.length, isMatch: dIs.match, oosMatch: dOos.match }));
  }
  if (!reproOk) {
    console.log(JSON.stringify({ ok: false, reason: "BASELINE_REPRODUCTION_FAILED", engine: ENGINE_VERSION, repro }, null, 2));
    process.exit(2);
  }

  function pack(rows: Rel[]) {
    const fams: FamilyLabel[] = ["TREND", "BREAKOUT", "OTHER"];
    const byFam = Object.fromEntries(fams.map((f) => [f, familyStats(rows, f)]));
    const counts = fams.map((f) => {
      const n = rows.filter((r) => r.released && r.family === f).length;
      const tot = rows.filter((r) => r.released).length;
      return { family: f, releases: n, pct: tot ? n / tot : 0 };
    });
    const dir: Record<string, ReturnType<typeof familyStats>> = {};
    for (const f of fams) {
      dir[`${f}_BUY`] = familyStats(rows, f, (r) => r.user === "BUY");
      dir[`${f}_SELL`] = familyStats(rows, f, (r) => r.user === "SELL");
    }
    const regimes = [...new Set(rows.map((r) => r.regime ?? "none"))];
    const famXreg: Record<string, ReturnType<typeof familyStats>> = {};
    for (const f of fams) for (const rg of regimes) {
      famXreg[`${f}x${rg}`] = familyStats(rows, f, (r) => (r.regime ?? "none") === rg);
    }
    const trigs = [...new Set(rows.filter((r) => r.released).map((r) => r.trigger ?? "none"))];
    const famXtrig: Record<string, ReturnType<typeof familyStats>> = {};
    for (const f of fams) for (const tg of trigs) {
      famXtrig[`${f}x${tg}`] = familyStats(rows, f, (r) => (r.trigger ?? "none") === tg);
    }
    const expanding = rows.filter((r) => r.released && r.structure === "EXPANDING_RANGE").map((r) => ({
      t: iso(r.t),
      market: r.symbol,
      family: r.family,
      trigger: r.trigger,
      regime: r.regime,
      dir: r.dir,
      entry: r.entry,
      stop: r.stop,
      tp1: r.tp1,
      rr: r.rr,
      outcome: r.outcome,
      netR: r.netR,
      reason: r.reason,
    }));
    const segs: Record<string, Record<string, ReturnType<typeof familyStats>>> = {};
    if (rows.length) {
      const tmin = Math.min(...rows.map((r) => r.t));
      const tmax = Math.max(...rows.map((r) => r.t));
      const span = tmax - tmin || 1;
      const names = ["IS-A", "IS-B", "IS-C", "IS-D"];
      for (let k = 0; k < 4; k++) {
        const a = tmin + (span * k) / 4;
        const b = tmin + (span * (k + 1)) / 4;
        const chunk = rows.filter((r) => r.t >= a && (k === 3 ? r.t <= b : r.t < b));
        segs[names[k]!] = {
          TREND: familyStats(chunk, "TREND"),
          BREAKOUT: familyStats(chunk, "BREAKOUT"),
        };
      }
    }
    return { overall: familyStats(rows), byFam, counts, dir, famXreg, famXtrig, expanding, segs };
  }

  const outMarkets: Record<string, unknown> = {};
  for (const m of MARKETS) {
    const rows = all.filter((r) => r.symbol === m.symbol);
    const is = rows.filter((r) => r.t < IS_END);
    const oos = rows.filter((r) => r.t >= IS_END);
    outMarkets[m.symbol] = { IS: pack(is), OOS: pack(oos) };
  }

  const relTs = all.filter((r) => r.released);
  const byT = new Map<number, string[]>();
  for (const r of relTs) {
    const arr = byT.get(r.t) ?? [];
    arr.push(r.symbol);
    byT.set(r.t, arr);
  }
  const multi = [...byT.entries()].filter(([, v]) => v.length >= 2);
  const btcEth = multi.filter(([, v]) => v.includes("BTCUSDT") && v.includes("ETHUSDT")).length;

  const report = {
    ok: true,
    engine: ENGINE_VERSION,
    frozen: true,
    fitting: "NONE",
    contract: {
      venue: "Binance Vision public klines",
      symbols: ["BTCUSDT", "ETHUSDT", "PAXGUSDT"],
      tfs: ["15m", "1h", "4h"],
      tz: "UTC",
      closedBar: "openTime + interval <= now",
      horizonBars: 16,
      sameBar: "SL first",
      feeBpsSide: 10,
      slipBps: 2,
      evaluation: "independent bars",
      is: "2026-05-11 → 2026-08-11",
      oos: "2026-08-11 → 2026-09-10",
      gold: "PAXG proxy, not XAUUSD",
    },
    baselineReproduction: repro,
    markets: outMarkets,
    correlation: {
      timestampsWith2plusMarkets: multi.length,
      btcEthSameBar: btcEth,
      note: "BTC/ETH contemporaneous releases are not independent trials",
    },
  };
  console.log(JSON.stringify(report));
}
