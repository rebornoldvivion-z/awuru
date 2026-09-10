import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INTERVAL_MS,
  isAligned,
  isEngineValidCandle,
  isTimeClosed,
  latestClosedOpen,
  parentOpen,
  parseBinanceKlines,
  parseKrakenOhlc,
  parseOkxCandles,
  splitLive,
  parseBinanceFilters,
  parseKrakenFilters,
  parseOkxFilters,
  floorToStep,
  roundToTick,
  sizePosition,
  decide,
  signalId,
  scoreShadow,
  wilderRsi,
  checkRisk,
  emptyRiskDay,
  PERSONA_POLICY,
  type Candle,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
  type Shadow,
} from "./index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];

function bar(open: number, o: number, h: number, l: number, c: number, confirm?: "0" | "1"): Candle {
  return { openTime: open, closeTime: open + IV15 - 1, open: o, high: h, low: l, close: c, volume: 1, confirm };
}

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

describe("MTF parent mapping", () => {
  it("maps 15m → 1h → 4h with floor division", () => {
    const t15 = Date.UTC(2026, 0, 15, 10, 15, 0);
    assert.equal(parentOpen(t15, IV1H), Date.UTC(2026, 0, 15, 10, 0, 0));
    assert.equal(parentOpen(t15, IV4H), Date.UTC(2026, 0, 15, 8, 0, 0));
    const t1745 = Date.UTC(2026, 8, 9, 17, 45, 0);
    assert.equal(parentOpen(t1745, IV1H), Date.UTC(2026, 8, 9, 17, 0, 0));
    assert.equal(parentOpen(t1745, IV4H), Date.UTC(2026, 8, 9, 16, 0, 0));
  });

  it("10:15 uses closed 10:00 15m, 09:00 1h, 04:00 4h", () => {
    const now = Date.UTC(2026, 0, 15, 10, 15, 0);
    assert.equal(latestClosedOpen(now, IV15), Date.UTC(2026, 0, 15, 10, 0, 0));
    assert.equal(latestClosedOpen(now, IV1H), Date.UTC(2026, 0, 15, 9, 0, 0));
    assert.equal(latestClosedOpen(now, IV4H), Date.UTC(2026, 0, 15, 4, 0, 0));
    const ten = Date.UTC(2026, 0, 15, 10, 0, 0);
    assert.equal(isTimeClosed(ten, IV1H, now), false);
    assert.equal(isTimeClosed(Date.UTC(2026, 0, 15, 8, 0, 0), IV4H, now), false);
    assert.equal(isTimeClosed(Date.UTC(2026, 0, 15, 4, 0, 0), IV4H, now), true);
  });

  it("requires UTC alignment", () => {
    assert.equal(isAligned(Date.UTC(2026, 0, 15, 10, 0, 0), IV15), true);
    assert.equal(isAligned(Date.UTC(2026, 0, 15, 10, 0, 0) + 1, IV15), false);
  });
});

describe("closed vs forming", () => {
  it("Binance scheduled closeTime is not proof of close", () => {
    const now = Date.UTC(2026, 0, 15, 18, 12, 0);
    const liveOpen = Date.UTC(2026, 0, 15, 18, 0, 0);
    const live: Candle = {
      openTime: liveOpen,
      closeTime: liveOpen + IV15 - 1,
      open: 1,
      high: 2,
      low: 1,
      close: 1.5,
      volume: 1,
    };
    assert.equal(isEngineValidCandle(live, IV15, now, "binance"), false);
    const closedOpen = Date.UTC(2026, 0, 15, 17, 45, 0);
    const closed: Candle = {
      openTime: closedOpen,
      closeTime: closedOpen + IV15 - 1,
      open: 1,
      high: 2,
      low: 1,
      close: 1.5,
      volume: 1,
    };
    assert.equal(isEngineValidCandle(closed, IV15, now, "binance"), true);
  });

  it("Kraken last row is dropped when still open", () => {
    const now = Date.UTC(2026, 0, 15, 18, 12, 0);
    const rows = [
      bar(Date.UTC(2026, 0, 15, 17, 45, 0), 1, 2, 1, 1.5),
      bar(Date.UTC(2026, 0, 15, 18, 0, 0), 1.5, 2, 1, 1.6),
    ];
    const split = splitLive(rows, IV15, now, "kraken");
    assert.equal(split.closed.length, 1);
    assert.equal(split.closed[0]!.openTime, Date.UTC(2026, 0, 15, 17, 45, 0));
    assert.ok(split.live);
    assert.equal(split.live.openTime, Date.UTC(2026, 0, 15, 18, 0, 0));
  });

  it("OKX newest-first + confirm=0 is excluded", () => {
    const now = Date.UTC(2026, 0, 15, 18, 12, 0);
    const raw = {
      code: "0",
      data: [
        [
          String(Date.UTC(2026, 0, 15, 18, 0, 0)),
          "1",
          "2",
          "1",
          "1.5",
          "1",
          "1",
          "1",
          "0",
        ],
        [
          String(Date.UTC(2026, 0, 15, 17, 45, 0)),
          "1",
          "2",
          "1",
          "1.4",
          "1",
          "1",
          "1",
          "1",
        ],
      ],
    };
    const parsed = parseOkxCandles(raw, "15m");
    const split = splitLive(parsed, IV15, now, "okx");
    assert.equal(split.closed.length, 1);
    assert.equal(split.closed[0]!.confirm, "1");
    assert.equal(split.live?.confirm, "0");
  });

  it("invalid OHLC is rejected", () => {
    const now = Date.UTC(2026, 0, 15, 18, 20, 0);
    const bad = bar(Date.UTC(2026, 0, 15, 18, 0, 0), 10, 9, 11, 10);
    assert.equal(isEngineValidCandle(bad, IV15, now, "binance"), false);
  });
});

