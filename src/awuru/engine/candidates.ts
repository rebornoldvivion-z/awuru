import type { HtfStance, LifecycleState } from "../domain/constants.ts";
import type { Candidate, Direction, Geometry, Regime } from "../domain/types.ts";
import type { FamilyEval } from "./families.ts";
import { htfStance } from "./families.ts";
import { regimeFits } from "./regime.ts";

export function buildCandidates(
  evals: FamilyEval[],
  h1Bias: Direction | "neutral",
  h4Bias: Direction | "neutral",
  regime: Regime,
  geometryFor: (direction: Direction) => Geometry | null,
): Candidate[] {
  const out: Candidate[] = [];
  for (const f of evals) {
    if (!f.direction) continue;
    if (f.score < 0.2 && f.state === "FORMING" && f.blockers.length === 0 && !f.eligible) continue;
    const h1 = htfStance(h1Bias, f.direction);
    const h4 = htfStance(h4Bias, f.direction);
    const blockers = [...f.blockers];
    let state: LifecycleState = f.state;
    if (h4 === "OPPOSING") {
      blockers.push("4h opposing — RELEASE blocked, WATCH allowed");
      if (state === "TRIGGERED") state = "WATCH";
    } else if (h1 === "OPPOSING" && state === "TRIGGERED") {
      blockers.push("1h opposing — waiting for alignment");
      state = "WATCH";
    }
    const fit = regimeFits(regime.kind, f.family);
    if (!fit) blockers.push(`regime ${regime.kind} poorly fits ${f.family}`);
    let rankScore = f.score;
    if (fit) rankScore += 0.12;
    if (h4 === "SUPPORTIVE") rankScore += 0.12;
    else if (h4 === "NEUTRAL") rankScore += 0.05;
    if (h1 === "SUPPORTIVE") rankScore += 0.08;
    else if (h1 === "NEUTRAL") rankScore += 0.03;
    if (state === "TRIGGERED") rankScore += 0.1;
    if (state === "WATCH") rankScore += 0.04;
    const geo = f.eligible || state === "TRIGGERED" || state === "WATCH" ? geometryFor(f.direction) : null;
    out.push({
      family: f.family,
      direction: f.direction,
      state,
      grade: f.grade,
      score: rankScore,
      rank: 0,
      regimeFit: fit,
      h1,
      h4,
      trigger: f.trigger,
      invalidation: f.invalidation ?? "thesis breaks",
      blockers,
      reasons: f.reasons,
      geometry: geo,
    });
  }
  out.sort((a, b) => b.score - a.score);
  out.forEach((c, i) => {
    c.rank = i + 1;
  });
  return out.slice(0, 3);
}

export function pickSlots(cands: Candidate[]): {
  best: Candidate | null;
  secondary: Candidate | null;
  watch: Candidate | null;
} {
  const best = cands[0] ?? null;
  const secondary = cands[1] ?? null;
  const watch = cands.find((c) => c.state === "WATCH" || c.state === "FORMING") ?? null;
  return { best, secondary, watch };
}
