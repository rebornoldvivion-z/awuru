# AWURU v7 — Implementation contract

Frozen. Do not reopen provider research.

Product: **AWURU v7 — Discipline Desk**  
Engine: **7.2.0** (structure-gated trend). Historical 7.0.x / 7.1.x records stay frozen.

Runtime: **Model B** — Vercel/Nitro UI host + dumb public market-data proxy. Browser-only intelligence. IndexedDB ledger.

## Sources (anonymous)

1. PRIMARY `https://data-api.binance.vision` — `/api/v3/klines`, `/api/v3/exchangeInfo` — BTCUSDT ETHUSDT — 15m 1h 4h
2. FALLBACK `https://api.kraken.com/0/public` — OHLC + AssetPairs — XBTUSD ETHUSD
3. BACKUP `https://www.okx.com/api/v5` — market/candles + public/instruments — BTC-USDT ETH-USDT

Do not use `api.binance.com` as primary. Do not stitch venues. Do not average candles.

Trend RELEASE requires directional structure (HH/HL long or LH/LL short). Expanding HH+LL is WATCH/WAIT, never a trend SELL/BUY. Prose is generated from the structure object. Stop is the invalidator. RR is computed, not hardcoded to 1.

## Public API (data only)

- `GET /api/health`
- `GET /api/bundle?asset=BTC|ETH`

Returns normalized tape, forming/closed split, one-venue bundle, filters, **source corroboration metadata** (spread, timestamps, SOURCE_AGREEMENT / DIVERGENCE / PRIMARY_ONLY / INSUFFICIENT). Never BUY/SELL/WATCH/WAIT.

## ENGINE-VALID CANDLE

`bar_open % interval == 0` AND `now_utc >= bar_open + interval` AND OHLC invariants AND if OKX: `confirm == "1"`.

## MTF

Native venue candles. One venue per `decide()`. At 10:15 UTC last closed 4h = **04:00**.

HTF stance: SUPPORTIVE / NEUTRAL / OPPOSING. Opposition **downgrades to WATCH**; it does not delete the candidate. Unclosed HTF bars are never used.

## Quality / corroboration

LIVE may RELEASE. DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE / SOURCE_SWITCH → WAIT. SOURCE_DIVERGENCE → WAIT_DIVERGENCE. Corroboration never votes a direction.

## Lifecycle

FORMING → WATCH → TRIGGERED → RELEASED → CONFIRMED, or EXPIRED / INVALIDATED. WATCH is not a trade.

User card: **BUY / SELL / WATCH / WAIT**. BUY/SELL = manual RELEASE candidate.

## Sizing / risk / goals

Unchanged. Floor-to-step. NEVER round up. Goals never increase size. Valid setup blocked by risk stays visible as blocked.

## Session

While Desk is **focused**, refresh at each 15m close. Hidden/closed tab is not monitoring. No cron. No 24/7.

Thesis memory in IndexedDB. Compare UNCHANGED / STRENGTHENED / WEAKENED / INVALIDATED / REVERSED / NEW_SETUP.

## Product

WAIT-first mentor. Manual confirmation. **Core markets: BTC, ETH, Gold.** IndexedDB. Four surfaces.

Gold is a core market. Current verified public path is **tokenized gold (PAXG)** labeled `GOLD PROXY · PAXGUSDT` (fallback PAXGUSD / PAXG-USDT). That is not XAUUSD. XAUUSD_SPOT remains a separate identity and is currently UNAVAILABLE. Do not stitch PAXG venues/quotes. SOL and OIL remain POST-V7.

## Host

Vercel/Nitro only. Forbidden: Render, Supabase, Neon, Cloudflare Workers, cron, broker, LLM in `decide()`.
