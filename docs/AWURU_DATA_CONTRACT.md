# AWURU data contract (`tape-1`)

Production still uses this contract in Model B. Model C must not weaken it.

## ENGINE-VALID candle

All of:

1. `open_time % interval_ms == 0`
2. `now_utc >= open_time + interval_ms` (time-closed)
3. OHLC invariants (`high >= max(open,close)`, `low <= min(open,close)`, all > 0)
4. Venue confirm:
   - Binance: `k.x === true`
   - OKX: `confirm == "1"`
   - Kraken: newest OHLC row is forming — do not ingest it as closed

Forming bars never enter the canonical tape or `decide()`.

## Identity

```
venue + symbol + timeframe + open_time
```

Same OHLC → **unchanged** (idempotent). Different OHLC → **conflict** row; canonical row is not overwritten.

## One venue per MTF bundle

15m / 1h / 4h from a **single** venue. Corroboration records agreement / delay / divergence. It does not vote direction.

## Markets

| UI | Instrument | Class |
|---|---|---|
| BTC | BTCUSDT (primary) | CRYPTO_SPOT |
| ETH | ETHUSDT | CRYPTO_SPOT |
| GOLD | **PAXGUSDT** | TOKENIZED_GOLD_PROXY |

XAUUSD is not canonical. Do not stitch PAXG + XAUT + broker XAU + GC=F.

## Hashes (Stage 0)

```
canonicalPayload(bundle, corroboration, profile, riskDay, now, versions)
  → SHA-256 → input_hash

paritySlice(decision)
  → SHA-256 → decision_hash
```

Worker, browser, replay, and tests share the same serializer. No second encoder.

## Quality

LIVE may proceed. DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE / SOURCE_SWITCH → WAIT. SOURCE_DIVERGENCE → WAIT_DIVERGENCE. Missing data → WAIT_DATA. Never fabricate, interpolate, or forward-fill.

## Retention (Model C, once hosted)

Long: closed candles, theses, events, decisions, research.  
Short/memory: forming, trades, books, BBO.  
No firehose archive.

## Authority today

Browser `decide(7.3.0)` + IndexedDB. Cloud tape is not attached.
