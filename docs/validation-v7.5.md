# AWURU v7.5 — TREND vs BREAKOUT isolation

Engine **7.3.0 frozen**. No fitting. No production behavior change.

Execution contract identical to v7.4: Binance Vision public klines; BTCUSDT / ETHUSDT / PAXGUSDT; 15m/1h/4h UTC; closed-bar `openTime + interval <= now`; 16-bar horizon; same-bar SL first; 10 bps/side + 2 bps slip; independent bars; IS 2026-05-11 → 2026-08-11; OOS 2026-08-11 → 2026-09-10; PAXG is a gold proxy, not XAUUSD.

Reproduce: `node --experimental-strip-types scripts/validate-v75.ts`

## Baseline

v7.4 headline counts and net-R reproduced on all six market×split cells (`match: true`).

## Classification

Uses `decide().family` at decision time only.

- `trend` → TREND
- `breakout` → BREAKOUT
- anything else → OTHER (mean-reversion produced **zero** releases)

EXPANDING_RANGE releases were **100% BREAKOUT**. TREND did not leak through that structure.

## Verdicts (frozen labels)

| Family | Status |
|---|---|
| TREND | **C — HISTORICALLY WEAK** |
| BREAKOUT | **C — HISTORICALLY WEAK** |

BREAKOUT is worse (tighter stop, median 1-bar SL, MFE-before-SL ≈ 0). TREND is only less bad. Neither is an edge.

## Recommendation (not implemented)

- BREAKOUT: **REMOVE FROM RELEASE ELIGIBILITY** (quarantine until a separate, later design exists)
- TREND: **RESEARCH FURTHER** — freeze 7.3.0; do not patch thresholds; next work is a redesign of timeframe/geometry, not more families

BTC and ETH contemporaneous releases: 40 same 15m bars. Do not treat the three tapes as independent edges.
