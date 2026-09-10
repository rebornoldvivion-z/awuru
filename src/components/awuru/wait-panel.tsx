import type { Decision } from "@/awuru/types.ts";
import type { DeskCard } from "@/awuru/session.ts";
import { currentObservation, formatInvalidation, thesisAlive, waitExplanation, watchingLine } from "@/components/awuru/format.ts";

export function WaitPanel({ d, card, scanning = false }: { d: Decision | null; card?: DeskCard | null; scanning?: boolean }) {
  const decision = d?.userDecision ?? card?.snapshot?.userDecision ?? (scanning ? "…" : "WAIT");
  const title = decision === "WATCH" ? "Watch · coherent, unconfirmed" : "Wait · first-class state";
  return (
    <section className="rounded-xl border border-border bg-raised px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{title}</p>
      <p className="mt-2 text-sm text-muted">{waitExplanation(d, scanning, Boolean(card?.lastObserved))}</p>
      <dl className="mt-2 space-y-2 text-sm">
        <Row k="Current" v={currentObservation(d, card)} />
        <Row k="Blocker" v={d?.waitDetail ?? card?.snapshot?.waitDetail ?? d?.whyNot ?? "—"} />
        <Row k="Watching" v={watchingLine(d)} />
        <Row k="Thesis" v={thesisAlive(d, card)} />
        <Row k="Invalidation" v={formatInvalidation(d, card)} />
      </dl>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-subtle">{k}</dt>
      <dd className="max-w-[70%] text-right font-mono text-xs text-fg">{v}</dd>
    </div>
  );
}
