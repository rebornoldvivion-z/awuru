# AWURU v7 — Discipline Desk

Personal, session-sovereign, WAIT-first market intelligence for **BTC** and **ETH**.

This is not a broker, not a 24/7 daemon, and not a profit engine. It reads **public closed candles**, runs one deterministic engine, and records WAIT / RELEASE candidates plus a shadow book in **this browser’s IndexedDB**.

## Frozen contract

- **Assets:** BTC, ETH
- **Timeframes:** native 15m / 1h / 4h from **one venue per decision**
- **Primary data:** `https://data-api.binance.vision` (no key)
- **Fallback:** Kraken public OHLC → OKX public candles
- **Engine-valid candle:** `now >= bar_open + interval` (OKX also `confirm == "1"`)
- **Binance `closeTime` is a schedule, not a close**
- **Sizing:** PRICE_FILTER + LOT_SIZE + **NOTIONAL** (not MIN_NOTIONAL)
- **No API keys, no cloud database, no workers, no LLM in decide()**

See `CONTRACT.md` for the implementation handoff.

## Engine version

`7.0.0`

## Tests

```
node --experimental-strip-types --test src/awuru/awuru.test.ts
```

## Limits (accepted)

- No overnight monitoring
- Device-local storage only
- SOL / XAU / OIL are not in v7
- Manual confirmation only — the app never places an order
