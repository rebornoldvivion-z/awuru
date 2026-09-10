# AWURU v7 — Architecture

Product: **AWURU v7 — Discipline Desk**  
Engine **7.3.0** — zone/retrace/trigger on Model B, plus an honesty policy layer. Core markets: **BTC, ETH, GOLD**.

```
USER (Desk focused)
  ↓
VERCEL / NITRO HOST
  ├── Command Center / Workstation / Ledger / Audit
  └── /api/*  dumb public market-data proxy
          ├── venue bundle (one venue, 15m/1h/4h)
          └── corroboration metadata (no strategy)
          ↓
     PUBLIC MARKET VENUES
          ↓
      BROWSER decide()
          ├── regime / structure / families (math frozen)
          ├── honesty: TREND only actionable; BREAKOUT quarantined
          ├── candidates + ranking
          ├── lifecycle OBSERVING → CANDIDATE
          └── BUY / SELL / WATCH / WAIT
          ↓
      INDEXEDDB (thesis:${asset}, snapshots, notes, shadows, missions, risk)
```

While Desk is focused, a timer waits for the next 15m close and re-runs `decide()` for all three markets. Hidden or closed: **no monitoring**.

## Authority

| Layer | Decision? | User state |
|---|---|---|
| `/api/bundle` | no — tape + corroboration only | no |
| `decide()` in browser | **yes** | no |
| Honesty policy (`isActionableFamily`) | release eligibility | no |
| IndexedDB | no | **yes** |

## Research status (not a new engine)

| Family | Qualification | Actionable BUY/SELL |
|---|---|---|
| trend | UNVALIDATED / historically weak | yes, labeled CANDIDATE · UNVALIDATED |
| breakout | QUARANTINED | never |
| mean_reversion | OBSERVATION | never |

## Gold

`GOLD PROXY · PAXGUSDT` on Binance Vision. Fallback PAXGUSD / PAXG-USDT. Not XAUUSD.

## Not this product

No 24/7 daemon. No Render. No Supabase. No Neon. No LLM. No broker. No validated trading edge.
