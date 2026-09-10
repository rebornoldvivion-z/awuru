import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENGINE_VERSION,
  INTERVAL_MS,
  continuationZone,
  evaluateTrend,
  measureRetrace,
  pathOutcome,
  planGeometry,
  setupIdentity,
  summarizeWalk,
  type Candle,
  type InstrumentFilters,
  type Profile,
  type Structure,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];

function bar(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, closeTime: openTime + IV15 - 1, open: o, high: h, low: l, close: c, volume: 5, confirm: "1" };
}

const filters: InstrumentFilters = {
  venue: "binance", symbol: "BTCUSDT", base: "BTC", quote: "USDT",
  tickSize: 0.01, qtyStep: 0.00001, minQty: 0.00001, minNotional: 5,
  status: "TRADING", tradable: true, instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT",
};

function profile(): Profile {
  return { id: "profile", persona: "Orion", equity: 10_000, goalTarget: null, goalDeadline: null, createdAt: 0, updatedAt: 0 };
}

const bearSt: Structure = {
  lastSwingHigh: { openTime: 10, price: 100, kind: "high" },
  priorSwingHigh: { openTime: 1, price: 108, kind: "high" },
  lastSwingLow: { openTime: 8, price: 90, kind: "low" },
  priorSwingLow: { openTime: 2, price: 94, kind: "low" },
  pattern: "lh_ll",
  read: "BEARISH_STRUCTURE",
  rangeHigh: 108,
  rangeLow: 88,
  breakout: "none",
  breakoutDir: null,
  reclaim: false,
  reasons: [],
};

const expandSt: Structure = { ...bearSt, pattern: "hh_ll", read: "EXPANDING_RANGE", lastSwingHigh: { openTime: 10, price: 110, kind: "high" }, priorSwingHigh: { openTime: 1, price: 100, kind: "high" } };

describe("v7.3 zones + retrace", () => {
  it("builds a resistance zone from last LH", () => {
    const z = continuationZone(bearSt, "short", "15m");
    assert.ok(z);
    assert.equal(z!.type, "SWING_RESISTANCE");
    assert.ok(z!.low < 100 && z!.high > 100);
  });

  it("does not trigger until rejection close below zone", () => {
    const now = 1000;
    const z = continuationZone(bearSt, "short", "15m")!;
    const candles = Array.from({ length: 12 }, (_, i) => bar(now + i * IV15, 95, 96, 94, 95));
    const approach = bar(now + 12 * IV15, 99, 100.02, 98, 99.6);
    candles.push(approach);
    const r1 = measureRetrace({
      candles, last: approach, structure: bearSt, direction: "short", zone: z,
      ind: { rsi: 40, atr: 1.5, adx: 28, plusDi: 10, minusDi: 28, emaFast: 101, emaSlow: 104, bbMid: 100, bbUpper: 105, bbLower: 95, donchianHigh: 108, donchianLow: 88 },
    });
    assert.notEqual(r1.phase, "TRIGGERED");
    const reject = bar(now + 13 * IV15, 99.8, 100.01, 98.5, 98.8);
    candles.push(reject);
    const r2 = measureRetrace({
      candles, last: reject, structure: bearSt, direction: "short", zone: z,
      ind: { rsi: 38, atr: 1.5, adx: 28, plusDi: 10, minusDi: 28, emaFast: 101, emaSlow: 104, bbMid: 100, bbUpper: 105, bbLower: 95, donchianHigh: 108, donchianLow: 88 },
    });
    assert.equal(r2.triggerType, "rejection_close");
    assert.equal(r2.phase, "TRIGGERED");
    assert.ok(r2.triggerEvidence.includes("rejected"));
  });
});

