import type { ThesisChange } from "../domain/constants.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";
import type { Decision, Thesis } from "../domain/types.ts";

export function thesisFrom(d: Decision): Thesis {
  return {
    id: "thesis",
    asset: d.asset,
    at: d.decidedAt,
    barOpen: d.barOpen,
    venue: d.venue,
    regime: d.regime?.kind ?? null,
    userDecision: d.userDecision,
    direction: d.direction,
    family: d.family,
    state: d.lifecycle,
    evidence: d.best?.reasons[0] ?? d.waitDetail ?? d.quality.reason,
    invalidation: d.invalidation,
    sourceQuality: d.corroboration?.status ?? d.quality.state,
    engineVersion: ENGINE_VERSION,
  };
}

export function compareThesis(prev: Thesis | null, next: Thesis): ThesisChange {
  if (!prev || prev.asset !== next.asset) return "NEW_SETUP";
  if (prev.direction && next.direction && prev.direction !== next.direction) return "REVERSED";
  if (prev.state === "WATCH" && (next.state === "INVALIDATED" || next.userDecision === "WAIT") && next.family === prev.family) {
    return "INVALIDATED";
  }
  if (prev.userDecision !== "WAIT" && next.userDecision === "WAIT" && prev.family === next.family) return "INVALIDATED";
  if (prev.userDecision === next.userDecision && prev.family === next.family && prev.regime === next.regime && prev.direction === next.direction) {
    if (next.state === "TRIGGERED" && prev.state !== "TRIGGERED") return "STRENGTHENED";
    if (next.state === "WATCH" && prev.state === "TRIGGERED") return "WEAKENED";
    if (next.state === "RELEASED" && prev.state !== "RELEASED") return "STRENGTHENED";
    return "UNCHANGED";
  }
  if (prev.family !== next.family || prev.regime !== next.regime) return "NEW_SETUP";
  return "UNCHANGED";
}

export function changeCopy(change: ThesisChange): string {
  if (change === "STRENGTHENED") return "Thesis strengthened";
  if (change === "WEAKENED") return "Thesis weakened";
  if (change === "INVALIDATED") return "Previous thesis invalidated";
  if (change === "REVERSED") return "Direction reversed";
  if (change === "NEW_SETUP") return "New setup";
  return "Thesis unchanged";
}
