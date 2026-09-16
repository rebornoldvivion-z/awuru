import { emptyRiskDay } from "../risk/risk.ts";
import type { CanonicalInput } from "../engine/canonical.ts";
import type { Decision } from "../domain/types.ts";

/** Frozen Stage 0 input used for hosted hash persistence checks. */
export const STAGE0_HASH_INPUT: CanonicalInput = {
  bundle: null,
  corroboration: null,
  profile: { persona: "Orion", equity: 10_000, goalTarget: null, goalDeadline: null },
  riskDay: emptyRiskDay("2026-01-15"),
  now: Date.UTC(2026, 0, 15, 12, 0, 0),
};

/** Frozen parity-slice source for hosted decision_hash checks. Not a live signal. */
export const STAGE0_HASH_DECISION = {
  engineVersion: "7.3.0",
  userDecision: "WAIT",
  waitCode: "WAIT_DATA",
  lifecycle: "OBSERVING",
  family: null,
  researchStatus: { family: null, qualification: "NONE", note: "", actionable: false },
  regime: null,
  structure: null,
  direction: null,
} as Pick<
  Decision,
  | "engineVersion"
  | "userDecision"
  | "waitCode"
  | "lifecycle"
  | "family"
  | "researchStatus"
  | "regime"
  | "structure"
  | "direction"
>;

export const PARITY_PROFILE_FIXTURE = {
  id: "parity-orion-v1",
  version: "parity-profile-1",
  persona: "Orion" as const,
  equity: 10_000,
  goalTarget: null,
  goalDeadline: null,
};

export const PARITY_RISK_FIXTURE_DAY = "2026-01-15";
