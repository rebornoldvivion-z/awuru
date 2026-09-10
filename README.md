# AWURU v7 — Discipline Desk

Personal, session-sovereign, WAIT-first market intelligence for **BTC**, **ETH**, and **Gold**.

Engine **7.3.0**. Not a broker. Not a 24/7 daemon. No validated edge.

Command Center shows all three markets at once. TREND remains historically weak / unvalidated. BREAKOUT is quarantined from actionable release. Gold is a core market via labeled PAXG proxy — not XAUUSD.

## Frozen contract

See `CONTRACT.md` and `ARCHITECTURE.md`.

- **Model B:** Vercel/Nitro + dumb `/api/bundle?asset=BTC|ETH|GOLD` (tape + corroboration only)
- **Intelligence:** `decide()` in the browser
- **Decisions:** BUY / SELL / WATCH / WAIT
- **Honesty:** TREND = UNVALIDATED candidate; BREAKOUT = QUARANTINED
- **Alive while focused:** refreshes on each 15m close; does not watch when closed
- **At 10:15 UTC last closed 4h is 04:00**
- **No API keys, no Render, no Supabase, no Neon, no LLM in decide()**

## Tests

```
node --experimental-strip-types --test src/awuru/awuru.test.ts src/awuru/tests/contract.test.ts src/awuru/tests/intelligence.test.ts src/awuru/tests/gold.test.ts src/awuru/tests/v72.test.ts src/awuru/tests/v73.test.ts src/awuru/tests/honesty.test.ts
```

## Limits

- No overnight monitoring
- Device-local IndexedDB
- WATCH is not a trade
- WAIT is first-class
- Manual confirmation only
- TREND is historically weak
- BREAKOUT cannot become BUY/SELL
- PAXG is a gold proxy, not XAUUSD