describe("venue parsers", () => {
  it("parses Binance klines", () => {
    const open = Date.UTC(2026, 0, 15, 17, 0, 0);
    const raw = [[open, "100", "110", "90", "105", "1", open + IV1H - 1, "1", 1, "1", "1", "0"]];
    const c = parseBinanceKlines(raw, "1h");
    assert.equal(c[0]!.open, 100);
    assert.equal(c[0]!.close, 105);
  });

  it("parses Kraken seconds timestamps", () => {
    const sec = Date.UTC(2026, 0, 15, 17, 0, 0) / 1000;
    const raw = { error: [], result: { XXBTZUSD: [[sec, "100", "110", "90", "105", "100", "1", 1]], last: sec } };
    const c = parseKrakenOhlc(raw, "1h");
    assert.equal(c[0]!.openTime, Date.UTC(2026, 0, 15, 17, 0, 0));
  });
});

describe("filters and sizing", () => {
  it("reads Binance NOTIONAL not MIN_NOTIONAL", () => {
    const info = {
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
    };
    const f = parseBinanceFilters(info, "BTCUSDT");
    assert.ok(!("error" in f));
    if ("error" in f) return;
    assert.equal(f.minNotional, 5);
    assert.equal(f.tickSize, 0.01);
  });

  it("parses Kraken and OKX metadata", () => {
    const kr = parseKrakenFilters(
      {
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
      },
      "XBTUSD",
    );
    assert.ok(!("error" in kr));
    const ok = parseOkxFilters(
      {
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
      },
      "BTC-USDT",
    );
    assert.ok(!("error" in ok));
  });

  it("floors quantity and never rounds up to min", () => {
    assert.equal(floorToStep(1.239, 0.01), 1.23);
    assert.equal(roundToTick(100.014, 0.01), 100.01);
    const tiny = sizePosition({
      equity: 10,
      riskPct: 0.01,
      entry: 100_000,
      stop: 97_000,
      filters,
    });
    assert.equal(tiny.ok, false);
    if (!tiny.ok) assert.equal(tiny.reason, "WAIT_UNSIZEABLE");
  });

  it("accepts a valid size", () => {
    const s = sizePosition({
      equity: 10_000,
      riskPct: 0.005,
      entry: 100_000,
      stop: 99_000,
      filters,
    });
    assert.equal(s.ok, true);
    if (s.ok) {
      assert.ok(s.qty >= filters.minQty);
      assert.ok(s.notional >= (filters.minNotional ?? 0));
    }
  });
});

