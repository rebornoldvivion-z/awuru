import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ASSETS,
  GOLD_INSTRUMENTS,
  POST_V7_MARKETS,
  VENUE_SYMBOLS,
  INTERVAL_MS,
  marketCaption,
  seriesIdentity,
  parseBinanceKlines,
  parseKrakenOhlc,
  parseOkxCandles,
  splitLive,
  parseBinanceFilters,
  parseKrakenFilters,
  parseOkxFilters,
  loadMtfBundle,
  decide,
  emptyRiskDay,
  type Candle,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function goldFilters(): InstrumentFilters {
  return {
    venue: "binance",
    symbol: "PAXGUSDT",
    base: "PAXG",
    quote: "USDT",
    tickSize: 0.01,
    qtyStep: 0.0001,
    minQty: 0.0001,
    minNotional: 5,
    status: "TRADING",
    tradable: true,
    instrument: "PAXGUSDT",
    marketClass: "TOKENIZED_GOLD_PROXY",
  };
}

function rising(start: number, count: number, interval: number, px0: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const openTime = start + i * interval;
    const open = px0 + i * 0.4;
    const close = open + 0.2;
    out.push({
      openTime,
      closeTime: openTime + interval - 1,
      open,
      high: close + 0.1,
      low: open - 0.1,
      close,
      volume: 2,
      confirm: "1",
    });
  }
  return out;
}

function goldBundle(now: number): MtfBundle {
  const last15 = now - IV15;
  const last1h = Math.floor(now / IV1H) * IV1H - IV1H;
  const last4h = Math.floor(now / IV4H) * IV4H - IV4H;
  const ser = (tf: "15m" | "1h" | "4h", candles: Candle[]) => ({
    venue: "binance" as const,
    symbol: "PAXGUSDT",
    quote: "USDT",
    timeframe: tf,
    instrument: "PAXGUSDT",
    marketClass: "TOKENIZED_GOLD_PROXY" as const,
    asset: "GOLD" as const,
    candles,
    live: null,
  });
  return {
    venue: "binance",
    asset: "GOLD",
    symbol: "PAXGUSDT",
    quote: "USDT",
    instrument: "PAXGUSDT",
    marketClass: "TOKENIZED_GOLD_PROXY",
    switched: false,
    failedVenues: [],
    filters: goldFilters(),
    series: {
      "15m": ser("15m", rising(last15 - 99 * IV15, 100, IV15, 2400)),
      "1h": ser("1h", rising(last1h - 69 * IV1H, 70, IV1H, 2400)),
      "4h": ser("4h", rising(last4h - 44 * IV4H, 45, IV4H, 2400)),
    },
  };
}

