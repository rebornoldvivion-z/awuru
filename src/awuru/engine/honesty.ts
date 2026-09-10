import type { Family } from "../domain/constants.ts";
import type { FamilyEvidence } from "../domain/types.ts";

export type ResearchQualification = "UNVALIDATED" | "QUARANTINED" | "OBSERVATION" | "NONE";

export type ResearchStatus = {
  family: Family | null;
  qualification: ResearchQualification;
  note: string;
  actionable: boolean;
};

/** Only TREND may become a user-facing BUY/SELL candidate. Mathematics unchanged. */
export function isActionableFamily(family: Family | null | undefined): boolean {
  return family === "trend";
}

export function researchStatusFor(family: Family | null | undefined): ResearchStatus {
  if (family === "breakout") {
    return {
      family,
      qualification: "QUARANTINED",
      note: "BREAKOUT is quarantined from release. Historically weak. Observation only.",
      actionable: false,
    };
  }
  if (family === "trend") {
    return {
      family,
      qualification: "UNVALIDATED",
      note: "TREND is historically weak and unvalidated. Structural observation, not an edge.",
      actionable: true,
    };
  }
  if (family === "mean_reversion") {
    return {
      family,
      qualification: "OBSERVATION",
      note: "Mean reversion is observational. Not a release family.",
      actionable: false,
    };
  }
  return {
    family: family ?? null,
    qualification: "NONE",
    note: "No release family selected.",
    actionable: false,
  };
}

export function pickActionablePrimary(families: FamilyEvidence[]): FamilyEvidence | null {
  const eligible = families.filter((f) => f.eligible && f.direction && isActionableFamily(f.family));
  if (eligible.length === 0) return null;
  const dirs = new Set(eligible.map((f) => f.direction));
  if (dirs.size > 1) return null;
  return eligible.slice().sort((a, b) => b.score - a.score)[0] ?? null;
}

export function quarantinedEligible(families: FamilyEvidence[]): FamilyEvidence | null {
  return families.find((f) => f.eligible && f.direction && !isActionableFamily(f.family)) ?? null;
}
