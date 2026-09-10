# AWURU v7.6 — TREND path / geometry research

Engine **7.3.0 frozen**. Same dataset, split, and costs as v7.4/v7.5. **TREND releases only.** No new signals. No parameter search.

Reproduce: `node --experimental-strip-types scripts/validate-v76.ts`

## Classes

- `THESIS_WRONG`: MFE < 0.25R on the production 16-bar SL-first path
- `THESIS_RIGHT_GEOMETRY_MISSED`: MFE ≥ 0.5R and outcome ≠ TP1
- `MIXED`: TP1, or 0.25R ≤ MFE < 0.5R

## Diagnosis

**B — THESISALLY PLAUSIBLE, EXECUTION GEOMETRY WEAK**

On IS, ~70% of TREND releases reach +0.25R and ~60% reach +0.5R (often within 1–2 bars). Extending observation to 8h/12h/24h barely raises TP1 and does not reduce SL. The 4h horizon is not the main bottleneck; the stop/target pair is.

This is **not** an edge claim. Favorable excursion ≠ monetized R.

Structure vs EMA/ADX cannot be attributed on the released set: every TREND release already has structure + EMA + ADX by construction (`allThree = 1`).
