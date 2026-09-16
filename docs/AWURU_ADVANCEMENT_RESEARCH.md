# AWURU advancement research (master dossier)

**Date:** 2026-09-15/16. Live HTTP proofs + vendor docs.  
**Not implementation.** Companion files:

- [AWURU_ADVANCEMENT_ARCHITECTURE.md](./AWURU_ADVANCEMENT_ARCHITECTURE.md)
- [AWURU_FREE_FIRST_PLAN.md](./AWURU_FREE_FIRST_PLAN.md)
- [AWURU_ASSURANCE_MODEL.md](./AWURU_ASSURANCE_MODEL.md)
- [AWURU_GOLD_RESEARCH.md](./AWURU_GOLD_RESEARCH.md)
- [AWURU_NOTIFICATION_ARCHITECTURE.md](./AWURU_NOTIFICATION_ARCHITECTURE.md)

---

## Baseline (verified in-repo)

- Production: **Model B** Command Center, engine **7.3.0**, build `cc-9f61d40.1`
- Markets: BTC, ETH, GOLD (canonical **PAXGUSDT**)
- TREND historically weak / UNVALIDATED; BREAKOUT QUARANTINED
- Stage 0 serializer + Stage 1 schema artifacts: PASS
- Stage 2: **blocked at Gate A** (no hosted Supabase)
- IndexedDB authoritative; no LLM; no broker execution

What is fundamentally missing: **continuous observation, durable institutional memory, reconstructable qualification, and honest READY — not a smarter EMA.**

---

## Market-data expansion (proven)

Binance Vision REST (anonymous, 200 unless noted):

| Endpoint | PAXGUSDT result | Class |
|---|---|---|
| `/api/v3/klines` | 200 closed 15m | **Engine** |
| `/api/v3/depth?limit=5` | 200 BBO+book | Display / research |
| `/api/v3/ticker/bookTicker` | 200 bid/ask | Display |
| `/api/v3/trades` | 200 | Research |
| `/api/v3/aggTrades` | 200 | Research |
| `/api/v3/ticker/24hr` | 200 | Display |
| `/api/v3/openInterest` | **404** | Spot has no OI |
| WS `wss://data-stream.binance.vision:443/ws/<symbol>@kline_15m` | documented public | Engine ingest |

Kraken: ticker, OHLC, depth, trades — 200. OKX: candles (`confirm`), books, trades — 200. Funding-rate on spot PAXG-USDT → 400.

**Do not put depth/trades into 7.3.0 `decide()`.** They can feed L4 display: spread, book imbalance *proxy*, trade intensity *proxy*. Never claim whale flow or hidden liquidity.

---

## Microstructure (honest)

Useful without lying:

- spread (ask−bid) as friction, not signal
- BBO age as health
- trade intensity vs recent median as *pressure proxy*
- book imbalance top-N as *display*

Not worth complexity until FLOW exists: full L2 forever, liquidations, funding on a spot token.

---

## Macro / news

- Forex Factory unofficial JSON **200**: `https://nfs.faireconomy.media/ff_calendar_thisweek.json` — context only, not a licensed API, not a trigger
- Trading Economics guest calendar: **410 Gone**
- Frankfurter: FX, no metals, no calendar
- News: **omit**. Noise > value for this product

Economic events belong in **context**, never auto-trigger.

---

## Infrastructure (current prices)

**Render** (docs.render.com/free, pricing, cronjobs):

- Free: web (sleeps 15 min), static, Postgres (30-day expiry), KV (memory-only)
- **Workers: not free.** Starter **$7/mo**
- Cron: **$1/mo min**, 12h max — cannot replace a worker
- Hobby workspace $0, 5 GB bandwidth

**Supabase** (pricing + pausing docs):

- Free $0: 500 MB, 5 GB egress, 2M Realtime msgs, 200 conns, pause after **7 days low activity**, Nano compute
- Pro **$25/mo**: never pause, 8 GB, backups 7d, $10 compute credit

**Cloudflare Workers:** Free 10 ms CPU / 100k req/day — not a Binance socket host. Durable Objects can hold WS; still the wrong place vs a $7 Render worker.

**GitHub Actions:** 2,000 min private; public unlimited; 5-min cron best-effort; **60-day schedule disable** on quiet public repos.

---

## Recommendation

**C — Model C minimal paid, worker-first.**

Maximum real capability per dollar is **$7/month** for a never-sleep observer writing a Free Supabase that the worker keeps warm, Model B remaining the public oracle until parity.

Pay **+$25 Pro** when backups and pause-without-worker matter (replay/assurance). Skip paid web until dual-run HTTP is required (previous $39 assumed it on day one).

Do not keep Model B forever: it cannot observe while the tab is closed. Do not buy “advanced” feeds to rescue 7.3.0 TREND.

---

## Frozen

Engine math 7.3.0, closed-bar rule, one-venue MTF, corroboration ≠ vote, no LLM, no self-learning, BREAKOUT quarantine, PAXG as Gold tape, Model B live until parity.

## Possible after freeze

24/7 tape, durable theses, READY overlay, FLOW, reconstructable alerts, Gold UI as GOLD, optional XAU observation adapter, research lab.
