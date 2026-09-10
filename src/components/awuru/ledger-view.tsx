import { useState } from "react";
import { useSession } from "@/awuru/session.ts";
import { Button } from "@/components/ui/button.tsx";

export function LedgerView() {
  const missions = useSession((s) => s.missions);
  const shadows = useSession((s) => s.shadows);
  const notes = useSession((s) => s.notes);
  const events = useSession((s) => s.events);
  const thesis = useSession((s) => s.thesis);
  const cards = useSession((s) => s.cards);
  const addNote = useSession((s) => s.addNote);
  const reject = useSession((s) => s.rejectCandidate);
  const confirm = useSession((s) => s.confirmRelease);
  const decision = useSession((s) => s.decision);
  const [body, setBody] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">Evaluation ledger</p>
        <h2 className="text-2xl font-medium tracking-tight">Ledger</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Not trading P&L. Machine theses, human notes, shadow observation, and later path. Notes never mutate engine truth.
        </p>
      </div>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!body.trim()) return;
          void addNote(body.trim());
          setBody("");
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={thesis ? `Note on ${thesis.asset} · ${thesis.id}` : "Session note"}
          className="h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel/60"
        />
        <Button type="submit" className="h-11 px-4 text-xs">
          Attach note
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11 px-4 text-xs"
          onClick={() => void confirm()}
          disabled={!(decision?.kind === "RELEASE" && decision.researchStatus.actionable)}
        >
          Accept current candidate
        </Button>
        <Button type="button" variant="outline" className="h-11 px-4 text-xs" onClick={() => void reject()}>
          Record reject
        </Button>
      </div>
      <section className="grid gap-3 lg:grid-cols-2">
        <Block title="Machine theses">
          {(["BTC", "ETH", "GOLD"] as const).map((a) => {
            const t = cards[a]?.thesis;
            return (
              <p key={a} className="font-mono text-xs text-muted">
                {t?.id ?? `thesis:${a}`} · {t?.userDecision ?? "—"} · {t?.state ?? "—"} · {t?.direction ?? "none"}
              </p>
            );
          })}
        </Block>
        <Block title="Human notes">
          {notes.slice(0, 12).map((n) => (
            <p key={n.id} className="text-sm text-muted">
              <span className="font-mono text-[10px] text-subtle">{n.thesisId ?? n.asset ?? "desk"} · </span>
              {n.body}
            </p>
          ))}
          {notes.length === 0 && <p className="text-sm text-subtle">No human notes. Notes never change engine truth.</p>}
        </Block>
        <Block title="User confirms (accepted)">
          {missions.slice(0, 12).map((m) => (
            <p key={m.id} className="font-mono text-xs text-muted">
              {m.symbol} {m.direction} · {m.status} · R {m.realizedR ?? "open"} · {m.note || "unvalidated"}
            </p>
          ))}
          {missions.length === 0 && <p className="text-sm text-subtle">No manual confirms. AWURU never executes.</p>}
        </Block>
        <Block title="Shadows (observation only)">
          {shadows.slice(0, 12).map((s) => (
            <p key={s.id} className="font-mono text-xs text-muted">
              {s.symbol} {s.family} {s.direction} · {s.status} · wait {s.waitCode ?? "—"}
              {s.maeR != null ? ` · MAE ${s.maeR.toFixed(2)}R` : ""}
              {s.mfeR != null ? ` · MFE ${s.mfeR.toFixed(2)}R` : ""}
            </p>
          ))}
          {shadows.length === 0 && <p className="text-sm text-subtle">No shadow records this device.</p>}
        </Block>
        <Block title="Timeline">
          {events.slice(0, 16).map((e) => (
            <p key={e.id} className="font-mono text-xs text-muted">
              {new Date(e.at).toISOString().slice(11, 16)} UTC · {e.detail}
            </p>
          ))}
          {events.length === 0 && <p className="text-sm text-subtle">Empty session timeline.</p>}
        </Block>
      </section>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-raised px-4 py-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{title}</p>
      <div className="space-y-1">{children}</div>
    </section>
  );
}
