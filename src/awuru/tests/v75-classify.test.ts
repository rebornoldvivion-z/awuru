import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyFamily, pathDetail, type FamilyLabel } from "../../../scripts/validate-v75.ts";

describe("v7.5 family classification", () => {
  it("uses decision-time family only", () => {
    assert.equal(classifyFamily("trend"), "TREND");
    assert.equal(classifyFamily("breakout"), "BREAKOUT");
    assert.equal(classifyFamily("mean_reversion"), "OTHER");
    assert.equal(classifyFamily(null), "OTHER");
    const labels: FamilyLabel[] = ["TREND", "BREAKOUT", "OTHER"];
    assert.equal(labels.length, 3);
  });

  it("same-bar SL wins over TP", () => {
    const d = pathDetail("short", 100, 102, 96, 2, [{ openTime: 1, closeTime: 2, open: 100, high: 103, low: 95, close: 97, volume: 1, confirm: "1" }]);
    assert.equal(d.outcome, "sl");
    assert.equal(d.grossR, -1);
  });
});
