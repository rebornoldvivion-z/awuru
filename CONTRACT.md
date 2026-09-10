# AWURU v7 — Implementation contract

Frozen. Do not reopen provider research.

Product: **AWURU v7 — Discipline Desk**  
Engine: **7.3.0** (structural retracement). Historical 7.0–7.2 records stay frozen. Honesty layer is policy, not new math.

Runtime: **Model B** — Vercel/Nitro UI host + dumb public market-data proxy. Browser-only intelligence. IndexedDB ledger.

## Sources (anonymous)

1. PRIMARY `https://data-api.binance.vision` — `/api/v3/klines`, `/api/v3/exchangeInfo` — BTCUSDT ETHUSDT PAXGUSDT — 15m 1h 4h
2. FALLBACK `https://api.kraken.com/0/public` — OHLC + AssetPairs — XBTUSD ETHUSD PAXGUSD
3. BACKUP `https://www.okx.com/api/v5` — market/candles + public/instruments — BTC-USDT ETH-USDT PAXG-USDT

Do not use `api.binance.com` as primary. Do not stitch venues. Do not average candles.

Trend RELEASE requires directional structure (HH/HL long or LH/LL short). Expanding HH+LL is WATCH/WAIT, never a trend SELL/BUY. Prose is generated from the structure object. Stop is the invalidator. RR is computed, not hardcoded to 1.

**Research qualification (honesty layer):**
- TREND may become a user-facing candidate. It is **historically weak / UNVALIDATED**. UI: `CANDIDATE · UNVALIDATED`.
- BREAKOUT remains classified in family metadata. It is **QUARANTINED** from actionable BUY/SELL. Wait code `WAIT_QUARANTINE`.
- Mean reversion is observational only.

## Public API (data only)

- `GET /api/health`
- `GET /api/bundle?asset=BTC|ETH|GOLD`

Returns normalized tape, forming/closed split, one-venue bundle, filters, **source corroboration metadata** (spread, timestamps, SOURCE_AGREEMENT / DIVERGENCE / PRIMARY_ONLY / INSUFFICIENT). Never BUY/SELL/WATCH/WAIT. Never thesis, journal, shadow, or sizing.

## ENGINE-VALID CANDLE

`bar_open % interval == 0` AND `now_utc >= bar_open + interval` AND OHLC invariants AND if OKX: `confirm == "1"`.

## MTF

Native venue candles. One venue per `decide()`. At 10:15 UTC last closed 4h = **04:00**.

HTF stance: SUPPORTIVE / NEUTRAL / OPPOSING. Opposition **downgrades to WATCH**; it does not delete the candidate. Unclosed HTF bars are never used.

## Quality / corroboration

LIVE may RELEASE. DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE / SOURCE_SWITCH → WAIT. SOURCE_DIVERGENCE → WAIT_DIVERGENCE. Corroboration never votes a direction. Cached IndexedDB snapshots paint as **LAST OBSERVED**, never LIVE.

## Lifecycle

OBSERVING → FORMING → WATCH → TRIGGERED → QUALIFIED → CANDIDATE (internal kind may still be RELEASE) → CONFIRMED, or DEGRADED / EXPIRED / INVALIDATED. WATCH is not a trade. WAIT is first-class.

User card: **BUY / SELL / WATCH / WAIT**. BUY/SELL = manual TREND candidate, unvalidated. BREAKOUT cannot occupy BUY/SELL.

## Sizing / risk / goals

Unchanged. Floor-to-step. NEVER round up. Goals never increase size. Valid setup blocked by risk stays visible as blocked.

## Session

While Desk is **focused**, refresh at each 15m close across BTC, ETH, GOLD. Hidden/closed tab is not monitoring. No cron. No 24/7.

Thesis memory in IndexedDB (`thesis:${asset}`). Compare UNCHANGED / STRENGTHENED / WEAKENED / INVALIDATED / REVERSED / NEW_SETUP. DB_VERSION 4 (snapshots + notes).

## Product

WAIT-first command center. Three markets on the home screen. Manual confirmation. **Core markets: BTC, ETH, Gold.** IndexedDB. Surfaces: Desk, Market workstation, Ledger, Audit.

Gold is a core market. Current verified public path is **tokenized gold (PAXG)** labeled `GOLD PROXY · PAXGUSDT` (fallback PAXGUSD / PAXG-USDT). That is not XAUUSD. XAUUSD_SPOT remains a separate identity and is currently UNAVAILABLE. Do not stitch PAXG venues/quotes. SOL and OIL remain POST-V7.

## Host

Vercel/Nitro only. Forbidden: Render, Supabase, Neon, Cloudflare Workers, cron, broker, LLM in `decide()`.
