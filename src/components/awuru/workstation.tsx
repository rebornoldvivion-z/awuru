import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ASSETS, type Asset } from "@/awuru/constants.ts";
import { useSession } from "@/awuru/session.ts";
import { CandleChart } from "@/components/awuru/chart.tsx";
import { WaitPanel } from "@/components/awuru/wait-panel.tsx";
import {
  candidateBanner,
  caption,
  corroborationLine,
  decisionTone,
  healthLabel,
  healthTone,
  researchLine,
} from "@/components/awuru/format.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export function Workstation({ asset }: { asset: Asset }) {
  const setAsset = useSession((s) => s.setAsset);
  const card = useSession((s) => s.cards[asset]);
  const scan = useSession((s) => s.scanDesk);
  const confirm = useSession((s) => s.confirmRelease);
  const reject = useSession((s) => s.rejectCandidate);
  const scanning = useSession((s) => s.scanning);
  const events = useSession((s) => s.events);
  const lifecycle = useSession((s) => s.lifecycle);
  const d = card?.decision;
  const series = card?.bundle?.series["15m"];
  const health = healthLabel(d ?? null, card, scanning && !d);
  const last = series?.candles.at(-1);
  const zone = d?.best?.zone ?? d?.watch?.zone ?? null;
  const inv = d?.geometry?.invalidatorPrice ?? d?.best?.invalidatorPrice ?? d?.watch?.invalidatorPrice ?? null;
  const s1 = card?.bundle?.series["1h"]?.candles.at(-1);
  const s4 = card?.bundle?.series["4h"]?.candles.at(-1);

  useEffect(() => {
    setAsset(asset);
  }, [asset, setAsset]);

  const timeline = [
    ...lifecycle.filter((e) => e.asset === asset).map((e) => ({ id: e.id, at: e.at, detail: `${e.from ?? "—"} → ${e.to} · ${e.reason}` })),
    ...events.filter((e) => e.detail.startsWith(asset) || e.detail.includes(` ${asset} `)).map((e) => ({ id: e.id, at: e.at, detail: e.detail })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 10);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_min(100%,22rem)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ASSETS.map((a) => (
            <Link
              key={a}
              to="/market/$asset"
              params={{ asset: a }}
              className={cn(
                "inline-flex h-11 items-center rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel/60",
                a === asset ? "bg-steel text-bg" : "border border-border",
              )}
            >
              {a === "GOLD" ? "GOLD PROXY" : a}
            </Link>
          ))}
          <Button onClick={() => void scan("manual")} disabled={scanning} className="h-11 px-3 text-xs">
            {scanning ? "Updating…" : "Rescan"}
          </Button>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{caption(card ?? null, asset)}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase", healthTone(health))}>{health}</span>
            {card?.lastObserved && <span className="font-mono text-[10px] uppercase text-wait">Last observed — not live</span>}
            {health === "LIVE" && <span className="font-mono text-[10px] uppercase text-up">LIVE ≠ proven</span>}
          </div>
        </div>
        <CandleChart
          candles={series?.candles ?? []}
          live={series?.live ?? null}
          geometry={d?.geometry ?? null}
          zone={zone}
          invalidator={inv}
          lastClosed={last?.close ?? null}
          lastClosedOpen={last?.openTime ?? null}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Tf
            k="4h context"
            v={d?.htf.h4 ? `${d.htf.h4.bias} · ${d.htf.h4.regime} · ${d.htf.h4.structureRead}` : d?.htf.h4Bias ?? "—"}
            sub={s4 ? `closed ${new Date(s4.openTime).toISOString().slice(11, 16)} UTC` : "forming 4h never used"}
          />
          <Tf
            k="1h tactic"
            v={d?.htf.h1 ? `${d.htf.h1.bias} · ${d.htf.h1.regime} · ${d.htf.h1.structureRead}` : d?.htf.h1Bias ?? "—"}
            sub={s1 ? `closed ${new Date(s1.openTime).toISOString().slice(11, 16)} UTC` : "forming 1h never used"}
          />
          <Tf
            k="15m trigger"
            v={d?.trigger ?? "waiting for next closed bar"}
            sub={last ? `closed ${new Date(last.openTime).toISOString().slice(11, 16)} UTC` : "no closed 15m"}
          />
        </div>
        <p className="text-xs text-subtle">Higher timeframes are context, not proof. Agreement is not an edge. Charting by TradingView Lightweight Charts (Apache-2.0).</p>
        <Panel title="Evidence">
          <Row k="Structure" v={d?.structure ? `${d.structure.read} (${d.structure.pattern})` : "—"} />
          <Row k="Regime" v={d?.regime ? `${d.regime.kind} · ${d.regime.direction} · ADX ${d.regime.adx.toFixed(1)}` : "—"} />
          <Row k="Family" v={d?.family ?? "none"} />
          <Row k="Grade" v={d?.evidenceGrade ?? "—"} />
          <Row k="Why now" v={d?.whyNow ?? "—"} />
          <Row k="Why not" v={d?.whyNot ?? "—"} />
        </Panel>
        <Panel title="Timeline">
          {timeline.length === 0 && <p className="text-sm text-subtle">No recorded transitions yet.</p>}
          {timeline.map((e) => (
            <p key={e.id} className="font-mono text-xs text-muted">
              {new Date(e.at).toISOString().slice(11, 16)} UTC · {e.detail}
            </p>
          ))}
        </Panel>
      </section>
      <aside className="space-y-3">
        <div className={cn("rounded-xl border px-4 py-3", decisionTone(d?.userDecision ?? "WAIT"))}>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em]">Decision</p>
          <p className="mt-1 text-2xl font-medium">{d?.userDecision ?? (scanning ? "…" : "WAIT")}</p>
          <p className="mt-1 font-mono text-[10px] uppercase opacity-80">{candidateBanner(d ?? null, scanning, Boolean(card?.lastObserved))}</p>
          <p className="mt-2 text-sm opacity-90">{d?.waitDetail ?? d?.whyNow ?? "Awaiting closed observation."}</p>
          {d?.blockedByRisk && <p className="mt-2 text-xs">Valid setup — blocked by risk. Not absent.</p>}
        </div>
        <WaitPanel d={d ?? null} card={card} scanning={scanning} />
        <Panel title="Sources">
          <p className="text-sm text-muted">{corroborationLine(d ?? null)}</p>
          <Row k="Primary" v={d?.venue ?? card?.bundle?.venue ?? "—"} />
          <Row k="Instrument" v={d?.instrument ?? "—"} />
          <Row k="Class" v={d?.marketClass ?? "—"} />
        </Panel>
        <Panel title="Research">
          <p className="text-sm text-muted">{researchLine(d ?? null)}</p>
          <p className="mt-2 font-mono text-[10px] uppercase text-subtle">{d?.researchStatus.qualification ?? "NONE"}</p>
        </Panel>
        {d?.kind === "RELEASE" && d.researchStatus.actionable && (
          <Button onClick={() => void confirm()} className="h-11 w-full text-xs">
            Manual confirm (unvalidated)
          </Button>
        )}
        <Button variant="outline" onClick={() => void reject()} className="h-11 w-full text-xs">
          Record reject
        </Button>
        <p className="text-[11px] text-subtle">Reject is a human note. It does not change engine truth.</p>
        <Panel title="Audit">
          <Row k="Wait code" v={d?.waitCode ?? "—"} />
          <Row k="Lifecycle" v={d?.lifecycle ?? "OBSERVING"} />
          <Row k="Family" v={d?.family ?? "none"} />
        </Panel>
      </aside>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-raised px-4 py-3">
      <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{title}</p>
      {children}
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-sm">
      <span className="text-subtle">{k}</span>
      <span className="max-w-[62%] text-right font-mono text-xs">{v}</span>
    </div>
  );
}
function Tf({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <p className="font-mono text-[10px] uppercase text-subtle">{k}</p>
      <p className="mt-1 font-mono text-xs">{v}</p>
      {sub && <p className="mt-1 font-mono text-[10px] text-subtle">{sub}</p>}
    </div>
  );
}
