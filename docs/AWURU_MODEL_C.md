# AWURU Model C — freeze status

**Architecture freeze:** Model C **worker-first**.  
**Production:** Model B. Engine **7.3.0**.  
**Gate A:** **PASS**.  
**Stage 2:** in progress. Render.com **not provisioned**. Cloud is **not** production-authoritative.

| Check | Status |
|---|---|
| Hosted project | **PASS** `olughqzjqfecqccjzrna` |
| Stage 1 SQL | **APPLIED** `20260913000001` |
| Hosted RLS / ingest / hashes | **PASS** |
| Staging REST observer | **720** first-write inserts; re-run **720 unchanged / 0 conflict** |
| Tape parity (LOOKBACK window) | **540 / 540 = 100%** exact OHLC |
| Engine parity (BTC/ETH/GOLD) | **0 mismatches** |
| WebSocket | **connected**; forming klines ignored (3 observed, 0 ingested) |
| Reconnect gap-fill | **717 unchanged + 3 new closed inserts, 0 conflict** |
| Singleton lease | **refused** `lease_held_by_staging-observer-hold` |
| Gold | **PAXGUSDT / TOKENIZED_GOLD_PROXY** |
| BREAKOUT | **QUARANTINED** |
| Render.com web/worker | **NOT PROVISIONED** (no Render API token) |
| Production authority | **Model B** |

## Product language (frozen)

- **GOLD** — `PAXGUSDT · TOKENIZED GOLD PROXY`
- TREND — historically weak / UNVALIDATED
- BREAKOUT — QUARANTINED

## Remaining before Stage 2 can PASS

Provision Render staging web + one observation worker from [render.staging.template.yaml](./render.staging.template.yaml). Until then the observer exists only as `npm run model-c:worker` against staging Supabase.

Identity: [environment-staging.md](./environment-staging.md)
