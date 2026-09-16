# AWURU Model C migration

No big-bang. Model B is the safety oracle until every cutover gate is green.

## Sequence

| Step | Gate | Status |
|---|---|---|
| 1 | Real Supabase staging attach | **PASS** `olughqzjqfecqccjzrna` |
| 2 | Hosted Stage 1 verification | **PASS** |
| 3 | Render staging web | **blocked** — no Render API token |
| 4 | Canonical feed worker | in-repo observer; **not** on Render.com |
| 5 | Tape persistence | closed Binance BTC/ETH/PAXG × 15m/1h/4h |
| 6 | Tape parity ≥99.9% | **PASS 540/540 = 100%** |
| 7 | Engine packaging | same `decide()` module |
| 8 | Engine parity = 0 mismatch | **PASS** BTC/ETH/GOLD |
| | WS forming-bar ignore | **PASS** (3 forming, 0 ingest) |
| | Reconnect REST gap-fill | **PASS** 717 unchanged / 3 insert / 0 conflict |
| | Singleton lease | **PASS** refuse foreign owner |
| 9–20 | later | waiting |

## Applied

`supabase/migrations/20260913000001_stage1_foundation.sql` on staging (2026-09-16).

Do not apply `/workspace/migrations` (Neon). Do not cut over DNS.
