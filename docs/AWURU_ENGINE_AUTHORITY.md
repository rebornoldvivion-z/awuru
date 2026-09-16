# AWURU engine authority

## Current

| Role | Holder |
|---|---|
| Production `decide()` | Browser (Model B) |
| Public data path | `/api/bundle` + `/api/health` |
| Guest memory | IndexedDB `awuru-v7` |
| Cloud tape | **not attached** |
| Worker | `not_provisioned` |

Engine version: **7.3.0**  
Lifecycle: **PRODUCTION_UNVALIDATED**  
TREND: historically weak / UNVALIDATED  
BREAKOUT: QUARANTINED — cannot BUY, SELL, or EXECUTION_READY

## After Gate A + parity (not now)

Same TypeScript module runs in browser, worker, replay, and tests.

Until tape parity ≥99.9% and engine mismatch = 0:

**Model B remains the oracle.**

After that, the worker may become the **producer** of canonical `market_state`. The engine version does not change. UNVALIDATED does not become VALIDATED because a worker exists.

## Packaging rule

Do not duplicate `decide()`. Do not change 7.3.0 thresholds to chase parity. Parity failures are data / serialization / environment bugs.

## Qualification vs validation

```
OBSERVATION     what happened
QUALIFICATION   AWURU contract (READY)
VALIDATION      research-proven edge  — 7.3.0 has not earned this
USER            human confirm
```

A worker improves observation. It is not evidence of edge.

## Wait codes that stay first-class

WAIT_DATA, WAIT_DIVERGENCE, WAIT_ENGINE (when hashes disagree), WAIT_RISK, WAIT_QUARANTINE, plus existing 7.3.0 waits.

SQL never reimplements the engine.
