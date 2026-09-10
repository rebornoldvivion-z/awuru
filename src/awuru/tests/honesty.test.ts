import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  INTERVAL_MS,
  compareThesis,
  decide,
  emptyRiskDay,
  evaluateBreakout,
  evaluateFamilies,
  isActionableFamily,
  pickPrimary,
  pickActionablePrimary,
  quarantinedEligible,
  researchStatusFor,
  thesisFrom,
  thesisIdFor,
  type Candle,
  type FamilyEvidence,
  type InstrumentFilters,
  type MtfBundle,
  type Profile,
  type Structure,
} from "../index.ts";

const IV15 = INTERVAL_MS["15m"];
const IV1H = INTERVAL_MS["1h"];
const IV4H = INTERVAL_MS["4h"];
const here = dirname(fileURLToPath(import.meta.url));

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

function fam(over: Partial<FamilyEvidence> & Pick<FamilyEvidence, "family">): FamilyEvidence {
  return {
    eligible: false,
    direction: null,
    grade: "weak",
    score: 0,
    reasons: [],
    invalidation: null,
    whyNow: "",
    whyNot: "",
    ...over,
  };
}

function bar(openTime: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime, closeTime: openTime + IV15 - 1, open: o, high: h, low: l, close: c, volume: 3, confirm: "1" };
}

function rangeThenBreak(now: number): MtfBundle {
  const last15 = now - IV15;
  const last1h = Math.floor(now / IV1H) * IV1H - IV1H;
  const last4h = Math.floor(now / IV4H) * IV4H - IV4H;
  const flat = (start: number, count: number, interval: number, px: number, spikeLast: boolean): Candle[] => {
    const out: Candle[] = [];
    for (let i = 0; i < count; i++) {
      const openTime = start + i * interval;
      const spike = spikeLast && i === count - 1;
      out.push(
        bar(
          openTime,
          px,
          spike ? px + 12 : px + 0.35,
          px - 0.35,
          spike ? px + 11.5 : px + 0.05,
        ),
      );
    }
    return out;
  };
  const ser = (tf: "15m" | "1h" | "4h", candles: Candle[]) => ({
    venue: "binance" as const,
    symbol: "BTCUSDT",
    quote: "USDT",
    timeframe: tf,
    instrument: "BTCUSDT",
    marketClass: "CRYPTO_SPOT" as const,
    asset: "BTC" as const,
    candles,
    live: null,
  });
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
      "15m": ser("15m", flat(last15 - 99 * IV15, 100, IV15, 100, true)),
      "1h": ser("1h", flat(last1h - 69 * IV1H, 70, IV1H, 100, false)),
      "4h": ser("4h", flat(last4h - 44 * IV4H, 45, IV4H, 100, false)),
    },
  };
}

