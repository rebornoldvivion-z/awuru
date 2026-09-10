import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyRegime,
  readStructure,
  measureCorroboration,
  buildCandidates,
  pickSlots,
  compareThesis,
  htfStance,
  decide,
  emptyRiskDay,
  INTERVAL_MS,
  type Candle,
  type Candidate,
  type Corroboration,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
  type SourceSnap,
  type Thesis,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];

function bar(open: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime: open, closeTime: open + IV15 - 1, open: o, high: h, low: l, close: c, volume: 1, confirm: "1" };
}

function rising(start: number, count: number, interval: number, px0: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const openTime = start + i * interval;
    const open = px0 + i * 8;
    const close = open + 6;
    out.push(bar(openTime, open, close + 2, open - 2, close));
  }
  return out;
}

const filters: InstrumentFilters = {
  venue: "binance",
  symbol: "BTCUSDT",
  base: "BTC",
  quote: "USDT",
  tickSize: 0.01,
  qtyStep: 0.00001,
  minQty: 0.00001,
  minNotional: 5,
  status: "TRADING",
  tradable: true,
  instrument: "BTCUSDT",
  marketClass: "CRYPTO_SPOT",
};

function profile(over: Partial<Profile> = {}): Profile {
  return {
    id: "profile",
    persona: "Orion",
    equity: 10_000,
    goalTarget: null,
    goalDeadline: null,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

function liveBundle(now: number): MtfBundle {
  const last15 = now - IV15;
  const last1h = Math.floor(now / IV1H) * IV1H - IV1H;
  const last4h = Math.floor(now / IV4H) * IV4H - IV4H;
  return {
    venue: "binance",
    asset: "BTC",
    symbol: "BTCUSDT",
    quote: "USDT",
    instrument: "BTCUSDT",
    marketClass: "CRYPTO_SPOT",
    switched: false,
    failedVenues: [],
    filters,
    series: {
      "15m": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "15m", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: rising(last15 - 99 * IV15, 100, IV15, 90_000), live: null },
      "1h": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "1h", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: rising(last1h - 69 * IV1H, 70, IV1H, 90_000), live: null },
      "4h": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "4h", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: rising(last4h - 44 * IV4H, 45, IV4H, 90_000), live: null },
    },
  };
}

describe("regime", () => {
  it("classifies compression vs trend vs expansion", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const trendBars = rising(now - 80 * IV15, 80, IV15, 100);
    const last = trendBars[trendBars.length - 1]!;
    const st = readStructure(trendBars);
    const trend = classifyRegime(last, {
      rsi: 60, atr: 3, adx: 32, plusDi: 28, minusDi: 12,
      emaFast: last.close - 1, emaSlow: last.close - 4,
      bbMid: last.close, bbUpper: last.close + 4, bbLower: last.close - 4,
      donchianHigh: last.close + 2, donchianLow: last.close - 10,
    }, trendBars, st);
    assert.equal(trend.kind, "TREND");

    const flat: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      const o = now - (40 - i) * IV15;
      flat.push(bar(o, 100, 100.2, 99.8, 100.05));
    }
    const lastF = flat[flat.length - 1]!;
    const stF = readStructure(flat);
    const squeeze = classifyRegime(lastF, {
      rsi: 50, atr: 0.1, adx: 12, plusDi: 14, minusDi: 14,
      emaFast: 100, emaSlow: 100,
      bbMid: 100, bbUpper: 100.4, bbLower: 99.6,
      donchianHigh: 100.3, donchianLow: 99.7,
    }, flat, stF);
    assert.equal(squeeze.kind, "COMPRESSION");
  });
});

describe("structure", () => {
  it("does not label the last two bars as confirmed swings", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const candles = rising(now - 30 * IV15, 30, IV15, 50);
    const last = candles[candles.length - 1]!;
    const st = readStructure(candles);
    if (st.lastSwingHigh) {
      assert.ok(st.lastSwingHigh.openTime < last.openTime);
    }
  });
});

describe("HTF stance", () => {
  it("maps supportive / neutral / opposing without look-ahead semantics", () => {
    assert.equal(htfStance("long", "long"), "SUPPORTIVE");
    assert.equal(htfStance("neutral", "long"), "NEUTRAL");
    assert.equal(htfStance("short", "long"), "OPPOSING");
  });
});

describe("corroboration", () => {
  const base: SourceSnap = { venue: "binance", ok: true, lastClosedOpen: 1, lastClose: 100, ms: 1 };
  it("agrees when spread is tight", () => {
    const c = measureCorroboration([
      base,
      { ...base, venue: "kraken", lastClose: 100.05 },
      { ...base, venue: "okx", lastClose: 99.97 },
    ], "binance");
    assert.equal(c.status, "SOURCE_AGREEMENT");
  });
  it("diverges when spread is wide", () => {
    const c = measureCorroboration([
      base,
      { ...base, venue: "kraken", lastClose: 102 },
    ], "binance");
    assert.equal(c.status, "SOURCE_DIVERGENCE");
  });
  it("primary-only when one venue", () => {
    const c = measureCorroboration([base, { venue: "kraken", ok: false, lastClosedOpen: null, lastClose: null, ms: 1 }], "binance");
    assert.equal(c.status, "PRIMARY_ONLY");
  });
  it("insufficient on timestamp mismatch", () => {
    const c = measureCorroboration([
      base,
      { ...base, venue: "kraken", lastClosedOpen: 1 + INTERVAL_MS["15m"] * 2 },
    ], "binance");
    assert.equal(c.status, "INSUFFICIENT");
  });
});

