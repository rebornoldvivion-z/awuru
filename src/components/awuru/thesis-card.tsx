import { familyLabel } from "@/awuru/families.ts";
import { formatClock } from "@/awuru/time.ts";
import type { Candidate, Decision, Shadow } from "@/awuru/types.ts";
import { cn } from "@/lib/utils.ts";

function tone(d: string) {
  if (d === "BUY") return "text-up border-up/40 bg-up/10";
  if (d === "SELL") return "text-danger border-danger/40 bg-danger/10";
  if (d === "WATCH") return "text-steel border-steel/40 bg-steel/10";
  return "text-wait border-wait/40 bg-wait/10";
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-subtle">{k}</span>
      <span className="font-mono text-right text-fg">{v}</span>
    </div>
  );
}

function candLine(c: Candidate, label: string) {
  return (
    <div className="border-t border-border py-2 first:border-0">
      <p className="font-mono text-xs uppercase tracking-wider text-subtle">{label}</p>
      <p className="text-sm">
        {c.direction === "long" ? "BUY" : "SELL"} · {familyLabel(c.family)} · {c.state}
      </p>
      <p className="text-xs text-muted">{c.reasons[0]}</p>
      <p className="text-xs text-subtle">Invalid if {c.invalidation}</p>
    </div>
  );
}

export function ThesisCard(props: {
  decision: Decision | null;
  changeNote: string | null;
  shadows: Shadow[];
  persona: string;
  riskDay: { realizedR: number; openR: number; trades: number };
}) {
  const d = props.decision;
  const similar = props.shadows.filter((s) => s.family === d?.family && s.direction === d?.direction).slice(0, 5);
  const done = similar.filter((s) => s.status === "tp1" || s.status === "tp2" || s.status === "tp3");
  const dead = similar.filter((s) => s.status === "sl" || s.status === "expired");
  return (
    <div className="space-y-3">
      <div className={cn("rounded-xl border px-4 py-3", tone(d?.userDecision ?? "WAIT"))}>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Decision</p>
        <p className="mt-1 text-2xl font-medium tracking-tight">{d?.userDecision ?? "WAIT"}</p>
        <p className="mt-1 text-sm opacity-80">{d?.waitDetail ?? d?.quality.reason ?? "Awaiting first analysis."}</p>
        {d?.blockedByRisk && <p className="mt-2 text-xs">Valid setup — blocked by risk. Not absent.</p>}
      </div>
      {props.changeNote && <p className="font-mono text-xs text-steel">{props.changeNote}</p>}
      <div className="rounded-xl border border-border bg-raised px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Thesis</p>
        <Row k="Regime" v={d?.regime ? `${d.regime.kind} · ${d.regime.direction}` : "—"} />
        <Row k="Structure" v={d?.structure?.pattern ?? "—"} />
        <Row k="MTF" v={`15m ${d?.direction ?? "—"} / 1h ${d?.htf.h1Bias ?? "—"} / 4h ${d?.htf.h4Bias ?? "—"}`} />
        <Row k="1h / 4h stance" v={`${d?.htfStance.h1} / ${d?.htfStance.h4}`} />
        <Row k="Source" v={`${d?.venue ?? "—"} · ${d?.corroboration?.status ?? d?.quality.state ?? "—"}`} />
        <Row k="Quality" v={d?.quality.state ?? "—"} />
        {d?.htf.h4ClosedOpen && <Row k="Last closed 4h" v={formatClock(d.htf.h4ClosedOpen)} />}
        {d?.invalidation && <Row k="Invalid if" v={d.invalidation} />}
        {d?.trigger && <Row k="Trigger" v={d.trigger} />}
        {d?.size && d.size.ok && <Row k="Risk cash" v={d.size.riskCash.toFixed(2)} />}
        <Row k="Persona R" v={`${props.persona} · R ${props.riskDay.realizedR}`} />
      </div>
      <div className="rounded-xl border border-border bg-raised px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Opportunity</p>
        {d?.best ? candLine(d.best, "Best") : <p className="text-sm text-muted">NONE — no valid opportunity right now.</p>}
        {d?.secondary ? candLine(d.secondary, "Secondary") : null}
        {d?.watch && d.watch !== d.best ? candLine(d.watch, "Watch") : null}
      </div>
      {similar.length > 0 && (
        <div className="rounded-xl border border-border bg-raised px-4 py-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Comparable shadows</p>
          <p className="text-sm text-muted">
            {similar.length} recorded · {done.length} reached a target · {dead.length} failed. Sample too small for probability.
          </p>
        </div>
      )}
    </div>
  );
}
