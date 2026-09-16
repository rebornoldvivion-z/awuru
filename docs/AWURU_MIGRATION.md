# AWURU Model C migration

No big-bang. Model B is the safety oracle until every cutover gate is green.

## Sequence

| Step | Gate | Status |
|---|---|---|
| 1 | Real Supabase staging attach | **PASS** `olughqzjqfecqccjzrna` |
| 2 | Hosted Stage 1 verification | **PASS** |
| 3 | Paid Render worker | **rejected** — $0 constraint |
| 4 | Scheduled observer (GH Actions → Render Free web) | implementing |
| 5 | Canonical feed | closed Binance BTC/ETH/PAXG × 15m/1h/4h |
| 6 | Tape parity ≥99.9% | previously **PASS 540/540** locally; re-verify after Free web |
| 7 | Engine packaging | same `decide()` module |
| 8 | Engine parity = 0 mismatch | previously **PASS**; re-verify after Free web |
| | Forming-bar ignore | REST `splitLive` + WS classifier |
| | REST gap-fill | checkpoint + LOOKBACK reconcile |
| | Singleton lease | refuse foreign owner |
| 9–20 | later | waiting |

## Applied

`supabase/migrations/20260913000001_stage1_foundation.sql` on staging (2026-09-16).

Do not apply `/workspace/migrations` (Neon). Do not cut over DNS.

Paid Render background workers are **optional future infrastructure**, not required for the $0 deployment.
