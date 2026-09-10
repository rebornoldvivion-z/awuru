import type { ThesisChange } from "../domain/constants.ts";
import { ENGINE_VERSION } from "../domain/constants.ts";
import type { Decision, Thesis } from "../domain/types.ts";

export function thesisIdFor(asset: string) {
  return `thesis:${asset}`;
}

export function thesisFrom(d: Decision, prev?: Thesis | null): Thesis {
  const now = d.decidedAt;
  const created = prev?.asset === d.asset ? prev.createdAt : now;
  return {
    id: thesisIdFor(d.asset),
    asset: d.asset,
    at: now,
    barOpen: d.barOpen,
    venue: d.venue,
    regime: d.regime?.kind ?? null,
    userDecision: d.userDecision,
    direction: d.direction,
    family: d.family,
    state: d.lifecycle,
    evidence: d.whyNow || d.best?.reasons[0] || d.waitDetail || d.quality.reason,
    invalidation: d.invalidation,
    sourceQuality: d.corroboration?.status ?? d.quality.state,
    engineVersion: ENGINE_VERSION,
    structureRead: d.structure?.read ?? null,
    whyNow: d.whyNow,
    whyNot: d.whyNot,
    watching: d.trigger,
    createdAt: created,
    updatedAt: now,
    ageMs: now - created,
    change: null,
    changeReason: null,
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
    if (next.state === "CANDIDATE" && prev.state !== "CANDIDATE" && prev.state !== "RELEASED") return "STRENGTHENED";
    if (prev.structureRead && next.structureRead && prev.structureRead !== next.structureRead) return "NEW_SETUP";
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

export function describeThesisShift(prev: Thesis | null, next: Thesis): string {
  const change = compareThesis(prev, next);
  if (!prev) return next.whyNow || "New setup";
  if (change === "REVERSED") {
    return `Direction reversed ${prev.direction} → ${next.direction}`;
  }
  if (change === "INVALIDATED") {
    return next.whyNot || `Thesis invalidated: ${next.evidence}`;
  }
  if (prev.structureRead && next.structureRead && prev.structureRead !== next.structureRead) {
    return `Structure ${prev.structureRead} → ${next.structureRead}`;
  }
  if (prev.regime && next.regime && prev.regime !== next.regime) {
    return `Regime ${prev.regime} → ${next.regime}`;
  }
  if (change === "STRENGTHENED") {
    return next.whyNow || `State ${prev.state} → ${next.state}`;
  }
  if (change === "WEAKENED") {
    return next.whyNot || `State ${prev.state} → ${next.state}`;
  }
  if (change === "NEW_SETUP") {
    return next.whyNow || `${next.family ?? "setup"} ${next.userDecision}`;
  }
  return "Thesis unchanged";
}
