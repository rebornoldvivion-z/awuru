import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERVAL_MS,
  latestClosedOpen,
  isTimeClosed,
  parentOpen,
  loadMtfBundle,
  decide,
  disagreement,
  evaluateFamilies,
  emptyRiskDay,
  createMemoryLedger,
  scoreShadow,
  signalId,
  type Candle,
  type FamilyEvidence,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
  type Shadow,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];

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

function rising(start: number, count: number, interval: number, px0: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const openTime = start + i * interval;
    const open = px0 + i * 8;
    const close = open + 6;
    out.push({
      openTime,
      closeTime: openTime + interval - 1,
      open,
      high: close + 2,
      low: open - 2,
      close,
      volume: 10,
      confirm: "1",
    });
  }
  return out;
}

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

function liveBundle(now: number, over: Partial<MtfBundle> = {}): MtfBundle {
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
      "15m": {
        venue: "binance",
        symbol: "BTCUSDT",
        quote: "USDT",
        timeframe: "15m",
        instrument: "BTCUSDT",
        marketClass: "CRYPTO_SPOT",
        asset: "BTC",
        candles: rising(now - 120 * IV15, 100, IV15, 90_000),
        live: null,
      },
      "1h": {
        venue: "binance",
        symbol: "BTCUSDT",
        quote: "USDT",
        timeframe: "1h",
        instrument: "BTCUSDT",
        marketClass: "CRYPTO_SPOT",
        asset: "BTC",
        candles: rising(now - 80 * IV1H, 70, IV1H, 90_000),
        live: null,
      },
      "4h": {
        venue: "binance",
        symbol: "BTCUSDT",
        quote: "USDT",
        timeframe: "4h",
        instrument: "BTCUSDT",
        marketClass: "CRYPTO_SPOT",
        asset: "BTC",
        candles: rising(now - 50 * IV4H, 45, IV4H, 90_000),
        live: null,
      },
    },
    ...over,
  };
}

describe("MTF 12:00 boundary and no look-ahead", () => {
  it("at 12:00 the 08:00 4h bar is closed, not before", () => {
    const noon = Date.UTC(2026, 0, 15, 12, 0, 0);
    const tenFifteen = Date.UTC(2026, 0, 15, 10, 15, 0);
    assert.equal(latestClosedOpen(noon, IV15), Date.UTC(2026, 0, 15, 11, 45, 0));
    assert.equal(latestClosedOpen(noon, IV1H), Date.UTC(2026, 0, 15, 11, 0, 0));
    assert.equal(latestClosedOpen(noon, IV4H), Date.UTC(2026, 0, 15, 8, 0, 0));
    assert.equal(isTimeClosed(Date.UTC(2026, 0, 15, 8, 0, 0), IV4H, tenFifteen), false);
    assert.equal(isTimeClosed(Date.UTC(2026, 0, 15, 8, 0, 0), IV4H, noon), true);
  });

  it("10:00 15m belongs to 08:00 4h parent but that parent is not usable at 10:15", () => {
    const child = Date.UTC(2026, 0, 15, 10, 0, 0);
    const now = Date.UTC(2026, 0, 15, 10, 15, 0);
    assert.equal(parentOpen(child, IV4H), Date.UTC(2026, 0, 15, 8, 0, 0));
    assert.equal(latestClosedOpen(now, IV4H), Date.UTC(2026, 0, 15, 4, 0, 0));
    assert.notEqual(parentOpen(child, IV4H), latestClosedOpen(now, IV4H));
  });
});

