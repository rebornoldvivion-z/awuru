# AWURU v7 — Architecture

Product: **AWURU v7 — Discipline Desk**  
Engine **7.2.0** — structure-gated trend continuation on Model B. Core markets: **BTC, ETH, GOLD**.

```
USER (Desk focused)
  ↓
VERCEL / NITRO HOST
  ├── application shell
  └── /api/*  dumb public market-data proxy
          ├── venue bundle (one venue, 15m/1h/4h)
          └── corroboration metadata (no strategy)
          ↓
     PUBLIC MARKET VENUES
          ↓
      BROWSER decide()
          ├── regime / structure / families
          ├── candidates + ranking
          ├── lifecycle WATCH → RELEASE
          └── BUY / SELL / WATCH / WAIT
          ↓
      INDEXEDDB (thesis, shadows, missions, risk)
```

While Desk is focused, a timer waits for the next 15m close and re-runs `decide()`. Hidden or closed: **no monitoring**.

## Authority

| Layer | Decision? | User state |
|---|---|---|
| `/api/bundle` | no — tape + corroboration only | no |
| `decide()` in browser | **yes** | no |
| IndexedDB | no | **yes** |

## Not this product

No 24/7 daemon. No Render. No Supabase. No LLM. No broker.
