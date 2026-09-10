import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, LayoutGrid, NotebookPen, ScanLine, Shield } from "lucide-react";
import { ASSETS, ENGINE_VERSION, PERSONA_POLICY, PERSONAS, marketCaption, type Asset, type Persona } from "@/awuru/constants.ts";
import { familyLabel } from "@/awuru/families.ts";
import { useSession } from "@/awuru/session.ts";
import { formatClock, formatUtc } from "@/awuru/time.ts";
import type { Candle, Decision, Mission, MtfBundle, Profile, RiskDay, Shadow, StoredSignal } from "@/awuru/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { CandleChart } from "@/components/awuru/chart.tsx";
import { ThesisCard } from "@/components/awuru/thesis-card.tsx";
import { cn } from "@/lib/utils.ts";

type Surface = "desk" | "plan" | "journal" | "academy";

function qualityTone(state: string) {
  if (state === "LIVE") return "text-up border-up/40 bg-up/10";
  if (state === "UNAVAILABLE" || state === "INVALID") return "text-danger border-danger/40 bg-danger/10";
  return "text-wait border-wait/40 bg-wait/10";
}

function decisionTone(d: string) {
  if (d === "BUY") return "text-up border-up/40 bg-up/10";
  if (d === "SELL") return "text-danger border-danger/40 bg-danger/10";
  if (d === "WATCH") return "text-steel border-steel/40 bg-steel/10";
  return "text-wait border-wait/40 bg-wait/10";
}

export function DeskApp({ surface }: { surface: Surface }) {
  const ready = useSession((s) => s.ready);
  const hydrate = useSession((s) => s.hydrate);
  const profile = useSession((s) => s.profile);
  const riskDay = useSession((s) => s.riskDay);
  const asset = useSession((s) => s.asset);
  const setAsset = useSession((s) => s.setAsset);
  const scanning = useSession((s) => s.scanning);
  const scan = useSession((s) => s.scan);
  const decision = useSession((s) => s.decision);
  const bundle = useSession((s) => s.bundle);
  const error = useSession((s) => s.error);
  const now = useSession((s) => s.now);
  const persona = profile?.persona ?? "Orion";
  const missions = useSession((s) => s.missions);
  const shadows = useSession((s) => s.shadows);
  const signals = useSession((s) => s.signals);
  const events = useSession((s) => s.events);
  const storageOk = useSession((s) => s.storageOk);
  const dataSource = useSession((s) => s.dataSource);
  const savePersona = useSession((s) => s.savePersona);
  const saveGoal = useSession((s) => s.saveGoal);
  const confirmRelease = useSession((s) => s.confirmRelease);
  const setFocused = useSession((s) => s.setFocused);
  const changeNote = useSession((s) => s.changeNote);
  const nextCloseAt = useSession((s) => s.nextCloseAt);

  useEffect(() => {
    if (!ready) void hydrate();
  }, [ready, hydrate]);

  useEffect(() => {
    const onVis = () => setFocused(document.visibilityState === "visible");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      setFocused(false);
    };
  }, [setFocused]);

  const series = bundle?.series["15m"];
  const last = series?.candles[series.candles.length - 1] ?? null;
  const live = series?.live ?? null;
  const activeMission = missions.find((m) => m.status === "open");
  const fallbackProfile: Profile = {
    id: "profile",
    persona: "Orion",
    equity: 10_000,
    goalTarget: null,
    goalDeadline: null,
    createdAt: 0,
    updatedAt: 0,
  };
  const fallbackRisk: RiskDay = { day: "—", realizedR: 0, openR: 0, trades: 0, consecutiveLosses: 0 };

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border px-4 py-3 md:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-steel">Discipline desk</p>
            <h1 className="text-lg font-medium tracking-tight md:text-xl">AWURU v7</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider", decisionTone(decision?.userDecision ?? "WAIT"))}>
              {decision?.userDecision ?? "—"}
            </span>
            <span className={cn("rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider", qualityTone(decision?.quality.state ?? "UNAVAILABLE"))}>
              {decision?.quality.state ?? "—"}
            </span>
            <span className="hidden font-mono text-[10px] text-subtle sm:inline">{ENGINE_VERSION}</span>
            <a
              href="/api/health"
              className={cn(
                "hidden rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider sm:inline",
                dataSource === "server"
                  ? "border-up/40 bg-up/10 text-up"
                  : dataSource === "client"
                    ? "border-wait/40 bg-wait/10 text-wait"
                    : "border-border text-subtle",
              )}
            >
              {dataSource === "server" ? "backend live" : dataSource === "client" ? "client fallback" : "backend"}
            </a>
          </div>
        </div>
        <nav className="mx-auto mt-3 flex max-w-7xl gap-1">
          <NavLink to="/" label="Desk" icon={<LayoutGrid className="size-4" />} active={surface === "desk"} />
          <NavLink to="/plan" label="Plan" icon={<ScanLine className="size-4" />} active={surface === "plan"} />
          <NavLink to="/journal" label="Journal" icon={<NotebookPen className="size-4" />} active={surface === "journal"} />
          <NavLink to="/academy" label="Academy" icon={<BookOpen className="size-4" />} active={surface === "academy"} />
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 md:px-6 md:py-8">
        {surface === "desk" && (
          <DeskSurface
            asset={asset}
            setAsset={setAsset}
            scanning={scanning || !ready}
            onScan={() => void scan("manual")}
            decision={decision}
            bundle={bundle}
            last={last}
            live={live}
            candles={series?.candles ?? []}
            error={error}
            now={now}
            riskDay={riskDay ?? fallbackRisk}
            persona={persona}
            activeMission={activeMission}
            storageOk={storageOk}
            dataSource={dataSource}
            changeNote={changeNote}
            nextCloseAt={nextCloseAt}
            shadows={shadows}
          />
        )}
        {surface === "plan" && (
          <PlanSurface
            profile={profile ?? fallbackProfile}
            decision={decision}
            riskDay={riskDay ?? fallbackRisk}
            onPersona={(p) => void savePersona(p)}
            onGoal={(e, t, dl) => void saveGoal(e, t, dl)}
            onConfirm={() => void confirmRelease()}
            missions={missions}
          />
        )}
        {surface === "journal" && (
          <JournalSurface
            missions={missions}
            shadows={shadows}
            signals={signals}
            events={events}
            riskDay={riskDay ?? fallbackRisk}
          />
        )}
        {surface === "academy" && <AcademySurface />}
      </main>
    </div>
  );
}

