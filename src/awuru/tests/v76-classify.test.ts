import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyTarget, classifyThesis } from "../../../scripts/validate-v76.ts";

describe("v7.6 thesis classes", () => {
  it("WRONG when never +0.25R", () => {
    assert.equal(classifyThesis(0.1, "sl"), "THESIS_WRONG");
    assert.equal(classifyThesis(0.24, "expired"), "THESIS_WRONG");
  });
  it("GEOMETRY_MISSED when ≥0.5R without TP1", () => {
    assert.equal(classifyThesis(0.8, "sl"), "THESIS_RIGHT_GEOMETRY_MISSED");
    assert.equal(classifyThesis(1.2, "expired"), "THESIS_RIGHT_GEOMETRY_MISSED");
  });
  it("MIXED for TP1 or 0.25–0.5R", () => {
    assert.equal(classifyThesis(1.5, "tp1"), "MIXED");
    assert.equal(classifyThesis(0.3, "sl"), "MIXED");
  });
  it("target labels are deterministic", () => {
    assert.equal(classifyTarget({ tp1R: 2, mfe16: 0.2, outcome: "sl", hit05: false }), "TARGET_UNREACHABLE_IN_HORIZON");
    assert.equal(classifyTarget({ tp1R: 1.4, mfe16: 1.4, outcome: "tp1", hit05: true }), "TARGET_REACHABLE");
    assert.equal(classifyTarget({ tp1R: 2, mfe16: 0.7, outcome: "sl", hit05: true }), "TARGET_PATH_DEPENDENT");
  });
});
