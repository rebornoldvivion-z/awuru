import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizeObserver, secretsEqual } from "../cloud/observer-auth.ts";
import {
  computeObserverHealth,
  missedIntervals,
  schedulerLagSeconds,
  shouldAdvanceCheckpoint,
} from "../cloud/observer-health.ts";
import { decisionIdFor, executionReadyLabel, httpStatusForCycle, type CycleResult } from "../cloud/observe-cycle.ts";
import { classifyBinanceMessage, eventIdFor, leaseDecision } from "../cloud/worker.ts";
import { incomingToCandle } from "../observe/ingest.ts";
import { researchStatusFor } from "../engine/honesty.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";
import type { Decision } from "../domain/types.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function cycle(over: Partial<CycleResult>): CycleResult {
  return {
    status: "SUCCESS",
    observedAt: "2026-01-15T12:00:00.000Z",
    observerMode: "scheduled",
    productionAuthority: "model-b",
    continuous: false,
    streaming: false,
    assetsProcessed: 3,
    closedCandlesInserted: 0,
    closedCandlesUnchanged: 3,
    closedCandlesRecovered: 3,
    formingIgnored: 3,
    conflicts: 0,
    decisionsProduced: 3,
    decisionsUnchanged: 0,
    executionReady: 0,
    parity: { tape: "PASS", engine: "PASS" },
    checkpointAdvanced: true,
    lease: "RELEASED",
    observerStatus: "HEALTHY",
    health: computeObserverHealth({
      now: Date.UTC(2026, 0, 15, 12, 3, 0),
      lastAttemptAt: Date.UTC(2026, 0, 15, 12, 3, 0),
      lastSuccessAt: Date.UTC(2026, 0, 15, 12, 3, 0),
      lastClosedCloseTime: Date.UTC(2026, 0, 15, 12, 0, 0) - 1,
      lastDecisionAt: Date.UTC(2026, 0, 15, 12, 3, 0),
      durationMs: 1200,
      consecutiveFailures: 0,
      leaseStatus: "RELEASED",
      lastErrorCode: null,
      cycleFailed: false,
      recovering: false,
      leaseBlocked: false,
    }),
    gold: { instrument: "PAXGUSDT", marketClass: "TOKENIZED_GOLD_PROXY" },
    durationMs: 1200,
    ...over,
  };
}

function decision(over: Partial<Decision>): Decision {
  return {
    waitCode: null,
    waitDetail: null,
    signalId: null,
    accountId: "acct",
    asset: "BTC",
    venue: "binance",
    symbol: "BTCUSDT",
    quote: "USDT",
    instrument: "BTCUSDT",
    marketClass: "CRYPTO_SPOT",
    timeframe: "15m",
    barOpen: Date.UTC(2026, 0, 15, 12, 0, 0),
    direction: "long",
    family: "trend",
    families: [],
    geometry: null,
    size: null,
    persona: "Orion",
    quality: { state: "LIVE", venue: "binance", reason: "", lastClosedOpen: 0, ageMs: 0, now: 0 },
    htf: { h1: { stance: "NEUTRAL", reason: "" }, h4: { stance: "NEUTRAL", reason: "" } },
    evidenceGrade: null,
    userDecision: "WAIT",
    now: Date.UTC(2026, 0, 15, 12, 0, 0),
    engineVersion: ENGINE_VERSION,
    lifecycle: "OBSERVING",
    trigger: null,
    invalidation: null,
    blockedByRisk: false,
    whyNow: null,
    whyNot: null,
    researchStatus: researchStatusFor("trend"),
    candidates: [],
    best: null,
    secondary: null,
    watch: null,
    regime: null,
    structure: null,
    htfStance: { h1: "NEUTRAL", h4: "NEUTRAL" },
    corroboration: null,
    thesis: null,
    thesisChange: null,
    ...over,
  } as Decision;
}