function NavLink({
  to,
  label,
  icon,
  active,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "flex h-11 flex-1 items-center justify-center gap-2 rounded-lg text-sm font-medium md:flex-none md:px-4",
        active ? "bg-raised text-fg" : "text-muted hover:bg-surface hover:text-fg",
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
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
      <span className="font-mono text-right text-fg">{v}</span>
    </div>
  );
}

function DeskSurface(props: {
  asset: Asset;
  setAsset: (a: Asset) => void;
  scanning: boolean;
  onScan: () => void;
  decision: Decision | null;
  bundle: MtfBundle | null;
  last: Candle | null;
  live: Candle | null;
  candles: Candle[];
  error: string | null;
  now: number;
  riskDay: RiskDay;
  persona: Persona;
  activeMission: Mission | undefined;
  storageOk: boolean;
  dataSource: "server" | "client" | null;
  changeNote: string | null;
  nextCloseAt: number | null;
  shadows: Shadow[];
}) {
  const d = props.decision;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {ASSETS.map((a) => (
            <Button key={a} size="sm" variant={props.asset === a ? "steel" : "outline"} onClick={() => props.setAsset(a)}>
              {a}
            </Button>
          ))}
          <Button size="sm" variant="steel" onClick={props.onScan} disabled={props.scanning}>
            {props.scanning ? "Updating…" : "Scan closed bars"}
          </Button>
          <p className="font-mono text-xs text-muted">
            {props.bundle
              ? `${marketCaption(props.bundle.asset, props.bundle.instrument, props.bundle.marketClass)} · ${props.bundle.venue}`
              : "no venue"}
            {props.nextCloseAt ? ` · next close ${formatClock(props.nextCloseAt)}` : ""}
          </p>
        </div>
        {!props.storageOk && (
          <p className="rounded-lg border border-wait/40 bg-wait/10 px-3 py-2 text-sm text-wait">
            IndexedDB is unavailable. Decisions will not persist across refresh.
          </p>
        )}
        {props.error && (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{props.error}</p>
        )}
        <CandleChart candles={props.candles} live={props.live} geometry={d?.geometry ?? null} />
        <p className="text-xs text-subtle">
          Charting by TradingView Lightweight Charts (Apache-2.0). Live wick is never engine input. While this tab is focused, analysis refreshes at each 15m close. Closed is not monitored.
        </p>
        <Panel title="Families">
          {(d?.families.length ? d.families : []).map((f) => (
            <div key={f.family} className="border-t border-border py-2 first:border-0">
              <div className="flex items-center justify-between gap-2">
                <span>{familyLabel(f.family)}</span>
                <span className="font-mono text-xs uppercase text-muted">
                  {f.eligible ? f.direction : "flat"} · {f.grade}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{f.reasons[0]}</p>
            </div>
          ))}
          {!d?.families.length && <p className="text-sm text-muted">Analysis fills after the first closed-bar load.</p>}
        </Panel>
      </section>
      <aside className="space-y-3">
        <Panel title="Market">
          <Row k="Market" v={props.bundle ? marketCaption(props.bundle.asset, props.bundle.instrument, props.bundle.marketClass) : "—"} />
          <Row k="Instrument" v={props.bundle?.instrument ?? "—"} />
          <Row k="Feed" v={props.bundle ? `${props.bundle.venue} · ${props.bundle.symbol}` : "—"} />
          <Row k="Backend" v={props.dataSource === "server" ? "LIVE proxy" : props.dataSource === "client" ? "browser fallback" : "—"} />
          <Row k="Corroboration" v={d?.corroboration?.status ?? "—"} />
          <Row k="Spread" v={d?.corroboration?.spreadPct != null ? `${(d.corroboration.spreadPct * 100).toFixed(2)}%` : "—"} />
          <Row k="Quality" v={d?.quality.state ?? "—"} />
          <Row k="Last closed 15m" v={props.last ? formatUtc(props.last.openTime) : "—"} />
          <Row k="Closed close" v={props.last ? props.last.close.toLocaleString() : "—"} />
          <Row k="HTF" v={`${d?.htf.h1Bias ?? "—"} / ${d?.htf.h4Bias ?? "—"}`} />
          {props.activeMission && (
            <p className="mt-2 text-sm text-steel">
              Open mission {props.activeMission.symbol} {props.activeMission.direction}
            </p>
          )}
        </Panel>
        <ThesisCard
          decision={d}
          changeNote={props.changeNote}
          shadows={props.shadows}
          persona={props.persona}
          riskDay={props.riskDay}
        />
      </aside>
    </div>
  );
}

