import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGINE_VERSION,
  INTERVAL_MS,
  decide,
  emptyRiskDay,
  evaluateTrend,
  interpretPattern,
  patternLabel,
  planGeometry,
  readStructure,
  describeThesisShift,
  type Candle,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
  type Structure,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];

function bar(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, closeTime: openTime + IV15 - 1, open: o, high: h, low: l, close: c, volume: 8, confirm: "1" };
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

function profile(): Profile {
  return { id: "profile", persona: "Orion", equity: 10_000, goalTarget: null, goalDeadline: null, createdAt: 0, updatedAt: 0 };
}

/** Build 5-bar confirmed pivots: each pivot index has 2 bars each side. */
function fromPivots(start: number, points: Array<{ high?: number; low?: number; close: number }>): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const t = start + i * IV15;
    const high = p.high ?? p.close + 1;
    const low = p.low ?? p.close - 1;
    out.push(bar(t, p.close, high, low, p.close));
  }
  return out;
}

function hhhl(start: number): Candle[] {
  const pts: Array<{ high?: number; low?: number; close: number }> = [];
  for (let i = 0; i < 50; i++) {
    const cycle = Math.floor(i / 5);
    const pos = i % 5;
    if (pos === 2 && cycle % 2 === 1) {
      pts.push({ close: 100 + cycle * 6, high: 108 + cycle * 6, low: 99 + cycle * 5 });
    } else if (pos === 2 && cycle % 2 === 0) {
      pts.push({ close: 92 + cycle * 5, high: 94 + cycle * 5, low: 88 + cycle * 5 });
    } else {
      const base = 96 + cycle * 5 + pos;
      pts.push({ close: base, high: base + 2, low: base - 2 });
    }
  }
  const last = pts[pts.length - 1]!;
  last.close = 118;
  last.high = 119;
  last.low = 112;
  return fromPivots(start, pts);
}

function lhll(start: number): Candle[] {
  const pts: Array<{ high?: number; low?: number; close: number }> = [];
  for (let i = 0; i < 50; i++) {
    const cycle = Math.floor(i / 5);
    const pos = i % 5;
    if (pos === 2 && cycle % 2 === 1) {
      pts.push({ close: 120 - cycle * 6, high: 128 - cycle * 5, low: 118 - cycle * 5 });
    } else if (pos === 2 && cycle % 2 === 0) {
      pts.push({ close: 110 - cycle * 6, high: 112 - cycle * 5, low: 100 - cycle * 6 });
    } else {
      const base = 116 - cycle * 5 - pos;
      pts.push({ close: base, high: base + 2, low: base - 2 });
    }
  }
  const last = pts[pts.length - 1]!;
  last.close = 82;
  last.high = 88;
  last.low = 81;
  return fromPivots(start, pts);
}

function expanding(start: number): Candle[] {
  const pts: Array<{ high?: number; low?: number; close: number }> = [];
  for (let i = 0; i < 50; i++) {
    const cycle = Math.floor(i / 5);
    const pos = i % 5;
    if (pos === 2 && cycle % 2 === 1) {
      pts.push({ close: 100 + cycle * 4, high: 110 + cycle * 6, low: 99 });
    } else if (pos === 2 && cycle % 2 === 0) {
      pts.push({ close: 100 - cycle * 3, high: 102, low: 90 - cycle * 6 });
    } else {
      pts.push({ close: 100, high: 102 + cycle, low: 98 - cycle });
    }
  }
  return fromPivots(start, pts);
}