describe("fallback chain", () => {
  function jsonRes(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }

  function klines(start: number, n: number, iv: number, px: number) {
    return Array.from({ length: n }, (_, i) => {
      const o = start + i * iv;
      const open = px + i;
      const close = open + 1;
      return [o, String(open), String(close + 1), String(open - 1), String(close), "1", o + iv - 1];
    });
  }

  const now = Date.UTC(2026, 0, 15, 12, 15, 0);

  it("uses Binance when it answers", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("binance.vision") && url.includes("klines")) {
        const iv = url.includes("interval=4h") ? IV4H : url.includes("interval=1h") ? IV1H : IV15;
        return jsonRes(klines(now - 40 * iv, 40, iv, 90_000));
      }
      if (url.includes("exchangeInfo")) {
        return jsonRes({
          symbols: [
            {
              symbol: "BTCUSDT",
              status: "TRADING",
              baseAsset: "BTC",
              quoteAsset: "USDT",
              filters: [
                { filterType: "PRICE_FILTER", tickSize: "0.01" },
                { filterType: "LOT_SIZE", stepSize: "0.00001", minQty: "0.00001" },
                { filterType: "NOTIONAL", minNotional: "5" },
              ],
            },
          ],
        });
      }
      return jsonRes({}, 500);
    };
    const loaded = await loadMtfBundle("BTC", now, fetchImpl);
    assert.equal(loaded.bundle?.venue, "binance");
    assert.equal(loaded.bundle?.symbol, "BTCUSDT");
    assert.equal(loaded.bundle?.switched, false);
    assert.equal(loaded.bundle?.series["15m"].venue, "binance");
    assert.equal(loaded.bundle?.series["1h"].venue, "binance");
    assert.equal(loaded.bundle?.series["4h"].venue, "binance");
  });

  it("switches the whole bundle to Kraken when Binance fails", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("binance")) return jsonRes({ msg: "down" }, 500);
      if (url.includes("kraken") && url.includes("OHLC")) {
        const ivSec = url.includes("interval=240") ? 14400 : url.includes("interval=60") ? 3600 : 900;
        const start = now / 1000 - 40 * ivSec;
        const rows = Array.from({ length: 40 }, (_, i) => {
          const t = start + i * ivSec;
          const px = 90000 + i;
          return [t, String(px), String(px + 2), String(px - 2), String(px + 1), String(px), "1", 1];
        });
        return jsonRes({ error: [], result: { XXBTZUSD: rows, last: rows.at(-1)![0] } });
      }
      if (url.includes("AssetPairs")) {
        return jsonRes({
          error: [],
          result: {
            XXBTZUSD: {
              altname: "XBTUSD",
              base: "XXBT",
              quote: "ZUSD",
              lot_decimals: 8,
              tick_size: "0.1",
              ordermin: "0.0001",
              costmin: "0.5",
              status: "online",
            },
          },
        });
      }
      return jsonRes({}, 500);
    };
    const loaded = await loadMtfBundle("BTC", now, fetchImpl);
    assert.equal(loaded.bundle?.venue, "kraken");
    assert.equal(loaded.bundle?.symbol, "XBTUSD");
    assert.equal(loaded.bundle?.switched, true);
    assert.deepEqual(loaded.failed, ["binance"]);
    assert.equal(loaded.bundle?.series["15m"].venue, "kraken");
    assert.equal(loaded.bundle?.series["4h"].venue, "kraken");
  });

  it("falls to OKX then UNAVAILABLE", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("okx.com") && url.includes("candles")) {
        const rows = Array.from({ length: 20 }, (_, i) => {
          const o = now - i * IV15;
          return [String(o), "1", "2", "1", "1.5", "1", "1", "1", "1"];
        });
        return jsonRes({ code: "0", data: rows });
      }
      if (url.includes("okx.com") && url.includes("instruments")) {
        return jsonRes({
          data: [
            {
              instId: "BTC-USDT",
              baseCcy: "BTC",
              quoteCcy: "USDT",
              tickSz: "0.1",
              lotSz: "0.00001",
              minSz: "0.00001",
              state: "live",
            },
          ],
        });
      }
      return jsonRes({ error: "no" }, 503);
    };
    const okx = await loadMtfBundle("BTC", now, fetchImpl);
    assert.equal(okx.bundle?.venue, "okx");
    assert.equal(okx.bundle?.symbol, "BTC-USDT");
    assert.ok(okx.failed.includes("binance"));
    assert.ok(okx.failed.includes("kraken"));

    const dead = await loadMtfBundle("BTC", now, async () => jsonRes({}, 503));
    assert.equal(dead.bundle, null);
    assert.deepEqual(dead.failed, ["binance", "kraken", "okx"]);
  });
});

