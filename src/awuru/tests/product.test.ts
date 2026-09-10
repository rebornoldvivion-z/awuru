import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILD_ID, ENGINE_VERSION, SURFACE, marketCaption } from "../domain/constants.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("product identity", () => {
  it("stamps command-center build without claiming a new engine", () => {
    assert.equal(ENGINE_VERSION, "7.3.0");
    assert.equal(SURFACE, "command-center");
    assert.match(BUILD_ID, /cc-/);
  });

  it("health/backend expose build metadata and never decide", () => {
    const src = readFileSync(join(here, "../market/backend.ts"), "utf8");
    assert.match(src, /BUILD_ID/);
    assert.match(src, /intelligence: "browser"/);
    assert.equal(/\bdecide\s*\(/.test(src), false);
  });

  it("Gold caption never collapses PAXG into XAUUSD", () => {
    assert.equal(marketCaption("GOLD", "PAXGUSDT", "TOKENIZED_GOLD_PROXY"), "GOLD PROXY · PAXGUSDT");
    assert.equal(marketCaption("GOLD", "XAUUSD_SPOT", "XAUUSD_SPOT"), "GOLD · XAUUSD UNAVAILABLE");
  });
});

describe("human language", () => {
  it("WAIT vs WATCH vs unvalidated candidate copy is explicit", () => {
    const src = readFileSync(join(here, "../../components/awuru/format.ts"), "utf8");
    assert.match(src, /CANDIDATE · UNVALIDATED/);
    assert.match(src, /WATCH · confirmation incomplete/);
    assert.match(src, /WAIT · BREAKOUT quarantined/);
    assert.match(src, /WAIT · setup not formed/);
    assert.match(src, /Updating closed tape/);
    assert.match(src, /LAST OBSERVED · not live/);
    assert.match(src, /not a directional vote/);
    assert.match(src, /Not a proven edge/);
    assert.equal(/confidence percentage/i.test(src), false);
  });

  it("npm test includes v75–v77 classifiers", () => {
    const pkg = JSON.parse(readFileSync(join(here, "../../../package.json"), "utf8")) as { scripts: { test: string } };
    assert.match(pkg.scripts.test, /v75-classify/);
    assert.match(pkg.scripts.test, /v76-classify/);
    assert.match(pkg.scripts.test, /v77-geometry/);
    assert.match(pkg.scripts.test, /product\.test/);
  });

  it("Command Center is the home surface", () => {
    const home = readFileSync(join(here, "../../routes/index.tsx"), "utf8");
    const desk = readFileSync(join(here, "../../components/awuru/desk-app.tsx"), "utf8");
    assert.match(desk, /CommandCenter/);
    assert.match(home, /surface="desk"/);
    const cc = readFileSync(join(here, "../../components/awuru/command-center.tsx"), "utf8");
    assert.match(cc, /GOLD PROXY/);
    assert.match(cc, /historically weak/);
  });
});