describe("risk ledger", () => {
  it("blocks when daily cap is hit", () => {
    const r = checkRisk({
      persona: "Aegis",
      day: { ...emptyRiskDay("2026-01-15"), realizedR: -1, trades: 2 },
      evidence: "strong",
      requiredR: 1,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "WAIT_RISK");
  });

  it("Aegis rejects weak evidence", () => {
    const r = checkRisk({
      persona: "Aegis",
      day: emptyRiskDay("2026-01-15"),
      evidence: "weak",
      requiredR: 1,
    });
    assert.equal(r.ok, false);
  });
});

describe("engine contract", () => {
  it("WAIT_DATA when quality is not LIVE", () => {
    const now = Date.UTC(2026, 0, 15, 10, 15, 0);
    const start15 = now - 200 * IV15;
    const candles15 = rising(start15, 90, IV15, 100);
    candles15.pop();
    const bundle: MtfBundle = {
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
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: candles15.slice(0, 10),
          live: null,
        },
        "1h": {
          venue: "binance",
          symbol: "BTCUSDT",
          quote: "USDT",
          timeframe: "1h",
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: rising(now - 80 * IV1H, 70, IV1H, 100),
          live: null,
        },
        "4h": {
          venue: "binance",
          symbol: "BTCUSDT",
          quote: "USDT",
          timeframe: "4h",
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: rising(now - 50 * IV4H, 45, IV4H, 100),
          live: null,
        },
      },
    };
    const d = decide({
      bundle,
      profile: profile(),
      riskDay: emptyRiskDay("2026-01-15"),
      now,
    });
    assert.equal(d.kind, "WAIT");
    assert.equal(d.waitCode, "WAIT_DATA");
  });

  it("does not use a forming 15m bar as the signal bar", () => {
    const now = Date.UTC(2026, 0, 15, 10, 12, 0);
    const lastClosed = Date.UTC(2026, 0, 15, 10, 0, 0);
    assert.equal(isTimeClosed(lastClosed, IV15, now), false);
  });

  it("is reproducible", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const c15 = rising(now - 120 * IV15, 100, IV15, 90_000);
    const c1h = rising(now - 80 * IV1H, 70, IV1H, 90_000);
    const c4h = rising(now - 50 * IV4H, 45, IV4H, 90_000);
    const bundle: MtfBundle = {
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
        "15m": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "15m", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: c15, live: null },
        "1h": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "1h", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: c1h, live: null },
        "4h": { venue: "binance", symbol: "BTCUSDT", quote: "USDT", timeframe: "4h", instrument: "BTCUSDT", marketClass: "CRYPTO_SPOT", asset: "BTC", candles: c4h, live: null },
      },
    };
    const a = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    const b = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.deepEqual(a.kind, b.kind);
    assert.deepEqual(a.waitCode, b.waitCode);
    assert.deepEqual(a.direction, b.direction);
    assert.deepEqual(a.family, b.family);
    assert.deepEqual(a.geometry, b.geometry);
    assert.deepEqual(a.signalId, b.signalId);
  });

  it("UNAVAILABLE when bundle is null", () => {
    const d = decide({
      bundle: null,
      profile: profile(),
      riskDay: emptyRiskDay("2026-01-15"),
      now: Date.UTC(2026, 0, 15, 12, 0, 0),
    });
    assert.equal(d.quality.state, "UNAVAILABLE");
    assert.equal(d.kind, "WAIT");
  });

  it("SOURCE_SWITCH wait when fallback history is short", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const bundle: MtfBundle = {
      venue: "kraken",
      asset: "BTC",
      symbol: "XBTUSD",
      quote: "USD",
      instrument: "XBTUSD",
      marketClass: "CRYPTO_SPOT",
      switched: true,
      failedVenues: ["binance"],
      filters: { ...filters, venue: "kraken", symbol: "XBTUSD", quote: "USD", instrument: "XBTUSD" },
      series: {
        "15m": {
          venue: "kraken",
          symbol: "XBTUSD",
          quote: "USD",
          timeframe: "15m",
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: rising(now - 20 * IV15, 20, IV15, 90_000),
          live: null,
        },
        "1h": {
          venue: "kraken",
          symbol: "XBTUSD",
          quote: "USD",
          timeframe: "1h",
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: rising(now - 20 * IV1H, 20, IV1H, 90_000),
          live: null,
        },
        "4h": {
          venue: "kraken",
          symbol: "XBTUSD",
          quote: "USD",
          timeframe: "4h",
          instrument: "XBTUSD",
          marketClass: "CRYPTO_SPOT",
          asset: "BTC",
          candles: rising(now - 20 * IV4H, 20, IV4H, 90_000),
          live: null,
        },
      },
    };
    const d = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(d.waitCode, "WAIT_SOURCE_TRANSITION");
    assert.equal(d.venue, "kraken");
  });
});

describe("shadow SL-first", () => {
  it("scores SL when both SL and TP print in one bar", () => {
    const shadow: Shadow = {
      id: "s1",
      signalId: "x",
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      barOpen: Date.UTC(2026, 0, 15, 10, 0, 0),
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
      frozenAt: Date.UTC(2026, 0, 15, 10, 15, 0),
      status: "open",
      scoredAt: null,
      realizedR: null,
    };
    const later: Candle[] = [
      {
        openTime: Date.UTC(2026, 0, 15, 10, 15, 0),
        closeTime: Date.UTC(2026, 0, 15, 10, 15, 0) + IV15 - 1,
        open: 100,
        high: 104,
        low: 98.5,
        close: 101,
        volume: 1,
      },
    ];
    const scored = scoreShadow(shadow, later, Date.UTC(2026, 0, 15, 10, 30, 0));
    assert.equal(scored.status, "sl");
    assert.equal(scored.realizedR, -1);
  });
});

describe("idempotent signal ids", () => {
  it("same inputs produce the same id", () => {
    const a = signalId({
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      barOpen: 1,
      family: "trend",
      persona: "Orion",
    });
    const b = signalId({
      accountId: "primary",
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      barOpen: 1,
      family: "trend",
      persona: "Orion",
    });
    assert.equal(a, b);
    assert.ok(a.includes("7.3.0"));
  });
});

describe("RSI sanity", () => {
  it("rises on a monotonic series", () => {
    const closes = [];
    for (let i = 0; i < 40; i++) closes.push(100 + i);
    const rsi = wilderRsi(closes);
    const last = rsi[rsi.length - 1]!;
    assert.ok(last > 70);
  });
});

void PERSONA_POLICY;
