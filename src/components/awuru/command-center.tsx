import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ASSETS, ENGINE_VERSION, type Asset } from "@/awuru/constants.ts";
import { useSession } from "@/awuru/session.ts";
import {
  candidateBanner,
  caption,
  corroborationLine,
  currentObservation,
  decisionTone,
  formatClock,
  healthLabel,
  healthRail,
  healthTone,
  researchLine,
  thesisAlive,
  visibleDecision,
  waitExplanation,
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
  const cards = useSession((s) => s.cards);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const left = nextCloseAt ? nextCloseAt - now : 0;
  const anyFresh = ASSETS.some((a) => cards[a]?.decision && !cards[a]?.lastObserved);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-subtle">Observation</p>
          <h2 className="text-2xl font-medium tracking-tight">Command center</h2>
          <p className="mt-1 text-sm text-muted">
            BTC, ETH, and Gold. Closed candles only. TREND is historically weak / unvalidated. BREAKOUT is quarantined.
          </p>
        </div>
        <Button onClick={() => void scan("manual")} disabled={scanning} className="h-11 px-4 text-xs">
          {scanning ? "Updating…" : "Rescan"}
        </Button>
      </div>

      <section
        className={cn(
          "grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4",
          pulse ? "pulse-state" : "",
        )}
      >
        <Stat k="Tab" v={focused ? "Focused · refresh at 15m close" : "Unfocused · not monitoring"} />
        <Stat k="Next 15m close" v={`${formatClock(left)} UTC`} />
        <Stat
          k="Tape"
          v={
            scanning && !anyFresh
              ? "Updating closed tape"
              : lastObserved && !anyFresh
                ? "LAST OBSERVED"
                : error
                  ? "Fresh observation unavailable"
                  : "Fresh closed bars"
          }
        />
        <Stat k="Engine" v={`${ENGINE_VERSION} · unvalidated`} />
      </section>

      {lastObserved && !anyFresh && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-wait">Last observed — cached snapshots are not LIVE</p>
      )}
      {!focused && <p className="font-mono text-[10px] uppercase tracking-wider text-wait">Tab unfocused — not monitoring overnight</p>}
      {error && (
        <p className="text-sm text-danger">
          {error}. {anyFresh || lastObserved ? "Prior observation remains on screen." : "No closed tape to show yet."}
        </p>
      )}
      {scanning && !anyFresh && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Loading closed 15m / 1h / 4h — not a WAIT decision.</p>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-raised">
        <div className="grid md:grid-cols-3 md:divide-x md:divide-border">
          {ASSETS.map((asset) => (
            <MarketTile key={asset} asset={asset} countdown={formatClock(left)} scanning={scanning} />
          ))}
        </div>
      </section>

      <section>
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">What changed</p>
        <ul className="space-y-1">
          {events.slice(0, 8).map((e) => (
            <li key={e.id} className="font-mono text-xs text-muted">
              {new Date(e.at).toISOString().slice(11, 16)} UTC · {e.detail}
            </li>
          ))}
          {events.length === 0 && <li className="text-sm text-subtle">Quiet session — no thesis transitions yet. Quiet is a valid state.</li>}
        </ul>
      </section>

      <p className="text-xs text-subtle">
        1 BTC · 2 ETH · 3 GOLD PROXY · PAXGUSDT · R rescan · J ledger · ⌘K. Gold is PAXGUSDT proxy, not XAUUSD. No 24/7 daemon.
      </p>
    </div>
  );
}

function MarketTile({ asset, countdown, scanning }: { asset: Asset; countdown: string; scanning: boolean }) {
  const card = useSession((s) => s.cards[asset]);
  const setAsset = useSession((s) => s.setAsset);
  const d = card?.decision;
  const health = healthLabel(d ?? null, card, scanning && !d && !card?.snapshot);
  const decision = visibleDecision(d ?? null, card, scanning && !d && !card?.snapshot);
  return (
    <Link
      to="/market/$asset"
      params={{ asset }}
      onClick={() => setAsset(asset)}
      className="relative block p-4 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steel/60"
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", healthRail(health))} aria-hidden />
      <div className="flex items-start justify-between gap-2 pl-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">{caption(card, asset)}</p>
          <p className={cn("mt-1 text-2xl font-medium", decision === "WAIT" || decision === "…" ? "text-wait" : decision === "WATCH" ? "text-steel" : "")}>
            {decision}
          </p>
        </div>
        <span className={cn("rounded-full border px-2 py-1 font-mono text-[10px] uppercase", healthTone(health))}>{health}</span>
      </div>
      <p className={cn("mt-3 ml-2 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase", decisionTone(decision === "…" ? "WAIT" : decision))}>
        {candidateBanner(d ?? null, scanning, Boolean(card?.lastObserved))}
      </p>
      <dl className="mt-3 ml-2 space-y-1 text-sm">
        <Row k="Why" v={currentObservation(d ?? null, card)} />
        <Row k="Waiting" v={waitExplanation(d ?? null, scanning, Boolean(card?.lastObserved))} />
        <Row k="Watching" v={watchingLine(d ?? null)} />
        <Row k="Thesis" v={`${d?.lifecycle ?? card?.snapshot?.lifecycle ?? "OBSERVING"} · ${thesisAlive(d ?? null, card)}`} />
        <Row k="Sources" v={corroborationLine(d ?? null)} />
        <Row k="15m close" v={countdown} />
        <Row k="Changed" v={card?.changeNote ?? "—"} />
      </dl>
      {card?.lastObserved && <p className="mt-2 ml-2 font-mono text-[10px] uppercase text-wait">Last observed — not live</p>}
      <p className="mt-3 ml-2 text-xs text-subtle">{researchLine(d ?? null)}</p>
    </Link>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="shrink-0 text-subtle">{k}</span>
      <span className="max-w-[68%] text-right font-mono text-xs text-fg">{v}</span>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-raised px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-subtle">{k}</p>
      <p className="mt-1 font-mono text-xs text-fg">{v}</p>
    </div>
  );
}