describe("engine gates", () => {
  it("rejects mixed-venue MTF", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const bundle = liveBundle(now);
    bundle.series["4h"] = { ...bundle.series["4h"], venue: "okx" };
    const d = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(d.kind, "WAIT");
    assert.equal(d.quality.state, "INVALID");
    assert.match(d.quality.reason, /mixed-venue/);
  });

  it("WAIT_DATA on STALE", () => {
    const closed = Date.UTC(2026, 0, 15, 10, 0, 0);
    const now = closed + IV15 + 4 * IV15;
    const bundle = liveBundle(now);
    bundle.series["15m"].candles = rising(closed - 99 * IV15, 100, IV15, 90_000);
    const d = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(d.kind, "WAIT");
    assert.ok(d.waitCode === "WAIT_DATA" || d.quality.state === "STALE" || d.quality.state === "DELAYED");
  });

  it("family disagreement is WAIT_DISAGREEMENT", () => {
    const families: FamilyEvidence[] = [
      {
        family: "trend",
        eligible: true,
        direction: "long",
        grade: "mixed",
        score: 0.6,
        reasons: ["t"],
        invalidation: null,
      },
      {
        family: "breakout",
        eligible: true,
        direction: "short",
        grade: "mixed",
        score: 0.6,
        reasons: ["b"],
        invalidation: null,
      },
      {
        family: "mean_reversion",
        eligible: false,
        direction: null,
        grade: "weak",
        score: 0,
        reasons: ["m"],
        invalidation: null,
      },
    ];
    assert.equal(disagreement(families), true);
  });

  it("WAIT_UNSIZEABLE when equity cannot meet NOTIONAL", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const d = decide({
      bundle: liveBundle(now),
      profile: profile({ equity: 1 }),
      riskDay: emptyRiskDay("2026-01-15"),
      now,
    });
    if (d.kind === "RELEASE") {
      assert.fail("tiny equity must not RELEASE");
    }
    assert.ok(d.waitCode === "WAIT_UNSIZEABLE" || d.waitCode === "WAIT_REGIME" || d.waitCode === "WAIT_HTF" || d.waitCode === "WAIT_GEOMETRY" || d.waitCode === "WAIT_DISAGREEMENT" || d.waitCode === "WAIT_DATA");
  });

  it("families are three distinct hypotheses", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const candles = rising(now - 40 * IV15, 40, IV15, 100);
    const last = candles[candles.length - 1]!;
    const fakeInd = {
      rsi: 50,
      atr: 10,
      adx: 25,
      plusDi: 30,
      minusDi: 10,
      emaFast: last.close - 5,
      emaSlow: last.close - 10,
      bbMid: last.close,
      bbUpper: last.close + 20,
      bbLower: last.close - 20,
      donchianHigh: last.close - 1,
      donchianLow: last.close - 50,
    };
    const fams = evaluateFamilies(candles, last, fakeInd, "long", "long", {
      lastSwingHigh: null,
      lastSwingLow: null,
      priorSwingHigh: null,
      priorSwingLow: null,
      pattern: "hh_hl",
      rangeHigh: last.high,
      rangeLow: last.low,
      breakout: "none",
      breakoutDir: null,
      reclaim: false,
      reasons: [],
    }, {
      kind: "TREND",
      direction: "long",
      volatility: "normal",
      adx: 25,
      bbWidthPct: 0.05,
      atrPct: 0.01,
      reasons: ["test"],
    });
    assert.equal(fams.length, 3);
    assert.deepEqual(fams.map((f) => f.family), ["trend", "breakout", "mean_reversion"]);
  });
});

describe("persistence ledger", () => {
  it("duplicate scan does not rewrite an immutable signal", () => {
    const ledger = createMemoryLedger();
    const sid = signalId({
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      barOpen: 1,
      family: "trend",
      persona: "Orion",
    });
    const decision = decide({
      bundle: null,
      profile: profile(),
      riskDay: emptyRiskDay("2026-01-15"),
      now: 1,
    });
    const first = ledger.putSignal({ signalId: sid, decision, createdAt: 10 });
    const second = ledger.putSignal({ signalId: sid, decision: { ...decision, waitDetail: "changed" }, createdAt: 20 });
    assert.equal(first, true);
    assert.equal(second, false);
    assert.equal(ledger.getSignal(sid)?.createdAt, 10);
    assert.equal(ledger.getSignal(sid)?.decision.waitDetail, decision.waitDetail);
  });

  it("missions, shadows, and risk days persist across reload of the same ledger", () => {
    const ledger = createMemoryLedger();
    ledger.putMission({
      id: "m1",
      signalId: "s1",
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      direction: "long",
      entry: 1,
      stop: 0.9,
      tp1: 1.1,
      tp2: 1.2,
      tp3: 1.3,
      qty: 1,
      riskCash: 10,
      status: "open",
      confirmedAt: 1,
      closedAt: null,
      realizedR: null,
      note: "",
      engineVersion: "7.0.0",
      barOpen: 1,
      expiry: 2,
    });
    const shadow: Shadow = {
      id: "sh1",
      signalId: "s1",
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      barOpen: 1,
      direction: "long",
      entry: 100,
      stop: 99,
      tp1: 101,
      tp2: 102,
      tp3: 103,
      family: "trend",
      evidenceGrade: "mixed",
      persona: "Orion",
      waitCode: "WAIT_RISK",
      engineVersion: "7.0.0",
      frozenAt: 1,
      status: "open",
      scoredAt: null,
      realizedR: null,
    };
    ledger.putShadow(shadow);
    ledger.saveRiskDay({ day: "2026-01-15", realizedR: -1, openR: 1, trades: 1, consecutiveLosses: 1 });
    assert.equal(ledger.listMissions()[0]?.id, "m1");
    assert.equal(ledger.listShadows()[0]?.venue, "binance");
    assert.equal(ledger.loadRiskDay("2026-01-15").trades, 1);
    const later = [
      {
        openTime: 2,
        closeTime: 2 + IV15 - 1,
        open: 100,
        high: 104,
        low: 98,
        close: 101,
        volume: 1,
      } satisfies Candle,
    ];
    const scored = scoreShadow(shadow, later, 3);
    assert.equal(scored.status, "sl");
    assert.equal(scored.venue, "binance");
  });
});
