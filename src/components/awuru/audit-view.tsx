import { BUILD_ID, ENGINE_VERSION, marketCaption } from "@/awuru/constants.ts";
import { useSession } from "@/awuru/session.ts";
import { corroborationLine } from "@/components/awuru/format.ts";

export function AuditView() {
  const d = useSession((s) => s.decision);
  const bundle = useSession((s) => s.bundle);
  const focused = useSession((s) => s.focused);
  const cards = useSession((s) => s.cards);
  const lastObserved = useSession((s) => s.lastObserved);
  const s15 = bundle?.series["15m"]?.candles.at(-1);
  const s1 = bundle?.series["1h"]?.candles.at(-1);
  const s4 = bundle?.series["4h"]?.candles.at(-1);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-subtle">Contract</p>
        <h2 className="text-2xl font-medium tracking-tight">Audit</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Model B. Dumb proxy. Browser decide(). IndexedDB ledger. No daemon. No LLM. No broker. No validated edge.
        </p>
      </div>
      <section className="grid gap-3 md:grid-cols-2">
        <Fact k="Engine" v={ENGINE_VERSION} />
        <Fact k="Build" v={BUILD_ID} />
        <Fact k="Role" v="market-data-proxy + browser intelligence" />
        <Fact k="Session" v={focused ? "focused — refresh at 15m close" : "unfocused — not monitoring"} />
        <Fact k="Gold" v="GOLD PROXY · PAXGUSDT — not XAUUSD" />
        <Fact k="TREND" v="Historically weak / unvalidated" />
        <Fact k="BREAKOUT" v="Quarantined from actionable release" />
        <Fact k="Sources" v="Binance Vision → Kraken → OKX" />
        <Fact k="Corroboration" v={corroborationLine(d ?? null)} />
        <Fact k="Primary venue" v={d?.venue ?? bundle?.venue ?? "—"} />
        <Fact k="Instrument" v={d ? marketCaption(d.asset, d.instrument, d.marketClass) : "—"} />
        <Fact k="15m closed" v={s15 ? new Date(s15.openTime).toISOString() : "—"} />
        <Fact k="1h closed" v={s1 ? new Date(s1.openTime).toISOString() : "—"} />
        <Fact k="4h closed" v={s4 ? new Date(s4.openTime).toISOString() : "—"} />
        <Fact k="Quality" v={d?.quality.state ?? "—"} />
        <Fact k="Wait" v={d?.waitCode ?? "none"} />
        <Fact k="Lifecycle" v={d?.lifecycle ?? "—"} />
        <Fact k="Research" v={d?.researchStatus.qualification ?? "NONE"} />
        <Fact k="First paint" v={lastObserved ? "LAST OBSERVED snapshots" : "fresh tape"} />
      </section>
      <section className="rounded-xl border border-border bg-raised px-4 py-3">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-subtle">Desk snapshots</p>
        {(["BTC", "ETH", "GOLD"] as const).map((a) => {
          const c = cards[a];
          return (
            <p key={a} className="font-mono text-xs text-muted">
              {a === "GOLD" ? "GOLD PROXY · PAXGUSDT" : a} · {c?.decision?.userDecision ?? c?.snapshot?.userDecision ?? "—"} ·{" "}
              {c?.decision?.quality.state ?? c?.snapshot?.quality ?? "—"} · {c?.lastObserved ? "LAST OBSERVED" : "fresh"}
            </p>
          );
        })}
      </section>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-raised px-4 py-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-subtle">{k}</p>
      <p className="mt-1 text-sm">{v}</p>
    </div>
  );
}
