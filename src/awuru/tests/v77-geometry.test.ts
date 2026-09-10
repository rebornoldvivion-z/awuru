import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CANDIDATES, resolveStop, resolveTarget } from "../../../scripts/validate-v77.ts";

describe("v7.7 pre-specified geometry", () => {
  it("declares the candidate set", () => {
    assert.deepEqual([...CANDIDATES.stops], ["S1", "S2a", "S2b", "S2c", "S3", "S4"]);
    assert.equal(CANDIDATES.atrCorridor.S2a, 0.75);
    assert.equal(CANDIDATES.fixedR.T2b, 1);
  });
  it("S2 corridor is ATR from entry", () => {
    const s = resolveStop("S2b", { dir: "long", entry: 100, origStop: 99, invalidator: 99, atr: 2, swingLow: 98, swingHigh: 103 });
    assert.equal(s, 98);
  });
  it("S4 skips missing swing", () => {
    assert.equal(resolveStop("S4", { dir: "long", entry: 100, origStop: 99, invalidator: 99, atr: 2, swingLow: null, swingHigh: 103 }), null);
  });
  it("T2 is R vs stop", () => {
    const t = resolveTarget("T2b", { dir: "long", entry: 100, origTp1: 104, stop: 98, atr: 2, oppSwing: 105 });
    assert.equal(t?.price, 102);
  });
});