function PlanSurface(props: {
  profile: Profile;
  decision: Decision | null;
  riskDay: RiskDay;
  onPersona: (p: Persona) => void;
  onGoal: (equity: number, target: number | null, deadline: string | null) => void;
  onConfirm: () => void;
  missions: Mission[];
}) {
  const [equity, setEquity] = useState(String(props.profile.equity));
  const [target, setTarget] = useState(props.profile.goalTarget ? String(props.profile.goalTarget) : "");
  const [deadline, setDeadline] = useState(props.profile.goalDeadline ?? "");
  const d = props.decision;
  const policy = PERSONA_POLICY[props.profile.persona];
  const already = props.missions.some((m) => m.signalId === d?.signalId);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Account">
        <p className="mb-3 text-sm text-muted">Persona is stored. It is never inferred from a name. Apex cannot bypass WAIT.</p>
        <div className="flex flex-wrap gap-2">
          {PERSONAS.map((p) => (
            <Button key={p} size="sm" variant={props.profile.persona === p ? "default" : "outline"} onClick={() => props.onPersona(p)}>
              {p}
            </Button>
          ))}
        </div>
        <div className="mt-4 space-y-1">
          <Row k="Risk %" v={`${(policy.riskPct * 100).toFixed(2)}%`} />
          <Row k="Min evidence" v={policy.minEvidence} />
          <Row k="Daily R cap" v={String(policy.dailyR)} />
          <Row k="Max trades" v={String(policy.maxTrades)} />
          <Row k="Today" v={props.riskDay.day} />
        </div>
        <label className="mt-4 block text-xs uppercase tracking-wider text-subtle">Equity</label>
        <input className="mt-1 h-11 w-full rounded-md border border-border bg-raised px-3 font-mono text-sm" value={equity} onChange={(e) => setEquity(e.target.value)} />
        <label className="mt-3 block text-xs uppercase tracking-wider text-subtle">Goal target (optional)</label>
        <input className="mt-1 h-11 w-full rounded-md border border-border bg-raised px-3 font-mono text-sm" value={target} onChange={(e) => setTarget(e.target.value)} />
        <label className="mt-3 block text-xs uppercase tracking-wider text-subtle">Deadline</label>
        <input type="date" className="mt-1 h-11 w-full rounded-md border border-border bg-raised px-3 font-mono text-sm" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        <Button className="mt-4" variant="outline" onClick={() => props.onGoal(Number(equity) || props.profile.equity, target ? Number(target) : null, deadline || null)}>
          Save constraints
        </Button>
        <p className="mt-2 text-xs text-subtle">Goals never increase size. Near a deadline the desk only tightens.</p>
      </Panel>
      <Panel title="Released plan">
        {d?.kind === "RELEASE" && d.geometry && d.size && d.size.ok ? (
          <div className="space-y-2">
            <p className="font-mono text-sm uppercase">
              {d.userDecision} {d.symbol} · {d.family} · {d.evidenceGrade}
            </p>
            <Row k="Venue" v={d.venue ?? ""} />
            <Row k="Entry" v={String(d.geometry.entry)} />
            <Row k="Stop" v={String(d.geometry.stop)} />
            <Row k="TP1 / 2 / 3" v={`${d.geometry.tp1} / ${d.geometry.tp2} / ${d.geometry.tp3}`} />
            <Row k="Qty" v={String(d.size.qty)} />
            <Row k="Risk cash" v={d.size.riskCash.toFixed(2)} />
            <Row k="Quality" v={d.quality.state} />
            <p className="pt-2 text-sm text-muted">This is a candidate. AWURU does not place orders. Confirming records a personal mission on this device.</p>
            <Button className="mt-2" onClick={props.onConfirm} disabled={already}>
              {already ? "Already confirmed" : `Confirm ${d.userDecision}`}
            </Button>
          </div>
        ) : (
          <div>
            <p className="font-mono text-sm uppercase">{d?.userDecision ?? "WAIT"} · {d?.waitCode ?? ""}</p>
            <p className="mt-2 text-sm text-muted">{d?.waitDetail ?? "Scan the desk first. BUY/SELL is only offered on LIVE closed bars that pass every gate."}</p>
            {d?.watch && <p className="mt-2 text-sm text-steel">Watching {d.watch.family} {d.watch.direction}. Trigger: {d.watch.trigger}</p>}
          </div>
        )}
      </Panel>
    </div>
  );
}

