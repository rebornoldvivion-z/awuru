# AWURU v7 — Architecture

Product: **AWURU v7 — Discipline Desk**

Frozen runtime: **Model B**.

```
USER
  ↓
VERCEL / NITRO HOST
  ├── application shell (HTML/JS/CSS)
  └── /api/*  dumb public market-data proxy
          ↓
     PUBLIC MARKET VENUES
     Binance Vision → Kraken → OKX
          ↓
      BROWSER
          ↓
       decide()
          ↓
      INDEXEDDB
```

## Authority

| Layer | Executes | Persistent | Server function | Decision authority | User state |
|---|---|---|---|---|---|
| Vercel host | CDN + Nitro | no | serves files | no | no |
| `/api/health` `/api/bundle` | server route | no | yes (data only) | no | no |
| Public venues | third party | their tape | no | no | no |
| `decide()` | browser | no | no | **yes** | no |
| IndexedDB `awuru-v7` | this device | yes | no | no | **yes** |

## Source layout

```
src/awuru/
  domain/        types, constants, time
  market/        venues, candles, filters, quality, proxy, browser fallback
  engine/        indicators, families, geometry, ids, decide()
  risk/          ledger checks, sizing
  shadow/        frozen rejected geometry
  persistence/   IndexedDB + memory ledger for tests
  tests/
src/routes/api/  /api/health /api/bundle
src/components/awuru/  Desk, Plan, Journal, Academy, chart
```

The engine has no React imports.

## Proxy contract

`/api/bundle` may normalize OHLC, split forming/closed, switch a whole venue bundle, and attach filters.

It must not compute indicators, families, geometry, risk, size, WAIT, or RELEASE.

If the proxy fails, the browser fetches the same public venues directly.

## Closed-bar mapping (verified)

At **10:15 UTC**:

- last closed 15m open = **10:00**
- last closed 1h open = **09:00**
- last closed 4h open = **04:00**

The 08:00 4h candle is still open until 12:00. Parent membership is not the same as engine-usable.

At **12:00 UTC** the 08:00 4h bar becomes closed.

## Forbidden

Cloudflare Workers, Neon, Supabase, Render, GitHub Actions scheduler, Redis, Telegram, xAI, broker APIs, 24/7 daemon, SOL/XAU/OIL, 50 strategies, second brain, `decide()` on the server.
