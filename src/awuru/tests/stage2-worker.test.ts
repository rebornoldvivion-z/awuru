import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACTIVE_GOLD_SOURCE, PAXG_GOLD_SOURCE, XAUUSD_FREE_SOURCE, assertGoldIdentity } from "../cloud/gold-source.ts";
import { classifyBinanceMessage, closedKlineFromBinance, leaseDecision } from "../cloud/worker.ts";
import { incomingToCandle } from "../observe/ingest.ts";
import { researchStatusFor } from "../engine/honesty.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";

describe("Stage 2 gold adapter", () => {
  it("keeps PAXG as the only engine-valid GOLD source", () => {
    assert.equal(ACTIVE_GOLD_SOURCE.id, "PAXG");
    assert.equal(ACTIVE_GOLD_SOURCE.instrument, "PAXGUSDT");
    assert.equal(ACTIVE_GOLD_SOURCE.marketClass, "TOKENIZED_GOLD_PROXY");
    assert.equal(ACTIVE_GOLD_SOURCE.engineValid, true);
    assert.equal(PAXG_GOLD_SOURCE.venueSymbol("binance"), "PAXGUSDT");
    assert.equal(XAUUSD_FREE_SOURCE.engineValid, false);
    assert.doesNotThrow(() => assertGoldIdentity("PAXGUSDT", "TOKENIZED_GOLD_PROXY"));
    assert.throws(() => assertGoldIdentity("XAUUSD", "XAUUSD_SPOT"));
  });
});

describe("Stage 2 closed-bar contract", () => {
  it("ignores forming Binance klines and accepts k.x === true", () => {
    const open = Date.UTC(2026, 0, 15, 12, 0, 0);
    const forming = closedKlineFromBinance(
      { data: { k: { s: "BTCUSDT", i: "15m", t: open, o: "1", h: "2", l: "1", c: "2", v: "3", x: false } } },
      open + 60_000,
    );
    assert.equal(forming, null);
    const closed = closedKlineFromBinance(
      { data: { k: { s: "PAXGUSDT", i: "15m", t: open, o: "100", h: "110", l: "90", c: "105", v: "3", x: true } } },
      open + 15 * 60 * 1000,
    );
    assert.ok(closed);
    assert.equal(closed.symbol, "PAXGUSDT");
    assert.equal(closed.closed, true);
    const candle = incomingToCandle(closed);
    assert.ok(candle);
    assert.equal(candle.open, 100);
    assert.equal(candle.close, 105);
  });

  it("does not map unknown symbols onto GOLD/BTC/ETH", () => {
    const open = Date.UTC(2026, 0, 15, 12, 0, 0);
    const xau = closedKlineFromBinance(
      { data: { k: { s: "XAUUSDT", i: "15m", t: open, o: "1", h: "1", l: "1", c: "1", v: "1", x: true } } },
      open + 15 * 60 * 1000,
    );
    assert.equal(xau, null);
  });

  it("classifies forming vs closed vs ignored", () => {
    const open = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(
      classifyBinanceMessage({
        data: { k: { s: "ETHUSDT", i: "1h", t: open, o: "1", h: "1", l: "1", c: "1", v: "1", x: false } },
      }).kind,
      "forming",
    );
    assert.equal(
      classifyBinanceMessage({
        data: { k: { s: "BTCUSDT", i: "15m", t: open, o: "1", h: "1", l: "1", c: "1", v: "1", x: true } },
      }).kind,
      "closed",
    );
    assert.equal(classifyBinanceMessage({ ping: 1 }).kind, "ignored");
  });
});

describe("Stage 2 singleton lease", () => {
  it("refuses a live foreign owner and allows expired or self", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(
      leaseDecision({ now, heartbeatMs: now - 1_000, owner: "other", mine: "me" }),
      "refuse",
    );
    assert.equal(
      leaseDecision({ now, heartbeatMs: now - 60_000, owner: "other", mine: "me" }),
      "acquire",
    );
    assert.equal(
      leaseDecision({ now, heartbeatMs: now - 1_000, owner: "me", mine: "me" }),
      "acquire",
    );
    assert.equal(leaseDecision({ now, heartbeatMs: 0, owner: "", mine: "me" }), "acquire");
  });
});

describe("Stage 2 science invariants", () => {
  it("BREAKOUT cannot be actionable and engine stays 7.3.0", () => {
    assert.equal(ENGINE_VERSION, "7.3.0");
    assert.equal(researchStatusFor("breakout").qualification, "QUARANTINED");
    assert.equal(researchStatusFor("breakout").actionable, false);
    assert.equal(researchStatusFor("trend").qualification, "UNVALIDATED");
  });
});
