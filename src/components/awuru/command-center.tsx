import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ASSETS, ENGINE_VERSION, type Asset } from "@/awuru/constants.ts";
import { useSession } from "@/awuru/session.ts";
import {
  candidateBanner,
  caption,
  currentObservation,
  decisionTone,
  formatClock,
  healthLabel,
  healthTone,
  researchLine,
  thesisAlive,
  watchingLine,
} from "@/components/awuru/format.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

export function CommandCenter() {
  const scan = useSession((s) => s.scanDesk);
  const scanning = useSession((s) => s.scanning);
  const focused = useSession((s) => s.focused);
  const lastObserved = useSession((s) => s.lastObserved);
  const error = useSession((s) => s.error);
  const events = useSession((s) => s.events);
  const nextCloseAt = useSession((s) => s.nextCloseAt);
  const pulse = useSession((s) => s.pulse);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = nextCloseAt ? nextCloseAt - now : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">Level 1 · observation</p>
          <h2 className="text-2xl font-medium tracking-tight">Command center</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Three core markets. Closed candles only. No validated edge. TREND is historically weak. BREAKOUT is quarantined.
          </p>
        </div>
        <Button onClick={() => void scan("manual")} disabled={scanning} className="h-11 px-4 text-xs">
          {scanning ? "Updating…" : "Rescan"}
        </Button>
      </div>

      <section className={cn("grid gap-2 rounded-xl border border-border bg-raised px-4 py-3 sm:grid-cols-2 lg:grid-cols-4", pulse ? "pulse-state" : "")}>
        <Stat k="Session" v={focused ? "Focused · 15m close" : "Unfocused · not monitoring"} />
        <Stat k="Next 15m close" v={`${formatClock(left)} UTC`} />
        <Stat k="Tape" v={lastObserved ? "LAST OBSERVED" : scanning ? "Updating" : "Fresh closed bars"} />
        <Stat k="Engine" v={`${ENGINE_VERSION} · unvalidated`} />
      </section>

      {lastObserved && <p className="font-mono text-[10px] uppercase tracking-wider text-wait">Last observed — cached snapshots are not LIVE</p>}
      {!focused && <p className="font-mono text-[10px] uppercase tracking-wider text-wait">Tab unfocused — not monitoring</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        {ASSETS.map((asset) => (
          <MarketTile key={asset} asset={asset} countdown={formatClock(left)} />
        ))}
      </div>

      <section className="rounded-xl border border-border bg-raised px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">What changed</p>
        <ul className="space-y-1">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="font-mono text-xs text-muted">
              {new Date(e.at).toISOString().slice(11, 16)} UTC · {e.detail}
            </li>
          ))}
          {events.length === 0 && <li className="text-sm text-subtle">No thesis transitions yet this session.</li>}
        </ul>
      </section>

      <p className="text-xs text-subtle">
        Shortcuts: 1 BTC · 2 ETH · 3 GOLD · R rescan · J ledger · ⌘K command. Gold is PAXGUSDT proxy, not XAUUSD. No 24/7 daemon.
      </p>
    </div>
  );
}

function MarketTile({ asset, countdown }: { asset: Asset; countdown: string }) {
  const card = useSession((s) => s.cards[asset]);
  const setAsset = useSession((s) => s.setAsset);
  const d = card?.decision;
  const health = healthLabel(d ?? null, card);
  const decision = d?.userDecision ?? card?.snapshot?.userDecision ?? "WAIT";
  return (
    <Link
      to="/market/$asset"
      params={{ asset }}
      onClick={() => setAsset(asset)}
      className="block rounded-xl border border-border bg-raised p-4 transition-colors hover:border-steel/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{caption(card, asset)}</p>
          <p className={cn("mt-1 text-2xl font-medium", decision === "WAIT" ? "text-wait" : decision === "WATCH" ? "text-steel" : "")}>{decision}</p>
        </div>
        <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase", healthTone(health))}>{health}</span>
      </div>
      <p className={cn("mt-3 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", decisionTone(decision))}>
        {candidateBanner(d ?? null)}
      </p>
      <dl className="mt-3 space-y-1 text-sm">
        <Row k="Current" v={currentObservation(d ?? null, card)} />
        <Row k="Blocker" v={d?.waitDetail ?? card?.snapshot?.waitDetail ?? "—"} />
        <Row k="Watching" v={watchingLine(d ?? null)} />
        <Row k="Thesis" v={`${d?.lifecycle ?? card?.snapshot?.lifecycle ?? "OBSERVING"} · ${thesisAlive(d ?? null, card)}`} />
        <Row k="15m close" v={countdown} />
        <Row k="Changed" v={card?.changeNote ?? "—"} />
      </dl>
      {card?.lastObserved && <p className="mt-2 font-mono text-[10px] uppercase text-wait">Last observed — not live</p>}
      <p className="mt-3 text-xs text-subtle">{researchLine(d ?? null)}</p>
    </Link>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-subtle">{k}</span>
      <span className="max-w-[62%] text-right font-mono text-xs text-fg">{v}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-subtle">{k}</p>
      <p className="mt-1 font-mono text-xs text-fg">{v}</p>
    </div>
  );
}
