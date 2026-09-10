# AWURU v7.7 — Pre-specified TREND geometry research

Engine **7.3.0 frozen**. Same TREND releases as v7.5/v7.6. **No fitting.** **No production change.**

Reproduce: `node --experimental-strip-types scripts/validate-v77.ts`

## Candidate set (declared before results)

Isolation design, not a combo grid:

- **Stop variants** keep original T1.
- **Target variants** keep original S1.

### Stops

| ID | Definition |
|---|---|
| S1 | Original v7.3 structural stop (control) |
| S2a | ATR corridor 0.75 ATR |
| S2b | ATR corridor 1.00 ATR |
| S2c | ATR corridor 1.25 ATR |
| S3 | Structural invalidator ± 0.25 ATR (further from entry) |
| S4 | Supporting swing ± 0.25 ATR (long: lastSwingLow − 0.25 ATR; short: lastSwingHigh + 0.25 ATR). Skip if swing missing. |

### Targets

| ID | Definition |
|---|---|
| T1 | Original v7.3 structural TP1 (control) |
| T2a | 0.75R vs the paired stop |
| T2b | 1.00R vs the paired stop |
| T2c | 1.25R vs the paired stop |
| T3 | 1.00 ATR from entry |
| T4 | Nearest opposing swing at decision time (long: lastSwingHigh; short: lastSwingLow). Skip if missing. Record identity with T1. |

No finer ATR/R increments. No market-specific or side-specific variants.

## Execution contract

Identical to v7.4–v7.6. Horizon remains **16 × 15m**. Costs 10 bps/side + 2 bps. SL-first. Independent bars.

## Observed (descriptive only)

Release counts matched v7.5/v7.6. S3 and S4 were identical on this set (invalidator = supporting swing). T4 was identical to T1 on ~56–78% of trades.

Every pre-specified candidate remained **negative avg net R** on IS and OOS for BTC, ETH, and PAXG. Wider stops (S2c) were less bad, not useful. Closer targets raised hit rate and collapsed payoff.

## Validation status

This sample was already inspected in v7.4–v7.6. Results here are **descriptive, not validated.**

## Diagnosis

**C — GEOMETRY DOES NOT RESCUE**