describe("honesty — BREAKOUT never actionable", () => {
  it("isActionableFamily admits only trend", () => {
    assert.equal(isActionableFamily("trend"), true);
    assert.equal(isActionableFamily("breakout"), false);
    assert.equal(isActionableFamily("mean_reversion"), false);
    assert.equal(isActionableFamily(null), false);
  });

  it("pickPrimary never returns breakout even when it is the only eligible family", () => {
    const families = [
      fam({ family: "trend", eligible: false, score: 0.9 }),
      fam({ family: "breakout", eligible: true, direction: "long", grade: "mixed", score: 0.8, whyNow: "donchian" }),
      fam({ family: "mean_reversion", eligible: false }),
    ];
    assert.equal(pickPrimary(families), null);
    assert.equal(pickActionablePrimary(families), null);
    const q = quarantinedEligible(families);
    assert.equal(q?.family, "breakout");
  });

  it("research status quarantines breakout and unvalidates trend", () => {
    const b = researchStatusFor("breakout");
    assert.equal(b.qualification, "QUARANTINED");
    assert.equal(b.actionable, false);
    const t = researchStatusFor("trend");
    assert.equal(t.qualification, "UNVALIDATED");
    assert.equal(t.actionable, true);
    assert.match(t.note, /historically weak/i);
  });

  it("evaluateBreakout can still classify, but decide() never BUY/SELL from it", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const candles = rangeThenBreak(now).series["15m"].candles;
    const last = candles[candles.length - 1]!;
    const st: Structure = {
      lastSwingHigh: { openTime: last.openTime - IV15, price: 100.35, kind: "high" },
      lastSwingLow: { openTime: last.openTime - 2 * IV15, price: 99.65, kind: "low" },
      priorSwingHigh: { openTime: last.openTime - 8 * IV15, price: 100.35, kind: "high" },
      priorSwingLow: { openTime: last.openTime - 9 * IV15, price: 99.65, kind: "low" },
      pattern: "hh_ll",
      read: "EXPANDING_RANGE",
      rangeHigh: 100.35,
      rangeLow: 99.65,
      breakout: "close",
      breakoutDir: "long",
      reclaim: false,
      reasons: [],
    };
    const ev = evaluateBreakout(
      candles,
      last,
      {
        rsi: 70,
        atr: 0.4,
        adx: 14,
        plusDi: 20,
        minusDi: 18,
        emaFast: 100.2,
        emaSlow: 100.1,
        bbMid: 100,
        bbUpper: 100.6,
        bbLower: 99.4,
        donchianHigh: 100.35,
        donchianLow: 99.65,
      },
      "neutral",
      "neutral",
      st,
      { kind: "COMPRESSION", direction: "neutral", volatility: "compressed", adx: 14, bbWidthPct: 0.01, atrPct: 0.004, reasons: [] },
    );
    assert.equal(ev.family, "breakout");
    if (ev.eligible) assert.equal(ev.direction, "long");

    const d = decide({
      bundle: rangeThenBreak(now),
      profile: profile(),
      riskDay: emptyRiskDay("2026-01-15"),
      now,
    });
    assert.notEqual(d.userDecision, "BUY");
    assert.notEqual(d.userDecision, "SELL");
    if (d.family === "breakout") {
      assert.equal(d.kind, "WAIT");
      assert.equal(d.waitCode, "WAIT_QUARANTINE");
      assert.equal(d.researchStatus.qualification, "QUARANTINED");
      assert.equal(d.researchStatus.actionable, false);
    }
  });

  it("BUY/SELL can only come from TREND and is labeled CANDIDATE · UNVALIDATED", () => {
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const d = decide({
      bundle: rangeThenBreak(now),
      profile: profile(),
      riskDay: emptyRiskDay("2026-01-15"),
      now,
    });
    if (d.userDecision === "BUY" || d.userDecision === "SELL") {
      assert.equal(d.family, "trend");
      assert.equal(d.kind, "RELEASE");
      assert.equal(d.lifecycle, "CANDIDATE");
      assert.equal(d.researchStatus.qualification, "UNVALIDATED");
      assert.equal(d.researchStatus.actionable, true);
    }
    const fams = evaluateFamilies(
      rangeThenBreak(now).series["15m"].candles,
      rangeThenBreak(now).series["15m"].candles.at(-1)!,
      {
        rsi: 55, atr: 1, adx: 18, plusDi: 16, minusDi: 14,
        emaFast: 100, emaSlow: 100, bbMid: 100, bbUpper: 101, bbLower: 99,
        donchianHigh: 100.4, donchianLow: 99.6,
      },
      "neutral",
      "neutral",
      {
        lastSwingHigh: null, lastSwingLow: null, priorSwingHigh: null, priorSwingLow: null,
        pattern: "undefined", read: "UNKNOWN", rangeHigh: 112, rangeLow: 99.6,
        breakout: "close", breakoutDir: "long", reclaim: false, reasons: [],
      },
      { kind: "RANGE", direction: "neutral", volatility: "normal", adx: 18, bbWidthPct: 0.02, atrPct: 0.01, reasons: [] },
    );
    const primary = pickPrimary(fams);
    if (primary) assert.equal(primary.family, "trend");
  });
});

describe("thesis persistence identity", () => {
  it("uses one stable id per asset and updates in place", () => {
    assert.equal(thesisIdFor("BTC"), "thesis:BTC");
    assert.equal(thesisIdFor("GOLD"), "thesis:GOLD");
    const now = Date.UTC(2026, 0, 15, 12, 15, 0);
    const d1 = decide({ bundle: rangeThenBreak(now), profile: profile(), riskDay: emptyRiskDay("2026-01-15"), now });
    const t1 = thesisFrom(d1);
    assert.equal(t1.id, "thesis:BTC");
    const t2 = thesisFrom({ ...d1, decidedAt: now + 1 }, t1);
    assert.equal(t2.id, t1.id);
    assert.equal(t2.createdAt, t1.createdAt);
    assert.ok(t2.ageMs >= 0);
    const change = compareThesis(t1, t2);
    assert.ok(["UNCHANGED", "STRENGTHENED", "WEAKENED", "INVALIDATED", "REVERSED", "NEW_SETUP"].includes(change));
  });
});

describe("server boundary — /api is observation transport only", () => {
  it("bundle, health, and backend sources never decide or mutate user state", () => {
    const files = [
      join(here, "../../routes/api/bundle.ts"),
      join(here, "../../routes/api/health.ts"),
      join(here, "../market/backend.ts"),
      join(here, "../backend.ts"),
    ];
    const banned = [
      /\bdecide\s*\(/,
      /\buserDecision\b/,
      /\bsizePosition\s*\(/,
      /\bputNote\s*\(/,
      /\bsaveThesis\s*\(/,
      /\bputShadow\s*\(/,
      /\bputMission\s*\(/,
      /\bsaveSnapshot\s*\(/,
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const re of banned) {
        assert.equal(re.test(src), false, `${file} must not contain ${re}`);
      }
    }
  });
});