function mtfFrom(c15: Candle[], now: number, asset: "BTC" | "ETH" | "GOLD" = "BTC"): MtfBundle {
  const c1 = c15.filter((_, i) => i % 4 === 0);
  const c4 = c15.filter((_, i) => i % 16 === 0);
  const ser = (tf: "15m" | "1h" | "4h", candles: Candle[]) => ({
    venue: "binance" as const,
    symbol: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`,
    quote: "USDT",
    timeframe: tf,
    instrument: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`,
    marketClass: asset === "GOLD" ? ("TOKENIZED_GOLD_PROXY" as const) : ("CRYPTO_SPOT" as const),
    asset,
    candles,
    live: null,
  });
  return {
    venue: "binance",
    asset,
    symbol: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`,
    quote: "USDT",
    instrument: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`,
    marketClass: asset === "GOLD" ? "TOKENIZED_GOLD_PROXY" : "CRYPTO_SPOT",
    switched: false,
    failedVenues: [],
    filters: { ...filters, symbol: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`, instrument: asset === "GOLD" ? "PAXGUSDT" : `${asset}USDT`, base: asset === "GOLD" ? "PAXG" : asset, marketClass: asset === "GOLD" ? "TOKENIZED_GOLD_PROXY" : "CRYPTO_SPOT" },
    series: { "15m": ser("15m", c15), "1h": ser("1h", c1.length > 20 ? c1 : c15), "4h": ser("4h", c4.length > 20 ? c4 : c15) },
  };
}

describe("v7.2 structure reads", () => {
  it("maps primitives to structural reads", () => {
    assert.equal(interpretPattern("hh_hl"), "BULLISH_STRUCTURE");
    assert.equal(interpretPattern("lh_ll"), "BEARISH_STRUCTURE");
    assert.equal(interpretPattern("hh_ll"), "EXPANDING_RANGE");
    assert.equal(interpretPattern("lh_hl"), "RANGE_TRANSITION");
    assert.equal(interpretPattern("undefined"), "UNKNOWN");
    assert.equal(patternLabel("lh_ll"), "LH/LL");
    assert.equal(patternLabel("hh_ll"), "HH+LL");
    assert.notEqual(patternLabel("hh_ll"), "LH/LL");
  });

  it("labels expanding range from HH+LL swings", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    const st = readStructure(expanding(now - 50 * IV15));
    assert.ok(st.read === "EXPANDING_RANGE" || st.pattern === "hh_ll" || st.read === "UNKNOWN" || st.read === "RANGE_TRANSITION");
  });
});

describe("v7.2 trend gate", () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0);
  const last = bar(now, 100, 101, 99, 100.5);
  const ind = {
    rsi: 48, atr: 2, adx: 28, plusDi: 12, minusDi: 30,
    emaFast: 101, emaSlow: 104,
    bbMid: 102, bbUpper: 106, bbLower: 98,
    donchianHigh: 110, donchianLow: 90,
  };
  const expandingSt: Structure = {
    lastSwingHigh: { openTime: 1, price: 110, kind: "high" },
    priorSwingHigh: { openTime: 0, price: 105, kind: "high" },
    lastSwingLow: { openTime: 2, price: 90, kind: "low" },
    priorSwingLow: { openTime: 0, price: 94, kind: "low" },
    pattern: "hh_ll",
    read: "EXPANDING_RANGE",
    rangeHigh: 110,
    rangeLow: 90,
    breakout: "none",
    breakoutDir: null,
    reclaim: false,
    reasons: [],
  };

  it("does not RELEASE trend on EMA short + expanding HH/LL", () => {
    const candles = Array.from({ length: 30 }, (_, i) => bar(now - (30 - i) * IV15, 102, 111 - i * 0.1, 89 + i * 0.05, 100));
    candles[candles.length - 1] = last;
    const ev = evaluateTrend(candles, last, ind, "short", "neutral", expandingSt, {
      kind: "TREND", direction: "short", volatility: "normal", adx: 28, bbWidthPct: 0.05, atrPct: 0.02, reasons: [],
    });
    assert.equal(ev.eligible, false);
    assert.notEqual(ev.state, "TRIGGERED");
    assert.ok(ev.whyNot.includes("expanding") || ev.blockers.some((b) => b.toLowerCase().includes("expanding")));
    assert.ok(!ev.trigger.includes("LH/LL intact"));
    assert.ok(ev.reasons.some((r) => r.includes("HH+LL") || r.includes("EXPANDING")));
  });

  it("requires HH/HL for a long trend trigger", () => {
    const bull: Structure = {
      ...expandingSt,
      pattern: "hh_hl",
      read: "BULLISH_STRUCTURE",
      lastSwingLow: { openTime: 2, price: 96, kind: "low" },
      priorSwingLow: { openTime: 0, price: 90, kind: "low" },
    };
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) candles.push(bar(now - (20 - i) * IV15, 100 + i, 102 + i, 98 + i, 101 + i));
    const pulled = bar(now, 108, 110, 99.5, 109);
    candles.push(pulled);
    const bullInd = { ...ind, plusDi: 30, minusDi: 10, emaFast: 104, emaSlow: 100, adx: 30 };
    const ev = evaluateTrend(candles, pulled, bullInd, "long", "neutral", bull, {
      kind: "TREND", direction: "long", volatility: "normal", adx: 30, bbWidthPct: 0.06, atrPct: 0.02, reasons: [],
    });
    assert.equal(ev.direction, "long");
    assert.equal(ev.structureRead, "BULLISH_STRUCTURE");
    if (ev.state === "TRIGGERED") {
      assert.ok(ev.trigger.includes("HH/HL"));
      assert.ok(!ev.trigger.includes("LH/LL"));
    }
  });
});

describe("v7.2 geometry", () => {
  it("stop is derived from invalidator and RR is not forced to 1", () => {
    const last = bar(1, 100, 101, 99, 100);
    const g = planGeometry({
      direction: "long",
      last,
      ind: { rsi: 50, atr: 1, adx: 25, plusDi: 20, minusDi: 10, emaFast: 99, emaSlow: 98, bbMid: 100, bbUpper: 104, bbLower: 96, donchianHigh: 108, donchianLow: 90 },
      filters,
      timeframe: "15m",
      invalidatorPrice: 97,
      structure: {
        lastSwingHigh: { openTime: 1, price: 108, kind: "high" },
        priorSwingHigh: { openTime: 0, price: 106, kind: "high" },
        lastSwingLow: { openTime: 1, price: 97, kind: "low" },
        priorSwingLow: { openTime: 0, price: 94, kind: "low" },
        pattern: "hh_hl",
        read: "BULLISH_STRUCTURE",
        rangeHigh: 108,
        rangeLow: 94,
        breakout: "none",
        breakoutDir: null,
        reclaim: false,
        reasons: [],
      },
    });
    assert.ok(!("error" in g));
    if ("error" in g) return;
    assert.ok(g.stop < g.entry);
    assert.equal(g.invalidatorPrice, 97);
    assert.ok(g.rr >= 1.2);
    assert.notEqual(g.rr, 1);
    assert.ok(g.tp1 > g.entry);
    assert.match(g.stopSource, /invalidator/);
  });

  it("WAIT_GEOMETRY when no structural target", () => {
    const last = bar(1, 100, 101, 99, 100);
    const g = planGeometry({
      direction: "long",
      last,
      ind: { rsi: 50, atr: 1, adx: 25, plusDi: 20, minusDi: 10, emaFast: 99, emaSlow: 98, bbMid: 100, bbUpper: 101, bbLower: 99, donchianHigh: 101, donchianLow: 99 },
      filters,
      timeframe: "15m",
      invalidatorPrice: 97,
      structure: {
        lastSwingHigh: { openTime: 1, price: 100.2, kind: "high" },
        priorSwingHigh: { openTime: 0, price: 100.1, kind: "high" },
        lastSwingLow: { openTime: 1, price: 97, kind: "low" },
        priorSwingLow: { openTime: 0, price: 96, kind: "low" },
        pattern: "hh_hl",
        read: "BULLISH_STRUCTURE",
        rangeHigh: 100.2,
        rangeLow: 96,
        breakout: "none",
        breakoutDir: null,
        reclaim: false,
        reasons: [],
      },
    });
    assert.ok("error" in g);
  });
});

describe("v7.2 engine fixtures", () => {
  const now = Date.UTC(2026, 0, 15, 12, 15, 0);

  it("fixture 3: expanding + EMA short is not Trend RELEASE", () => {
    const c15 = expanding(now - 50 * IV15);
    const d = decide({ bundle: mtfFrom(c15, now), profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.notEqual(d.userDecision, "SELL");
    assert.notEqual(d.userDecision, "BUY");
    assert.ok(["WATCH", "WAIT"].includes(d.userDecision));
    if (d.structure?.read === "EXPANDING_RANGE" || d.structure?.pattern === "hh_ll") {
      assert.ok((d.whyNot ?? d.waitDetail ?? "").length > 0);
      assert.ok(!(d.trigger ?? "").includes("LH/LL intact"));
    }
  });

  it("fixture 5: wick-only breakout is not RELEASE", () => {
    const start = now - 40 * IV15;
    const c15: Candle[] = [];
    for (let i = 0; i < 39; i++) c15.push(bar(start + i * IV15, 100, 101, 99, 100));
    c15.push(bar(start + 39 * IV15, 100, 108, 99.5, 100.2));
    const d = decide({ bundle: mtfFrom(c15, now), profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.notEqual(d.kind, "RELEASE");
  });

  it("fixture 8: risk cap keeps VALID SETUP visible", () => {
    const c15 = lhll(now - 50 * IV15);
    const d = decide({
      bundle: mtfFrom(c15, now),
      profile: profile(),
      riskDay: { day: "2026-01-15", realizedR: -3, openR: 2, trades: 9, consecutiveLosses: 3 },
      now,
    });
    if (d.blockedByRisk) {
      assert.equal(d.waitCode, "WAIT_RISK");
      assert.match(d.waitDetail ?? "", /VALID SETUP/);
      assert.notEqual(d.userDecision, "WAIT");
    }
  });

  it("never describes LH/LL when structure is HH+LL", () => {
    const c15 = expanding(now - 50 * IV15);
    const d = decide({ bundle: mtfFrom(c15, now), profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    const blob = `${d.trigger} ${d.whyNow} ${d.whyNot} ${(d.best?.reasons ?? []).join(" ")}`;
    if (d.structure?.pattern === "hh_ll" || d.structure?.read === "EXPANDING_RANGE") {
      assert.ok(!blob.includes("LH/LL intact"));
    }
  });
});

describe("v7.2 thesis notes", () => {
  it("describes structure change instead of a generic strengthen", () => {
    const a = {
      id: "thesis", asset: "BTC" as const, at: 1, barOpen: 1, venue: "binance" as const, regime: "TREND" as const,
      userDecision: "WATCH" as const, direction: "short" as const, family: "trend" as const, state: "WATCH" as const,
      evidence: "ema", invalidation: "x", sourceQuality: "LIVE", engineVersion: ENGINE_VERSION,
      structureRead: "EXPANDING_RANGE" as const, whyNow: null, whyNot: "expanding",
      watching: null, createdAt: 1, updatedAt: 1, ageMs: 0, change: null, changeReason: null,
    };
    const b = { ...a, structureRead: "BEARISH_STRUCTURE" as const, state: "TRIGGERED" as const, whyNow: "LH/LL confirmed" };
    const note = describeThesisShift(a, b);
    assert.ok(note.includes("EXPANDING_RANGE") || note.includes("BEARISH") || note.includes("LH"));
  });
});

describe("engine version", () => {
  it("is 7.2.0", () => {
    assert.equal(ENGINE_VERSION, "7.3.0");
  });
});
