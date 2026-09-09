# AWURU v7 — Implementation contract

Frozen. Do not reopen provider research.

## Sources (anonymous)

1. PRIMARY `https://data-api.binance.vision` — `/api/v3/klines`, `/api/v3/exchangeInfo` — BTCUSDT ETHUSDT — 15m 1h 4h
2. FALLBACK `https://api.kraken.com/0/public` — OHLC + AssetPairs — XBTUSD ETHUSD
3. BACKUP `https://www.okx.com/api/v5` — market/candles + public/instruments — BTC-USDT ETH-USDT

Do not use `api.binance.com` as primary.

## ENGINE-VALID CANDLE

`bar_open % interval == 0`
AND `now_utc >= bar_open + interval`
AND OHLC invariants
AND if OKX: `confirm == "1"`

## MTF

Native venue candles. One venue per `decide()`. Parent = `floor(open / interval) * interval`.

At 10:15 UTC:

- last closed 15m = 10:00
- last closed 1h = 09:00
- last closed 4h = **04:00** (08:00–12:00 is still open)

## Quality

LIVE may RELEASE. DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE / SOURCE_SWITCH → WAIT.

## Sizing

`qty = floor(risk_cash / |entry-stop| / step) * step`. Never round up to a minimum. Fail → WAIT_UNSIZEABLE.

Binance: PRICE_FILTER, LOT_SIZE, **NOTIONAL.minNotional**.

## Fallback

Whole 15m+1h+4h bundle switches. New series id. Never stitch venues.

## Product

WAIT-first mentor. Manual RELEASE. IndexedDB. Four surfaces: Desk, Plan, Journal, Academy.

Rejected: Cloudflare Workers, Neon, Supabase, Render, Vercel Functions, xAI, cron, broker APIs, 50 cloned strategies, two brains.