function JournalSurface(props: {
  missions: Mission[];
  shadows: Shadow[];
  signals: StoredSignal[];
  events: { id: string; at: number; type: string; detail: string }[];
  riskDay: RiskDay;
}) {
  const waitCounts = props.signals
    .filter((s) => s.decision.kind === "WAIT")
    .reduce<Record<string, number>>((acc, s) => {
      const k = s.decision.waitCode ?? "WAIT";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Missions">
        {!props.missions.length && <p className="text-sm text-muted">No confirmed missions on this device.</p>}
        {props.missions.map((m) => (
          <div key={m.id} className="border-t border-border py-3 first:border-0">
            <p className="font-mono text-sm">
              {m.symbol} {m.direction} · {m.status}
            </p>
            <p className="text-xs text-muted">
              {m.symbol.includes("PAXG") ? "GOLD PROXY · " : ""}
              {m.venue} · {m.symbol} · R {m.realizedR ?? "open"} · {m.engineVersion}
            </p>
          </div>
        ))}
      </Panel>
      <Panel title="Shadow book">
        <p className="mb-2 text-xs text-muted">Rejected geometry stays frozen. Same-bar SL and TP resolves SL-first.</p>
        {!props.shadows.length && <p className="text-sm text-muted">No shadows yet.</p>}
        {props.shadows.slice(0, 12).map((s) => (
          <div key={s.id} className="border-t border-border py-3 first:border-0">
            <p className="font-mono text-sm">
              {s.symbol} {s.direction} · {s.status}
            </p>
            <p className="text-xs text-muted">
              {s.symbol.includes("PAXG") ? "GOLD PROXY · " : ""}
              {s.waitCode} · {s.family} · {s.venue} · {s.symbol} · {s.engineVersion}
            </p>
          </div>
        ))}
      </Panel>
      <Panel title="Discipline">
        <Row k="UTC day" v={props.riskDay.day} />
        <Row k="Realized R" v={String(props.riskDay.realizedR)} />
        <Row k="Open R" v={String(props.riskDay.openR)} />
        <Row k="Trades" v={String(props.riskDay.trades)} />
        <Row k="Consecutive losses" v={String(props.riskDay.consecutiveLosses)} />
        <div className="mt-3 space-y-1">
          {Object.entries(waitCounts).map(([k, n]) => (
            <Row key={k} k={k} v={String(n)} />
          ))}
        </div>
      </Panel>
      <Panel title="Events">
        {props.events.slice(0, 10).map((e) => (
          <p key={e.id} className="border-t border-border py-2 font-mono text-xs text-muted first:border-0">
            {e.type}: {e.detail}
          </p>
        ))}
        {!props.events.length && <p className="text-sm text-muted">Quiet ledger.</p>}
      </Panel>
    </div>
  );
}

function AcademySurface() {
  const items = [
    { t: "WAIT is the product", b: "A blocked setup is a complete answer. Typed reasons name the actual gate. WATCH is not a trade." },
    { t: "Closed candles only", b: "The engine uses a bar only when now is at or after bar open plus the interval. Binance closeTime is a schedule, not a close. The forming wick on the chart is display-only." },
    { t: "Native MTF, one venue", b: "15m, 1h and 4h come from a single venue. At 10:15 UTC the last closed 4h is 04:00. HTF opposition downgrades a candidate to WATCH instead of deleting it." },
    { t: "Corroboration is not a vote", b: "Binance, Kraken and OKX are compared for spread and timestamps. They never vote BUY. Divergence is WAIT. Histories are never stitched." },
    { t: "Session, not a daemon", b: "While Desk is focused, analysis refreshes at each 15m close. When the tab is hidden or closed, AWURU is not watching the market." },
    { t: "Gold is a core market", b: "BTC, ETH, and Gold are always on the desk. Current free/public Gold is tokenized PAXG, labeled GOLD PROXY. That is not XAUUSD spot. XAUUSD remains a separate identity and is currently unavailable without a new account." },
    { t: "What this is not", b: "Not a broker. Not 24/7 monitoring. Not a profit guarantee. Not an LLM decider. SOL and OIL remain post-v7." },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {items.map((x) => (
        <Panel key={x.t} title={x.t}>
          <p className="text-sm leading-relaxed text-muted">{x.b}</p>
        </Panel>
      ))}
      <p className="flex items-center gap-2 text-xs text-subtle">
        <Shield className="size-3.5" /> Public market data. No API keys. Engine {ENGINE_VERSION}.
      </p>
    </div>
  );
}