describe("v7.3 false-release / false-negative", () => {
  const now = Date.UTC(2026, 2, 1, 12, 0, 0);
  const indShort = {
    rsi: 42, atr: 1.4, adx: 30, plusDi: 11, minusDi: 29,
    emaFast: 101, emaSlow: 104, bbMid: 100, bbUpper: 106, bbLower: 94,
    donchianHigh: 110, donchianLow: 88,
  };

  it("EMA short + expanding HH/LL still cannot TRIGGER trend", () => {
    const last = bar(now, 99, 101, 97, 98);
    const candles = Array.from({ length: 20 }, (_, i) => bar(now - (20 - i) * IV15, 100, 111, 89, 99));
    candles.push(last);
    const ev = evaluateTrend(candles, last, indShort, "short", "neutral", expandSt, {
      kind: "TREND", direction: "short", volatility: "normal", adx: 30, bbWidthPct: 0.05, atrPct: 0.02, reasons: [],
    });
    assert.notEqual(ev.state, "TRIGGERED");
    assert.equal(ev.eligible, false);
  });

  it("LH/LL + retrace into resistance + rejection can TRIGGER", () => {
    const z = continuationZone(bearSt, "short", "15m")!;
    const candles = Array.from({ length: 16 }, (_, i) => bar(now + i * IV15, 94, 95, 93, 94));
    const reject = bar(now + 16 * IV15, 99.7, 100.02, 98.4, 98.7);
    candles.push(reject);
    const ev = evaluateTrend(candles, reject, indShort, "short", "neutral", bearSt, {
      kind: "TREND", direction: "short", volatility: "normal", adx: 30, bbWidthPct: 0.05, atrPct: 0.02, reasons: [],
    });
    assert.equal(ev.structureRead, "BEARISH_STRUCTURE");
    assert.equal(ev.triggerType, "rejection_close");
    assert.equal(ev.state, "TRIGGERED");
    assert.ok(ev.zone && ev.zone.low <= z.high);
  });
});

describe("v7.3 geometry targets", () => {
  it("can emit a single structural target", () => {
    const last = bar(1, 100, 101, 99, 100);
    const g = planGeometry({
      direction: "long", last, filters, timeframe: "15m", invalidatorPrice: 97,
      ind: { rsi: 50, atr: 1, adx: 25, plusDi: 20, minusDi: 10, emaFast: 99, emaSlow: 98, bbMid: 100, bbUpper: 104, bbLower: 96, donchianHigh: 108, donchianLow: 90 },
      structure: {
        lastSwingHigh: { openTime: 1, price: 108, kind: "high" },
        priorSwingHigh: { openTime: 0, price: 108, kind: "high" },
        lastSwingLow: { openTime: 1, price: 97, kind: "low" },
        priorSwingLow: { openTime: 0, price: 94, kind: "low" },
        pattern: "hh_hl", read: "BULLISH_STRUCTURE", rangeHigh: 108, rangeLow: 94,
        breakout: "none", breakoutDir: null, reclaim: false, reasons: [],
      },
    });
    assert.ok(!("error" in g));
    if ("error" in g) return;
    assert.equal(g.targetCount, 1);
    assert.equal(g.tp2, null);
    assert.ok(g.rr >= 1.2);
  });
});

describe("v7.3 setup identity + walk", () => {
  it("identity is stable for the same zone", () => {
    const a = setupIdentity({ asset: "BTC", venue: "binance", family: "trend", direction: "short", zoneCreatedAt: 10, engineVersion: ENGINE_VERSION });
    const b = setupIdentity({ asset: "BTC", venue: "binance", family: "trend", direction: "short", zoneCreatedAt: 10, engineVersion: ENGINE_VERSION });
    const c = setupIdentity({ asset: "BTC", venue: "binance", family: "trend", direction: "short", zoneCreatedAt: 11, engineVersion: ENGINE_VERSION });
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it("same-bar SL wins over TP", () => {
    assert.equal(pathOutcome("short", 100, 102, 96, [{ high: 103, low: 95, close: 97 }]), "sl");
  });

  it("walk summary counts WATCH vs RELEASE without claiming edge", () => {
    const s = summarizeWalk([
      { now: 1, user: "WATCH", wait: "WAIT_TRIGGER", state: "WATCH", family: "trend", structure: "lh_ll", released: false },
      { now: 2, user: "SELL", wait: null, state: "RELEASED", family: "trend", structure: "lh_ll", released: true },
      { now: 3, user: "WAIT", wait: "WAIT_REGIME", state: "FORMING", family: null, structure: "hh_ll", released: false },
    ]);
    assert.equal(s.n, 3);
    assert.equal(s.sell, 1);
    assert.ok(s.releaseRate < 1);
  });
});

describe("v7.3 engine version", () => {
  it("is 7.3.0", () => {
    assert.equal(ENGINE_VERSION, "7.3.0");
  });
});
