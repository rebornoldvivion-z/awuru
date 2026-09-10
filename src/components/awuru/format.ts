import { marketCaption } from "@/awuru/constants.ts";
import type { Decision } from "@/awuru/types.ts";
import type { DeskCard } from "@/awuru/session.ts";

export function healthLabel(d: Decision | null, snap?: DeskCard | null) {
  if (snap?.lastObserved && !d) return "LAST OBSERVED";
  if (d?.corroboration?.status === "SOURCE_DIVERGENCE") return "DIVERGENCE";
  if (d?.quality.state) return d.quality.state;
  return snap?.snapshot?.quality ?? "UNAVAILABLE";
}

export function healthTone(state: string) {
  if (state === "LIVE") return "text-up border-up/40 bg-up/10";
  if (state === "UNAVAILABLE" || state === "INVALID" || state === "DIVERGENCE") return "text-danger border-danger/40 bg-danger/10";
  if (state === "STALE" || state === "DELAYED" || state === "PARTIAL" || state === "SOURCE_SWITCH" || state === "LAST OBSERVED") {
    return "text-wait border-wait/40 bg-wait/10";
  }
  return "text-muted border-border bg-surface";
}

export function decisionTone(d: string) {
  if (d === "BUY") return "text-up border-up/40 bg-up/10";
  if (d === "SELL") return "text-danger border-danger/40 bg-danger/10";
  if (d === "WATCH") return "text-steel border-steel/40 bg-steel/10";
  return "text-wait border-wait/40 bg-wait/10";
}

export function caption(card: DeskCard | null, asset: string) {
  if (card?.decision) return marketCaption(card.decision.asset, card.decision.instrument, card.decision.marketClass);
  if (card?.snapshot?.instrument) {
    return marketCaption(card.asset, card.snapshot.instrument, card.snapshot.marketClass as never);
  }
  return asset === "GOLD" ? "GOLD PROXY · PAXGUSDT" : asset;
}

export function researchLine(d: Decision | null) {
  if (!d) return "No observation yet.";
  return d.researchStatus.note;
}

export function candidateBanner(d: Decision | null) {
  if (d?.kind === "RELEASE") return "CANDIDATE · UNVALIDATED";
  if (d?.userDecision === "WATCH") return "WATCH · confirmation incomplete";
  if (d?.waitCode === "WAIT_QUARANTINE") return "WAIT · quarantined family";
  return "WAIT";
}

export function currentObservation(d: Decision | null, snap?: DeskCard | null): string {
  if (!d) return snap?.snapshot?.structure ?? snap?.snapshot?.regime ?? "Restoring last observed tape.";
  const bits = [
    d.structure?.read,
    d.regime ? `${d.regime.kind} ${d.regime.direction}` : null,
    d.direction ? `${d.family ?? "thesis"} ${d.direction}` : null,
  ].filter(Boolean);
  return bits.join(" · ") || d.quality.reason || "Observing closed tape.";
}

export function watchingLine(d: Decision | null): string {
  if (!d) return "Next closed 15m bar.";
  return d.trigger || "Next closed 15m bar.";
}

export function thesisAlive(d: Decision | null, snap?: DeskCard | null): string {
  if (d?.direction) return "ALIVE";
  if (snap?.thesis?.direction) return "ALIVE";
  return "NONE";
}

export function formatClock(ms: number | null) {
  if (!ms) return "—";
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}
