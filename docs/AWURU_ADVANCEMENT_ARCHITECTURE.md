# AWURU advancement architecture (freeze proposal)

**Choice:** **C — Model C minimal paid** (worker-first).  
**Engine:** 7.3.0 frozen (PRODUCTION_UNVALIDATED).  
**Public product until cutover:** Model B Command Center.  
**Do not implement until this freeze is accepted.**

This supersedes the earlier “always buy $7 web + $25 Pro on day one” packaging. The **scientific** Model C shape is unchanged; the **spend order** is stricter.

---

## 1. Product identity

AWURU is a **persistent market-intelligence operating system**, not a signal shop.

It observes, remembers, reconstructs, qualifies, alerts on transitions, and keeps a hard boundary between observation, qualification, research evidence, and human action.

It does **not** self-learn. Strategy change is **research evolution** through a gated engine version.

---

## 2. Diagram (target)

```
                 [ optional Cloudflare DNS ]
                            |
                 PUBLIC UI  (existing Model B host until cutover)
                 SPA + /api/bundle + /api/health
                            |
                            |  dual-run later reads
                            v
                 SUPABASE POSTGRES
                 canonical tape / market_state / theses
                 events / decisions / research / user
                            ^
                            |
                 RENDER BACKGROUND WORKER  ($7 Starter)
                 Binance WS (vision) + Kraken/OKX corroboration
                 validate → canonical closed tape → decide(7.3.0)
                 qualification matrix → events
                            |
                 SUPABASE REALTIME Broadcast  (later stage)
                 market:{asset}  system:health  user:{uid}
```

No Render Postgres. No Render KV. No Redis. No LLM in `decide()`. No mixed-venue MTF.

---

## 3. Layered intelligence (not a score)

```
L1 DATA            closed ENGINE-VALID tape + quality
L2 STRUCTURE       7.3.0 geometry / regime / structure
L3 CONTEXT         HTF stance, corroboration, optional Gold XAU spread
L4 MICROSTRUCTURE  display/research only (BBO, trades, book)
L5 THESIS          durable per-asset object
L6 QUALIFICATION   assurance matrix → READY overlay
L7 RISK            persona / size / budget
L8 RESEARCH        UNVALIDATED / QUARANTINED / … / STRATEGY_VALIDATED
L9 USER            manual confirm
```

L4 must not enter production `decide()` until a future engine version is approved.

No `Confidence: 92%`.

---

## 4. Authority

| Question | Answer |
|---|---|
| Who observes 24/7? | Render worker (after Gate A + tape parity) |
| Who runs production `decide()` today? | Browser (Model B) |
| Who runs it after Stage 4? | Worker, **same TypeScript module** |
| Who stores canonical tape? | Supabase Postgres |
| Who confirms a trade? | The human |
| Who mutates thresholds from PnL? | Nobody |
| Gold canonical instrument | PAXGUSDT |
| Gold UI name | GOLD |
| TREND | UNVALIDATED |
| BREAKOUT | QUARANTINED — never READY |

---

## 5. Data path

```
RAW VENUE MESSAGES
  → validate (symbol, tf, OHLC, alignment, closed/confirm)
  → CANONICAL TAPE  (first-write-wins; conflicts quarantined)
  → one-venue MTF bundle
  → canonicalPayload → input_hash
  → decide(7.3.0)
  → parity slice → decision_hash
  → market_state / thesis / events
  → qualification matrix
  → alert event (later)
```

Corroboration records AGREEMENT / DIVERGENCE. It never votes direction.

---

## 6. Gold adapter

```
GoldAdapter
├── PAXG     canonical ENGINE-VALID
├── XAUUSD_FREE  observation (e.g. biquote broker quote)
└── XAUUSD_PAID  future, only if closed-bar proof exists
```

UI: **GOLD** / `PAXGUSDT · TOKENIZED GOLD PROXY`.

---

## 7. Worker

- Singleton (DB lease / heartbeat ownership)
- Fail closed unless `AWURU_CLOUD_ENV=staging` (production only after cutover auth)
- States: STARTING, HEALTHY, DEGRADED, RECONNECTING, DATA_GAP, DATABASE_UNAVAILABLE, STOPPED
- System health ≠ market health ≠ thesis status
- Exponential backoff WS; REST gap-fill; never fabricate bars

---

## 8. Database memory (not a second brain)

Long: closed candles, theses, events, decisions, user ledger, research.  
Short: source snapshots (~30d).  
Hot memory only: forming bars, trades, book.  
Never store every tick forever.

---

## 9. Surfaces (jobs, not chrome)

Keep: Command Center, Market, Ledger, Audit.  
Add when earned: FLOW (events), Alerts, Replay/Research.  
Skip: news ticker, order-book-as-signal, confidence gauge.

---

## 10. Versioning

- engine 7.3.0
- data contract `tape-1`
- architecture contract `c-1`
- alert contract (later)
- schema migrations timestamped

Engine lifecycle: EXPERIMENTAL → FROZEN → VALIDATED → PRODUCTION → RETIRED  
Current: **PRODUCTION_UNVALIDATED**.

---

## 11. Migration

Model B remains the oracle until tape parity ≥99.9%, engine parity zero mismatch, recovery proven, then dual-run, then cutover. No big-bang. Gate A still blocks Stage 2.
