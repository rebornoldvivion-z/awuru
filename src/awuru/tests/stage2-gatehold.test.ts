import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION, marketCaption } from "../domain/constants.ts";
import { CONTRACT_VERSION, decisionHash, inputHash } from "../engine/canonical.ts";
import { researchStatusFor } from "../engine/honesty.ts";
import { assertModelCInfrastructureReady, isHostedStagingAttached, readModelCEnvironment } from "../cloud/gate.ts";
import { verifyHostedSupabase } from "../cloud/hosted.ts";
import { STAGE0_HASH_DECISION, STAGE0_HASH_INPUT } from "../cloud/hash-fixture.ts";
import { compareEngine, compareTape, runEngineParity, runTapeParity } from "../cloud/parity.ts";
import { MODEL_C_STATUS } from "../cloud/status.ts";
import { WORKER_STATUS_CANONICAL } from "../cloud/foundation.ts";
import { readCloudPublicConfig } from "../cloud/config.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

describe("Stage 2 gate-hold status", () => {
  it("keeps Gate A passed in status and the paid Render worker unprovisioned", () => {
    assert.equal(MODEL_C_STATUS.stage0, "pass");
    assert.equal(MODEL_C_STATUS.stage1, "pass");
    assert.equal(MODEL_C_STATUS.stage2, "in_progress");
    assert.equal(MODEL_C_STATUS.gateA, "pass");
    assert.equal(MODEL_C_STATUS.hostedSupabase, "attached");
    assert.equal(MODEL_C_STATUS.renderWorker, "rejected_no_budget");
    assert.equal(MODEL_C_STATUS.observerMode, "scheduled");
    assert.equal(MODEL_C_STATUS.workerStatus, "not_provisioned");
    assert.equal(WORKER_STATUS_CANONICAL, "not_provisioned");
    assert.equal(MODEL_C_STATUS.parity, "in_progress");
    assert.equal(MODEL_C_STATUS.cloudAuthoritative, false);
    assert.equal(MODEL_C_STATUS.engine, "7.3.0");
    assert.equal(ENGINE_VERSION, "7.3.0");
    assert.equal(readCloudPublicConfig().enabled, false);
    assert.equal(readCloudPublicConfig().classification, "local");
  });

  it("does not claim Render or production cutover", () => {
    const status = readFileSync(join(root, "docs/AWURU_MODEL_C.md"), "utf8");
    assert.match(status, /Gate A/);
    assert.match(status, /PASS/);
    assert.equal(/Stage 2 is complete/i.test(status), false);
    assert.equal(/production cutover complete/i.test(status), false);
    const envDoc = readFileSync(join(root, "docs/environment-staging.md"), "utf8");
    assert.match(envDoc, /Project ref: olughqzjqfecqccjzrna/);
    assert.equal(/service-role keys/.test(envDoc), true);
    const checklist = readFileSync(join(root, "docs/model-c-stage2-operator-checklist.md"), "utf8");
    assert.match(checklist, /RESUME MODEL C STAGE 2/);
    assert.match(checklist, /20260913000001_stage1_foundation\.sql/);
    const render = readFileSync(join(root, "docs/render.staging.template.yaml"), "utf8");
    assert.match(render, /NOT PROVISIONED/);
    const workflow = readFileSync(join(root, ".github/workflows/model-c-observer.yml"), "utf8");
    assert.match(workflow, /npm run model-c:observer|\/internal\/model-c\/observe/);
    assert.equal(/decide\s*\(/.test(workflow), false);
    assert.equal(/24\/7/.test(workflow), false);
    assert.match(workflow, /workflow_dispatch/);
    assert.match(workflow, /secrets\.AWURU_OBSERVER_SECRET/);
  });
});


describe("Stage 2 fail-closed configuration", () => {
  it("refuses missing environment, production, missing URL, missing service role, missing versions", () => {
    assert.equal(readModelCEnvironment({}), null);
    assert.equal(isHostedStagingAttached({}), false);
    assert.throws(() => assertModelCInfrastructureReady({}), /AWURU_CLOUD_ENV missing/);
    assert.throws(
      () => assertModelCInfrastructureReady({ AWURU_CLOUD_ENV: "production" }),
      /refuses production/,
    );
    assert.throws(
      () => assertModelCInfrastructureReady({ AWURU_CLOUD_ENV: "development" }),
      /Staging only/,
    );
    assert.throws(
      () => assertModelCInfrastructureReady({ AWURU_CLOUD_ENV: "local" }),
      /Staging only/,
    );
    assert.throws(
      () => assertModelCInfrastructureReady({ AWURU_CLOUD_ENV: "staging" }),
      /AWURU_SUPABASE_URL missing/,
    );
    assert.throws(
      () =>
        assertModelCInfrastructureReady({
          AWURU_CLOUD_ENV: "staging",
          AWURU_SUPABASE_URL: "https://example.supabase.co",
        }),
      /SERVICE_ROLE_KEY missing/,
    );
    assert.throws(
      () =>
        assertModelCInfrastructureReady({
          AWURU_CLOUD_ENV: "staging",
          AWURU_SUPABASE_URL: "https://example.supabase.co",
          AWURU_SUPABASE_SERVICE_ROLE_KEY: "secret",
        }),
      /AWURU_ENGINE_VERSION missing/,
    );
    assert.throws(
      () =>
        assertModelCInfrastructureReady({
          AWURU_CLOUD_ENV: "staging",
          AWURU_SUPABASE_URL: "https://example.supabase.co",
          AWURU_SUPABASE_SERVICE_ROLE_KEY: "secret",
          AWURU_ENGINE_VERSION: "9.9.9",
          AWURU_CONTRACT_VERSION: CONTRACT_VERSION,
        }),
      /engine version mismatch/,
    );
    assert.throws(
      () =>
        assertModelCInfrastructureReady({
          AWURU_CLOUD_ENV: "staging",
          AWURU_SUPABASE_URL: "https://example.supabase.co",
          AWURU_SUPABASE_SERVICE_ROLE_KEY: "secret",
          AWURU_ENGINE_VERSION: ENGINE_VERSION,
        }),
      /AWURU_CONTRACT_VERSION missing/,
    );
    const ready = assertModelCInfrastructureReady({
      AWURU_CLOUD_ENV: "staging",
      AWURU_SUPABASE_URL: "https://example.supabase.co",
      AWURU_SUPABASE_SERVICE_ROLE_KEY: "secret",
      AWURU_ENGINE_VERSION: ENGINE_VERSION,
      AWURU_CONTRACT_VERSION: CONTRACT_VERSION,
    });
    assert.equal(ready.environment, "staging");
    assert.equal(ready.workerStatus, "not_provisioned");
    assert.equal(ready.engineVersion, "7.3.0");
  });

  it("hosted verification does not report success without a live connection", async () => {
    const missing = await verifyHostedSupabase({ env: {} });
    assert.equal(missing.ok, false);
    assert.equal(missing.connected, false);
    assert.equal(missing.reason, "NO_HOSTED_SUPABASE");
    assert.equal(missing.gate, "A");
    assert.equal(missing.workerStatus, "not_provisioned");

    const fetchFail = await verifyHostedSupabase({
      env: {
        AWURU_CLOUD_ENV: "staging",
        AWURU_SUPABASE_URL: "https://example.supabase.co",
        AWURU_SUPABASE_SERVICE_ROLE_KEY: "secret",
      },
      fetch: async () => {
        throw new Error("network down");
      },
    });
    assert.equal(fetchFail.ok, false);
    assert.equal(fetchFail.connected, false);
    assert.match(fetchFail.reason, /CANNOT_CONNECT/);
  });
});

describe("Stage 2 parity harness preparation", () => {
  it("classifies exact tape matches, conflicts, and gaps without inventing live percentages", () => {
    const open = Date.UTC(2026, 0, 15, 12, 0, 0);
    const base = {
      venue: "binance",
      symbol: "BTCUSDT",
      timeframe: "15m",
      openTime: open,
      open: 100,
      high: 110,
      low: 90,
      close: 105,
      volume: 3,
      closed: true,
    };
    const matched = compareTape([base], [base]);
    assert.equal(matched.counts.matched, 1);
    assert.equal(matched.tolerance, "exact");
    const conflict = compareTape([base], [{ ...base, close: 106 }]);
    assert.equal(conflict.counts.conflicting, 1);
    const missingC = compareTape([base], []);
    assert.equal(missingC.counts.missing_in_c, 1);
    const missingB = compareTape([], [base]);
    assert.equal(missingB.counts.missing_in_b, 1);
    const live = runTapeParity({});
    assert.equal(live.started, false);
    assert.equal(live.status, "not_started");
    assert.equal(live.reason, "NO_HOSTED_SUPABASE");
    assert.equal(live.counts.matched, 0);
  });

  it("compares contracted engine fields and stays blocked for live runs", () => {
    const row = {
      engineVersion: "7.3.0",
      userDecision: "WAIT" as const,
      waitCode: "WAIT_DATA" as const,
      lifecycle: "OBSERVING" as const,
      family: null,
      researchQualification: "NONE" as const,
      regimeKind: null,
      structureRead: null,
      direction: null,
      inputHash: "a".repeat(64),
      decisionHash: "b".repeat(64),
    };
    const ok = compareEngine(row, { ...row });
    assert.equal(ok.matched, true);
    const bad = compareEngine(row, { ...row, userDecision: "WATCH" });
    assert.equal(bad.matched, false);
    assert.match(bad.diffs[0] ?? "", /userDecision/);
    const live = runEngineParity({});
    assert.equal(live.started, false);
    assert.equal(live.status, "not_started");
    assert.equal(live.reason, "NO_HOSTED_SUPABASE");
  });

  it("Stage 0 hashes remain the persistence contract", async () => {
    const ih = await inputHash(STAGE0_HASH_INPUT);
    const dh = await decisionHash(STAGE0_HASH_DECISION as never);
    assert.match(ih, /^[0-9a-f]{64}$/);
    assert.match(dh, /^[0-9a-f]{64}$/);
    assert.equal(ih, await inputHash(STAGE0_HASH_INPUT));
    assert.equal(dh, await decisionHash(STAGE0_HASH_DECISION as never));
  });
});

describe("Stage 2 production isolation", () => {
  it("does not import cloud persistence from Model B surfaces", () => {
    for (const rel of [
      "src/awuru/session.ts",
      "src/awuru/market/backend.ts",
      "src/awuru/engine/engine.ts",
      "src/routes/api/bundle.ts",
      "src/routes/api/health.ts",
      "src/components/awuru/command-center.tsx",
    ]) {
      const src = readFileSync(join(root, rel), "utf8");
      assert.equal(/awuru\/cloud/.test(src), false, rel);
      assert.equal(/@\/lib\/db/.test(src), false, rel);
      assert.equal(/SUPABASE_SERVICE_ROLE/.test(src), false, rel);
    }
    const health = readFileSync(join(root, "src/awuru/market/backend.ts"), "utf8");
    assert.match(health, /intelligence: "browser"/);
    assert.equal(/\bdecide\s*\(/.test(health), false);
  });

  it("preserves Gold proxy, BREAKOUT quarantine, and resume scripts", () => {
    assert.equal(marketCaption("GOLD", "PAXGUSDT", "TOKENIZED_GOLD_PROXY"), "GOLD PROXY · PAXGUSDT");
    assert.equal(researchStatusFor("breakout").qualification, "QUARANTINED");
    assert.equal(researchStatusFor("breakout").actionable, false);
    assert.equal(researchStatusFor("trend").qualification, "UNVALIDATED");
    for (const rel of [
      "scripts/model-c/verify-hosted-supabase.ts",
      "scripts/model-c/tape-parity.ts",
      "scripts/model-c/engine-parity.ts",
      "scripts/model-c/observer.ts",
      "scripts/model-c/staging-web.ts",
      ".github/workflows/model-c-observer.yml",
      "docs/model-c-stage2-operator-checklist.md",
      "docs/environment-staging.md",
      "docs/AWURU_MODEL_C.md",
      "supabase/migrations/20260913000001_stage1_foundation.sql",
    ]) {
      assert.equal(existsSync(join(root, rel)), true, rel);
    }
    const appEnv = JSON.parse(readFileSync(join(root, ".grok/app-env.json"), "utf8")) as {
      VITE_AUTH_ENABLED: string;
      deploy: { database: boolean };
    };
    assert.equal(appEnv.VITE_AUTH_ENABLED, "false");
    assert.equal(appEnv.deploy.database, false);
  });
});
