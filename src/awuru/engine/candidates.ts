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
  geometryFor: (direction: Direction, inv: number | null) => Geometry | null,
): Candidate[] {
  const out: Candidate[] = [];
  for (const f of evals) {
    if (!f.direction) continue;
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
    const geo =
      f.eligible || state === "TRIGGERED" || state === "WATCH"
        ? geometryFor(f.direction, f.invalidatorPrice)
        : null;
    let rankScore = f.score;
    if (f.structureRead === "BULLISH_STRUCTURE" || f.structureRead === "BEARISH_STRUCTURE") rankScore += 0.2;
    if (f.structureRead === "EXPANDING_RANGE" || f.structureRead === "RANGE_TRANSITION") rankScore -= 0.2;
    if (fit) rankScore += 0.08;
    if (h4 === "SUPPORTIVE") rankScore += 0.08;
    else if (h4 === "OPPOSING") rankScore -= 0.15;
    if (h1 === "SUPPORTIVE") rankScore += 0.05;
    if (state === "TRIGGERED") rankScore += 0.12;
    if (geo && geo.rr >= 1.5) rankScore += 0.1;
    if (geo && geo.rr < 1.2) rankScore -= 0.1;
    const whyNot = state === "TRIGGERED" ? f.whyNot : [f.whyNot, ...blockers.filter((b) => !f.whyNot.includes(b))].filter(Boolean).join(" · ");
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
      invalidatorPrice: f.invalidatorPrice,
      blockers,
      reasons: f.reasons,
      geometry: geo,
      whyNow: f.whyNow,
      whyNot,
      structureRead: f.structureRead,
    });
  }
  out.sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
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
