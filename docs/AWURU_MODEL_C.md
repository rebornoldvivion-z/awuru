# AWURU Model C — freeze status

**Architecture:** scheduled cloud observer ($0).  
**Production:** Model B. Engine **7.3.0**.  
**Gate A:** **PASS**.  
**Gate B-FREE:** **in progress** until Render Free web + GitHub schedule have live evidence.  
**Paid Render worker:** rejected (no billing).  
**Cloud:** not production-authoritative.  
**Not 24/7. Not a continuous WebSocket worker.**

| Check | Status |
|---|---|
| Hosted Supabase | **PASS** `olughqzjqfecqccjzrna` |
| Observer mode | SCHEDULED CLOUD OBSERVER |
| Render Background Worker | not used |
| Render Free web | pending live provision |
| GitHub Actions waker | `.github/workflows/model-c-observer.yml` |
| decide() location | existing `src/awuru/engine/engine.ts` only |
| Gold | PAXGUSDT · TOKENIZED_GOLD_PROXY |
| BREAKOUT | QUARANTINED — never EXECUTION_READY |
| TREND | UNVALIDATED — never EXECUTION_READY |
| Production authority | **Model B** |

## How it runs

GitHub Actions (default branch schedule) → `POST /internal/model-c/observe` on a Render **Free web** process → one bounded REST cycle → Supabase Free.

Render sleep is expected. Each invocation may be a cold start and must gap-fill from the checkpoint. The system never claims it observed between runs.
