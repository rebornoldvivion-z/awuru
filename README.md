# AWURU v7 — Discipline Desk

Personal, session-sovereign, WAIT-first market intelligence for **BTC** and **ETH**.

This is not a broker, not a 24/7 daemon, and not a profit engine. It reads **public closed candles**, runs one deterministic engine in the **browser**, and records WAIT / RELEASE candidates plus a shadow book in **this browser’s IndexedDB**.

## Frozen contract

See `CONTRACT.md` and `ARCHITECTURE.md`.

- **Model B:** Vercel/Nitro serves the UI and a dumb `/api/bundle` proxy
- **Intelligence:** `decide()` in the browser only
- **Assets:** BTC, ETH
- **Timeframes:** native 15m / 1h / 4h from **one venue per decision**
- **Primary data:** `https://data-api.binance.vision` (no key)
- **Fallback:** Kraken public OHLC → OKX public candles
- **Engine-valid candle:** `now >= bar_open + interval`
- **At 10:15 UTC last closed 4h is 04:00**, not 08:00
- **Sizing:** PRICE_FILTER + LOT_SIZE + **NOTIONAL**
- **No API keys, no personal cloud database, no 24/7 workers, no LLM in decide()**

## Engine version

`7.0.0`

## Run

The Grok app host is the live product. Manual **Scan closed bars** is the only trigger.

Public data endpoints on the same host:

- `/api/health`
- `/api/bundle?asset=BTC`
- `/api/bundle?asset=ETH`

## Tests

```
node --experimental-strip-types --test src/awuru/awuru.test.ts src/awuru/tests/contract.test.ts
```

## Limits (accepted)

- No overnight monitoring
- Device-local storage only
- SOL / XAU / OIL are not in v7
- Manual confirmation only — the app never places an order
- `/api/bundle` is a data proxy, not the brain