describe("candidates + ranking", () => {
  it("ranks deterministically and keeps a WATCH", () => {
    const evals = [
      {
        family: "trend" as const, eligible: true, direction: "long" as const, grade: "mixed" as const, score: 0.6,
        reasons: ["t"], invalidation: "x", state: "TRIGGERED" as const, trigger: "ema", blockers: [],
        whyNow: "t", whyNot: "", invalidatorPrice: 90, structureRead: "BULLISH_STRUCTURE" as const,
        setupKey: "1", zone: { origin: "HL", low: 90, high: 91, type: "SWING_SUPPORT" }, retraceNote: "in zone", triggerType: "reclaim_close" as const, qualityGrade: "good" as const,
      },
      {
        family: "breakout" as const, eligible: true, direction: "long" as const, grade: "weak" as const, score: 0.3,
        reasons: ["b"], invalidation: "y", state: "WATCH" as const, trigger: "close", blockers: ["wick"],
        whyNow: "", whyNot: "wick", invalidatorPrice: 91, structureRead: "BULLISH_STRUCTURE" as const,
        setupKey: "2", zone: null, retraceNote: null, triggerType: "none" as const, qualityGrade: "weak" as const,
      },
      {
        family: "mean_reversion" as const, eligible: false, direction: "short" as const, grade: "weak" as const, score: 0.2,
        reasons: ["m"], invalidation: "z", state: "FORMING" as const, trigger: "band", blockers: ["trend"],
        whyNow: "", whyNot: "trend", invalidatorPrice: 100, structureRead: "RANGE_TRANSITION" as const,
        setupKey: null, zone: null, retraceNote: null, triggerType: "none" as const, qualityGrade: "weak" as const,
      },
    ];
    const regime = { kind: "TREND" as const, direction: "long" as const, volatility: "normal" as const, adx: 28, bbWidthPct: 0.05, atrPct: 0.01, reasons: [] };
    const a = buildCandidates(evals, "long", "long", regime, () => null);
    const b = buildCandidates(evals, "long", "long", regime, () => null);
    assert.deepEqual(a.map((c) => c.family), b.map((c) => c.family));
    assert.equal(a[0]!.rank, 1);
    const slots = pickSlots(a);
    assert.ok(slots.best);
  });
});

describe("thesis compare", () => {
  const t = (over: Partial<Thesis>): Thesis => ({
    id: "thesis", asset: "BTC", at: 1, barOpen: 1, venue: "binance", regime: "TREND",
    userDecision: "WATCH", direction: "long", family: "breakout", state: "WATCH",
    evidence: "e", invalidation: "x", sourceQuality: "LIVE", engineVersion: "7.2.0",
    structureRead: "BULLISH_STRUCTURE", whyNow: "e", whyNot: null,
    watching: null, createdAt: 1, updatedAt: 1, ageMs: 0, change: null, changeReason: null,
    ...over,
  });
  it("detects strengthen / reverse / new", () => {
    assert.equal(compareThesis(null, t({})), "NEW_SETUP");
    assert.equal(compareThesis(t({}), t({ state: "TRIGGERED" })), "STRENGTHENED");
    assert.equal(compareThesis(t({}), t({ direction: "short", userDecision: "SELL" })), "REVERSED");
  });
});

describe("engine intelligence", () => {
  it("is reproducible including regime and ranking", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const bundle = liveBundle(now);
    const a = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    const b = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(a.userDecision, b.userDecision);
    assert.equal(a.regime?.kind, b.regime?.kind);
    assert.deepEqual(a.candidates.map((c: Candidate) => c.family), b.candidates.map((c: Candidate) => c.family));
    assert.ok(["BUY", "SELL", "WATCH", "WAIT"].includes(a.userDecision));
  });

  it("source divergence blocks RELEASE", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const corroboration: Corroboration = {
      status: "SOURCE_DIVERGENCE",
      primary: "binance",
      snaps: [],
      spreadPct: 0.02,
      timestampDeltaMs: 0,
      reason: "spread too wide",
    };
    const d = decide({ bundle: liveBundle(now), profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now, corroboration });
    assert.equal(d.kind, "WAIT");
    assert.equal(d.waitCode, "WAIT_DIVERGENCE");
  });

  it("risk cap keeps the setup visible as blocked", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const d = decide({
      bundle: liveBundle(now),
      profile: profile({ persona: "Aegis" }),
      riskDay: { day: "2026-01-15", realizedR: -1, openR: 0, trades: 2, consecutiveLosses: 1 },
      now,
    });
    assert.equal(d.kind, "WAIT");
    if (d.blockedByRisk) {
      assert.equal(d.waitCode, "WAIT_RISK");
      assert.match(d.waitDetail ?? "", /BLOCKED BY RISK/);
    }
  });
});
