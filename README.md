# AWURU v7 — Discipline Desk

Personal, session-sovereign, WAIT-first market intelligence for **BTC**, **ETH**, and **Gold**.

Engine **7.1.1**. Not a broker. Not a 24/7 daemon.

Gold is a core market. Current free/public support uses tokenized Gold (**PAXG**) as a clearly labeled proxy. XAUUSD spot remains a separate instrument and is currently unavailable under the verified no-account architecture.

## Frozen contract

See `CONTRACT.md` and `ARCHITECTURE.md`.

- **Model B:** Vercel/Nitro + dumb `/api/bundle` (tape + corroboration only)
- **Intelligence:** `decide()` in the browser
- **Decisions:** BUY / SELL / WATCH / WAIT
- **Alive while focused:** refreshes on each 15m close; does not watch when closed
- **At 10:15 UTC last closed 4h is 04:00**
- **No API keys, no Render, no Supabase, no LLM in decide()**

## Tests

```
node --experimental-strip-types --test src/awuru/awuru.test.ts src/awuru/tests/contract.test.ts src/awuru/tests/intelligence.test.ts
```

## Limits

- No overnight monitoring
- Device-local IndexedDB
- WATCH is not a trade
- Manual confirmation only
