# AWURU v7 — Implementation contract

Frozen. Do not reopen provider research.

Product: **AWURU v7 — Discipline Desk**

Runtime: **Model B** — Vercel/Nitro UI host + dumb public market-data proxy. Browser-only intelligence. IndexedDB ledger.

## Sources (anonymous)

1. PRIMARY `https://data-api.binance.vision` — `/api/v3/klines`, `/api/v3/exchangeInfo` — BTCUSDT ETHUSDT — 15m 1h 4h
2. FALLBACK `https://api.kraken.com/0/public` — OHLC + AssetPairs — XBTUSD ETHUSD
3. BACKUP `https://www.okx.com/api/v5` — market/candles + public/instruments — BTC-USDT ETH-USDT

Do not use `api.binance.com` as primary.

## Public API (data only)

- `GET /api/health`
- `GET /api/bundle?asset=BTC|ETH`

Returns normalized tape, forming/closed split, one-venue bundle, filters, transport errors. Never WAIT/RELEASE.

Browser consumes the bundle and runs `decide()`. If the proxy fails, the browser fetches venues itself.

## ENGINE-VALID CANDLE

`bar_open % interval == 0`
AND `now_utc >= bar_open + interval`
AND OHLC invariants
AND if OKX: `confirm == "1"`

Binance `closeTime` is a schedule, not a close.
Kraken last row is forming.
OKX `confirm == "0"` is forming.

## MTF

Native venue candles. One venue per `decide()`. Parent membership:

`parentOpen = floor(open / interval) * interval`

Usable HTF bar is the last **closed** parent, not the still-open parent of the child.

At 10:15 UTC:

- last closed 15m = 10:00
- last closed 1h = 09:00
- last closed 4h = **04:00** (08:00–12:00 is still open)

At 12:00 UTC last closed 4h = 08:00.

A later brief that listed “4h → 08:00 closed at 10:15” is rejected as look-ahead. Membership of the 10:00 15m bar is the 08:00 4h parent; that parent is not engine-valid until 12:00.

## Quality

LIVE may RELEASE. DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE / SOURCE_SWITCH → WAIT.

## Sizing

`qty = floor(risk_cash / |entry-stop| / step) * step`. Never round up to a minimum. Fail → WAIT_UNSIZEABLE.

Binance: PRICE_FILTER, LOT_SIZE, **NOTIONAL.minNotional**.

Spot. Leverage 1×. BTC and ETH only.

## Fallback

Whole 15m+1h+4h bundle switches. New series id. Never stitch venues. Mixed-venue MTF is INVALID.

## WAIT

Typed: WAIT_DATA, WAIT_HTF, WAIT_DISAGREEMENT, WAIT_RISK, WAIT_UNSIZEABLE, WAIT_SOURCE_TRANSITION, WAIT_REGIME, WAIT_GEOMETRY, WAIT_EVIDENCE, WAIT_GOAL.

## Product

WAIT-first mentor. Manual Scan. Manual RELEASE confirmation. IndexedDB. Four surfaces: Desk, Plan, Journal, Academy.

## Host

Public URL: this Grok app on Vercel (no extra account).

Allowed: Vercel as file host + dumb `/api/*` data proxy.

Forbidden: Vercel Functions as intelligence, cron, Cloudflare Workers, Neon for personal data, broker APIs, LLM in `decide()`.