describe("observer safety matrix", () => {
  it("A/M/N http mapping for success, empty, and recovery-shaped results", () => {
    assert.equal(httpStatusForCycle(cycle({})), 200);
    assert.equal(httpStatusForCycle(cycle({ closedCandlesInserted: 0, closedCandlesRecovered: 0 })), 200);
    assert.equal(httpStatusForCycle(cycle({ closedCandlesRecovered: 4, observerStatus: "RECOVERING" })), 200);
  });

  it("C/D/O deterministic ids are stable across retries", () => {
    const a = decisionIdFor("ETH", 1000, "abc");
    const b = decisionIdFor("ETH", 1000, "abc");
    assert.equal(a, b);
    assert.equal(eventIdFor("CANDLE_CLOSED", ["binance", "BTCUSDT", "15m", 1000]), eventIdFor("CANDLE_CLOSED", ["binance", "BTCUSDT", "15m", 1000]));
  });

  it("E/Q timeout classification stays fail-closed", () => {
    const h = computeObserverHealth({
      now: 10,
      lastAttemptAt: 10,
      lastSuccessAt: null,
      lastClosedCloseTime: null,
      lastDecisionAt: null,
      durationMs: 1,
      consecutiveFailures: 1,
      leaseStatus: "RELEASED",
      lastErrorCode: "PROVIDER_TIMEOUT",
      cycleFailed: true,
      recovering: false,
      leaseBlocked: false,
    });
    assert.equal(h.observer_status, "FAILED");
    assert.equal(h.consecutive_failures, 1);
    assert.notEqual(h.observer_status, "HEALTHY");
  });

  it("F websocket is not the scheduled path", () => {
    const workflow = readFileSync(join(root, ".github/workflows/model-c-observer.yml"), "utf8");
    assert.match(workflow, /\/internal\/model-c\/observe/);
    assert.equal(/wss:\/\//.test(workflow), false);
  });

  it("G/H forming bars ignored; closed bars accepted", () => {
    const open = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(
      classifyBinanceMessage({
        data: { k: { s: "BTCUSDT", i: "15m", t: open, o: "1", h: "1", l: "1", c: "1", v: "1", x: false } },
      }).kind,
      "forming",
    );
    const closed = classifyBinanceMessage({
      data: { k: { s: "PAXGUSDT", i: "15m", t: open, o: "100", h: "110", l: "90", c: "105", v: "1", x: true } },
    });
    assert.equal(closed.kind, "closed");
    assert.ok(incomingToCandle(closed.kline!));
  });

  it("I checkpoint does not advance on persist/decide/ingest failure", () => {
    assert.equal(shouldAdvanceCheckpoint({ ingestFailed: true, decideFailed: false, persistFailed: false }), false);
    assert.equal(shouldAdvanceCheckpoint({ ingestFailed: false, decideFailed: true, persistFailed: false }), false);
    assert.equal(shouldAdvanceCheckpoint({ ingestFailed: false, decideFailed: false, persistFailed: true }), false);
    assert.equal(shouldAdvanceCheckpoint({ ingestFailed: false, decideFailed: false, persistFailed: false }), true);
  });

  it("J failed cycle is never HEALTHY", () => {
    const h = computeObserverHealth({
      now: 20_000,
      lastAttemptAt: 20_000,
      lastSuccessAt: 1,
      lastClosedCloseTime: 1,
      lastDecisionAt: 1,
      durationMs: 5,
      consecutiveFailures: 3,
      leaseStatus: "RELEASED",
      lastErrorCode: "SYSTEM_FAILURE",
      cycleFailed: true,
      recovering: false,
      leaseBlocked: false,
    });
    assert.equal(h.observer_status, "FAILED");
  });

  it("K lease refusal does not steal ownership", () => {
    const now = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(leaseDecision({ now, heartbeatMs: now - 1000, owner: "other", mine: "me" }), "refuse");
    assert.equal(httpStatusForCycle(cycle({ status: "LEASE_BLOCKED", lease: "LEASE_BLOCKED", observerStatus: "LEASE_BLOCKED" })), 409);
  });

  it("L missed intervals and stale health", () => {
    const now = Date.UTC(2026, 0, 15, 13, 0, 0);
    assert.equal(missedIntervals(now, Date.UTC(2026, 0, 15, 12, 0, 0)), 3);
    const stale = computeObserverHealth({
      now,
      lastAttemptAt: now,
      lastSuccessAt: Date.UTC(2026, 0, 15, 12, 0, 0),
      lastClosedCloseTime: Date.UTC(2026, 0, 15, 12, 0, 0),
      lastDecisionAt: Date.UTC(2026, 0, 15, 12, 0, 0),
      durationMs: 1,
      consecutiveFailures: 0,
      leaseStatus: "RELEASED",
      lastErrorCode: null,
      cycleFailed: false,
      recovering: false,
      leaseBlocked: false,
    });
    assert.equal(stale.observer_status, "STALE");
    assert.ok(schedulerLagSeconds(now + 3 * 60 * 1000 + 5000) >= 5);
  });

  it("P invalid observer secret is unauthorized; missing secret is fail-closed", () => {
    const missing = authorizeObserver("Bearer x", {});
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.status, 503);
    const env = { AWURU_OBSERVER_SECRET: "correct-token-value" };
    const bad = authorizeObserver("Bearer wrong-token-value", env);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.status, 401);
    const ok = authorizeObserver("Bearer correct-token-value", env);
    assert.equal(ok.ok, true);
    assert.equal(secretsEqual("a", "b"), false);
  });
});

describe("research safety in scheduled observer", () => {
  it("BREAKOUT and TREND never become EXECUTION_READY; GOLD stays PAXG", () => {
    assert.equal(ENGINE_VERSION, "7.3.0");
    assert.equal(
      executionReadyLabel(
        decision({
          family: "breakout",
          userDecision: "BUY",
          lifecycle: "CANDIDATE",
          researchStatus: researchStatusFor("breakout"),
        }),
      ),
      null,
    );
    assert.equal(
      executionReadyLabel(
        decision({
          family: "trend",
          userDecision: "BUY",
          lifecycle: "CANDIDATE",
          researchStatus: researchStatusFor("trend"),
        }),
      ),
      null,
    );
    const yml = readFileSync(join(root, ".github/workflows/model-c-observer.yml"), "utf8");
    assert.equal(/sb_secret_/.test(yml), false);
    assert.equal(/decide\(/.test(yml), false);
  });
});
