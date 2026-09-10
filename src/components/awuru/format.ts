import { marketCaption } from "@/awuru/constants.ts";
import type { Decision } from "@/awuru/types.ts";
import type { DeskCard } from "@/awuru/session.ts";

export function healthLabel(d: Decision | null, snap?: DeskCard | null, scanning = false) {
  if (d?.quality.state) {
    if (d.corroboration?.status === "SOURCE_DIVERGENCE") return "DIVERGENCE";
    return d.quality.state;
  }
  if (scanning && !snap?.snapshot) return "UPDATING";
  if (snap?.snapshot || snap?.lastObserved) return "LAST OBSERVED";
  return "UNAVAILABLE";
}

export function healthTone(state: string) {
  if (state === "LIVE") return "text-up border-up/40 bg-up/10";
  if (state === "UNAVAILABLE" || state === "INVALID" || state === "DIVERGENCE") return "text-danger border-danger/40 bg-danger/10";
  if (state === "STALE" || state === "DELAYED" || state === "PARTIAL" || state === "SOURCE_SWITCH" || state === "LAST OBSERVED") {
    return "text-wait border-wait/40 bg-wait/10";
  }
  return "text-muted border-border bg-surface";
}

export function healthRail(state: string) {
  if (state === "LIVE") return "bg-up";
  if (state === "UNAVAILABLE" || state === "INVALID" || state === "DIVERGENCE") return "bg-danger";
  if (state === "STALE" || state === "DELAYED" || state === "PARTIAL" || state === "SOURCE_SWITCH" || state === "LAST OBSERVED") {
    return "bg-wait";
  }
  return "bg-subtle";
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

export function candidateBanner(d: Decision | null, scanning = false, lastObserved = false) {
  if (!d && scanning) return "Updating closed tape";
  if (!d && lastObserved) return "LAST OBSERVED · not live";
  if (!d) return "WAIT · no closed observation yet";
  if (d.kind === "RELEASE") return "CANDIDATE · UNVALIDATED";
  if (d.userDecision === "WATCH") return "WATCH · confirmation incomplete";
  if (d.waitCode === "WAIT_QUARANTINE") return "WAIT · BREAKOUT quarantined";
  return "WAIT · setup not formed";
}

export function waitExplanation(d: Decision | null, scanning = false, lastObserved = false): string {
  if (!d && scanning) return "Fetching closed 15m / 1h / 4h from the public proxy.";
  if (!d && lastObserved) return "Showing the last stored observation. Fresh tape has not replaced it yet.";
  if (!d) return "No closed-bar observation on this device yet.";
  if (d.userDecision === "WATCH") {
    return d.waitDetail || "A coherent setup exists, but confirmation, data, or risk is incomplete.";
  }
  if (d.userDecision === "WAIT") {
    if (d.waitCode === "WAIT_QUARANTINE") return "BREAKOUT is classified internally and quarantined. It cannot become BUY or SELL.";
    return d.waitDetail || d.whyNot || "The setup is not sufficiently formed.";
  }
  return d.whyNow || "Unvalidated TREND candidate. Manual confirmation required. Not a proven edge.";
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

export function corroborationLine(d: Decision | null): string {
  const c = d?.corroboration;
  if (!c) return "Source corroboration pending.";
  const ok = c.snaps?.filter((s) => s.ok).map((s) => s.venue).join(" · ") || c.primary || "primary";
  if (c.status === "SOURCE_AGREEMENT") {
    return `${ok} agree on the observation — not a directional vote.`;
  }
  if (c.status === "SOURCE_DIVERGENCE") {
    return `Sources disagree on the last closed bar. ${c.reason}`;
  }
  if (c.status === "PRIMARY_ONLY") {
    return `Only ${c.primary ?? "one venue"} has a closed 15m bar.`;
  }
  return c.reason || c.status;
}

export function visibleDecision(d: Decision | null, card?: DeskCard | null, scanning = false): string {
  if (d?.userDecision) return d.userDecision;
  if (card?.snapshot?.userDecision) return card.snapshot.userDecision;
  if (scanning) return "…";
  return "WAIT";
}

export function formatPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 100) return n.toFixed(2);
  if (Math.abs(n) >= 1) return n.toFixed(4);
  return n.toPrecision(6);
}

export function formatInvalidation(d: Decision | null, card?: DeskCard | null): string {
  const px = d?.geometry?.invalidatorPrice ?? d?.best?.invalidatorPrice ?? d?.watch?.invalidatorPrice ?? null;
  if (px != null) {
    const dir = d?.direction ?? card?.thesis?.direction;
    const rel = dir === "long" ? "close below" : dir === "short" ? "close above" : "through";
    return `15m ${rel} ${formatPrice(px)}`;
  }
  return d?.invalidation ?? card?.thesis?.invalidation ?? "—";
}
