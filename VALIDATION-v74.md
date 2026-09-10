# AWURU v7.4 historical validation

Engine **7.3.0 frozen**. No parameter fitting. No engine changes.

- Venue: Binance Vision public klines (`data-api.binance.vision`)
- Symbols: BTCUSDT, ETHUSDT, PAXGUSDT (not XAUUSD)
- 15m/1h/4h, closed-bar only, no future candles
- IS: 2026-05-11 → 2026-08-11 · OOS: 2026-08-11 → 2026-09-10
- Horizon: 16 × 15m bars · same-bar SL first · 10 bps fee/side + 2 bps slip
- Risk day empty each bar (independent mentor calls, not a sequential book)
- v7.1.1 / v7.2: **reconstructed trend flags**, not bit-identical old `decide()`

Reproduce: `node --experimental-strip-types scripts/validate-v74.ts`

Do not treat these numbers as a live edge or as a reason to loosen gates.