function profile(): Profile {
  return {
    id: "profile",
    persona: "Orion",
    equity: 10_000,
    goalTarget: null,
    goalDeadline: null,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("gold catalog", () => {
  it("core markets are BTC ETH GOLD", () => {
    assert.deepEqual([...ASSETS], ["BTC", "ETH", "GOLD"]);
    assert.ok(!(ASSETS as readonly string[]).includes("SOL"));
    assert.ok(!(ASSETS as readonly string[]).includes("OIL"));
    assert.deepEqual([...POST_V7_MARKETS], ["SOL", "OIL"]);
  });

  it("keeps PAXG and XAU identities distinct", () => {
    assert.notEqual("PAXGUSDT", "PAXGUSD");
    assert.notEqual("PAXGUSDT", "XAUUSD_SPOT");
    assert.notEqual("PAXGUSD", "XAUUSD_SPOT");
    assert.ok(GOLD_INSTRUMENTS.includes("XAUUSD_SPOT"));
    assert.notEqual(
      seriesIdentity("GOLD", "binance", "PAXGUSDT", "15m"),
      seriesIdentity("GOLD", "kraken", "PAXGUSD", "15m"),
    );
    assert.equal(marketCaption("GOLD", "PAXGUSDT", "TOKENIZED_GOLD_PROXY"), "GOLD PROXY · PAXGUSDT");
    assert.equal(marketCaption("GOLD", "XAUUSD_SPOT", "XAUUSD_SPOT"), "GOLD · XAUUSD UNAVAILABLE");
    assert.equal(VENUE_SYMBOLS.binance.GOLD.instrument, "PAXGUSDT");
    assert.equal(VENUE_SYMBOLS.kraken.GOLD.instrument, "PAXGUSD");
    assert.equal(VENUE_SYMBOLS.okx.GOLD.instrument, "PAXG-USDT");
    assert.equal(VENUE_SYMBOLS.binance.GOLD.marketClass, "TOKENIZED_GOLD_PROXY");
  });
});

describe("gold closed bars", () => {
  it("excludes forming Binance PAXG kline", () => {
    const now = Date.UTC(2026, 0, 15, 12, 12, 0);
    const openClosed = Date.UTC(2026, 0, 15, 12, 0, 0);
    const openForming = Date.UTC(2026, 0, 15, 12, 0, 0); // 12:00 bar is still forming at 12:12
    const raw = [
      [Date.UTC(2026, 0, 15, 11, 45, 0), "1", "2", "1", "1.5", "1", Date.UTC(2026, 0, 15, 11, 59, 59, 999)],
      [openForming, "1", "2", "1", "1.5", "1", Date.UTC(2026, 0, 15, 12, 14, 59, 999)],
    ];
    const parsed = parseBinanceKlines(raw, "15m");
    const split = splitLive(parsed, IV15, now, "binance");
    assert.equal(split.live?.openTime, openForming);
    assert.ok(split.closed.every((c) => c.openTime < openForming || c.openTime === Date.UTC(2026, 0, 15, 11, 45, 0)));
    assert.ok(!split.closed.some((c) => c.openTime === openClosed && now < openClosed + IV15));
  });

  it("drops Kraken PAXG last row", () => {
    const now = Date.UTC(2026, 0, 15, 12, 12, 0);
    const raw = {
      error: [],
      result: {
        PAXGUSD: [
          [Date.UTC(2026, 0, 15, 11, 45, 0) / 1000, "1", "2", "1", "1.5", "1.2", "3", 1],
          [Date.UTC(2026, 0, 15, 12, 0, 0) / 1000, "1", "2", "1", "1.5", "1.2", "3", 1],
        ],
        last: 1,
      },
    };
    const parsed = parseKrakenOhlc(raw, "15m");
    const split = splitLive(parsed, IV15, now, "kraken");
    assert.equal(split.live?.openTime, Date.UTC(2026, 0, 15, 12, 0, 0));
    assert.equal(split.closed.at(-1)?.openTime, Date.UTC(2026, 0, 15, 11, 45, 0));
  });

  it("OKX PAXG confirm 0 excluded, 1 accepted", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const raw = {
      code: "0",
      data: [
        [String(Date.UTC(2026, 0, 15, 12, 0, 0)), "1", "2", "1", "1.5", "1", "1", "1", "0"],
        [String(Date.UTC(2026, 0, 15, 11, 45, 0)), "1", "2", "1", "1.5", "1", "1", "1", "1"],
      ],
    };
    const parsed = parseOkxCandles(raw, "15m");
    const split = splitLive(parsed, IV15, now, "okx");
    assert.equal(split.closed.length, 1);
    assert.equal(split.closed[0]?.confirm, "1");
    assert.equal(split.live?.confirm, "0");
  });
});

describe("gold filters", () => {
  it("parses Binance PAXGUSDT filters", () => {
    const f = parseBinanceFilters(
      {
        symbols: [
          {
            symbol: "PAXGUSDT",
            status: "TRADING",
            baseAsset: "PAXG",
            quoteAsset: "USDT",
            filters: [
              { filterType: "PRICE_FILTER", tickSize: "0.01000000" },
              { filterType: "LOT_SIZE", stepSize: "0.00010000", minQty: "0.00010000" },
              { filterType: "NOTIONAL", minNotional: "5.00000000" },
            ],
          },
        ],
      },
      "PAXGUSDT",
    );
    assert.ok(!("error" in f));
    if ("error" in f) return;
    assert.equal(f.tickSize, 0.01);
    assert.equal(f.qtyStep, 0.0001);
    assert.equal(f.minNotional, 5);
  });

  it("parses Kraken PAXGUSD and OKX PAXG-USDT filters", () => {
    const kr = parseKrakenFilters(
      {
        result: {
          PAXGUSD: {
            altname: "PAXGUSD",
            base: "PAXG",
            quote: "ZUSD",
            lot_decimals: 8,
            tick_size: "0.01",
            ordermin: "0.001",
            costmin: "0.5",
            status: "online",
          },
        },
      },
      "PAXGUSD",
    );
    assert.ok(!("error" in kr));
    if (!("error" in kr)) {
      assert.equal(kr.tickSize, 0.01);
      assert.equal(kr.minQty, 0.001);
      assert.equal(kr.minNotional, 0.5);
    }
    const ok = parseOkxFilters(
      {
        data: [
          {
            instId: "PAXG-USDT",
            baseCcy: "PAXG",
            quoteCcy: "USDT",
            tickSz: "0.1",
            lotSz: "0.000001",
            minSz: "0.001",
            state: "live",
          },
        ],
      },
      "PAXG-USDT",
    );
    assert.ok(!("error" in ok));
    if (!("error" in ok)) {
      assert.equal(ok.tickSize, 0.1);
      assert.equal(ok.minQty, 0.001);
    }
  });
});

describe("gold fallback", () => {
  const now = Date.UTC(2026, 0, 15, 12, 15, 0);
  function bars(n: number, iv: number) {
    return Array.from({ length: n }, (_, i) => {
      const o = now - (n - i) * iv;
      return [o, "2400", "2401", "2399", "2400.5", "1", o + iv - 1];
    });
  }
  it("Binance PAXG fail → Kraken PAXGUSD", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("binance")) return jsonRes({}, 503);
      if (url.includes("kraken") && url.includes("OHLC")) {
        return jsonRes({ error: [], result: { PAXGUSD: bars(80, IV15).map((r) => [Number(r[0]) / 1000, r[1], r[2], r[3], r[4], r[4], r[5], 1]), last: 1 } });
      }
      if (url.includes("AssetPairs")) {
        return jsonRes({
          result: {
            PAXGUSD: {
              altname: "PAXGUSD",
              base: "PAXG",
              quote: "ZUSD",
              lot_decimals: 8,
              tick_size: "0.01",
              ordermin: "0.001",
              costmin: "0.5",
              status: "online",
            },
          },
        });
      }
      return jsonRes({}, 503);
    };
    const loaded = await loadMtfBundle("GOLD", now, fetchImpl);
    assert.equal(loaded.bundle?.venue, "kraken");
    assert.equal(loaded.bundle?.instrument, "PAXGUSD");
    assert.equal(loaded.bundle?.asset, "GOLD");
    assert.ok(loaded.failed.includes("binance"));
    assert.equal(loaded.bundle?.series["15m"].instrument, "PAXGUSD");
    assert.equal(loaded.bundle?.series["4h"].instrument, "PAXGUSD");
  });

  it("all gold venues fail → WAIT_DATA path", async () => {
    const loaded = await loadMtfBundle("GOLD", now, async () => jsonRes({}, 503));
    assert.equal(loaded.bundle, null);
    assert.deepEqual(loaded.failed, ["binance", "kraken", "okx"]);
    const d = decide({ bundle: null, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(d.kind, "WAIT");
    assert.ok(d.waitCode === "WAIT_DATA" || d.quality.state === "UNAVAILABLE");
  });
});

describe("gold engine", () => {
  it("uses the same decide() pipeline and never labels PAXG as XAUUSD", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const bundle = goldBundle(now);
    const d = decide({ bundle, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(d.asset, "GOLD");
    assert.equal(d.instrument, "PAXGUSDT");
    assert.equal(d.marketClass, "TOKENIZED_GOLD_PROXY");
    assert.ok(["BUY", "SELL", "WATCH", "WAIT"].includes(d.userDecision));
    assert.notEqual(d.instrument, "XAUUSD_SPOT");
    assert.notEqual(d.symbol, "XAUUSD");
    const mixed = goldBundle(now);
    mixed.series["4h"] = { ...mixed.series["4h"], venue: "okx", instrument: "PAXG-USDT" };
    const inv = decide({ bundle: mixed, profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    assert.equal(inv.quality.state, "INVALID");
  });
});
