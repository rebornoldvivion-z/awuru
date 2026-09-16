# AWURU Gold research

**Verified:** 2026-09-16 UTC (live HTTP from this environment).  
**Rule:** do not silently substitute instruments. Do not stitch venues into one engine tape.

---

## 1. What “true Gold” would mean

For AWURU’s engine, Gold would be **true** only if:

- the instrument is **spot XAUUSD** (or an equivalent unlevered troy-ounce USD spot), not a token, not a future
- closed 15m / 1h / 4h bars exist with ENGINE-VALID semantics
- timestamps are UTC and aligned
- forming bars can be excluded
- a second independent source can corroborate without becoming a vote

No free source proven here satisfies that contract for **canonical engine input**.

---

## 2. Live prices at the same minute (not interchangeable)

| Instrument | Source | Proven endpoint | Last observed | What it actually is |
|---|---|---|---|---|
| PAXGUSDT | Binance Vision | `GET https://data-api.binance.vision/api/v3/klines?symbol=PAXGUSDT&interval=15m&limit=2` | ~4289.47 | Paxos tokenized gold / USDT, crypto spot |
| PAXGUSD | Kraken public | `GET https://api.kraken.com/0/public/Ticker?pair=PAXGUSD` | ~4286.44 | Same token, USD book |
| PAXG-USDT | OKX public | `GET https://www.okx.com/api/v5/market/candles?instId=PAXG-USDT&bar=15m&limit=2` | ~4288.5 close, confirm flag present | Same token |
| XAUTUSDT | Binance Vision | `GET https://data-api.binance.vision/api/v3/klines?symbol=XAUTUSDT&interval=15m&limit=1` | ~4285.77 | Tether Gold token — **another proxy** |
| XAUUSD (broker) | biquote anonymous | `GET https://biquote.io/api/latest?symbols=XAUUSD` | mid ~4284.10 | **MetaTrader 5 (Broker 1)** quote, not LBMA |
| GC=F | Yahoo chart | `GET https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=15m&range=1d` | ~4325.7 | **COMEX gold future**, not spot |

Spread across these rows is several dollars. They are related, not identical. **Do not average them. Do not feed mixed Gold instruments into one MTF bundle.**

---

## 3. Proven free XAU-like sources

### biquote.io — anonymous XAUUSD (best free *observation* candidate)

Proven:

```
GET https://biquote.io/api/latest?symbols=XAUUSD   → 200
GET https://biquote.io/api/XAUUSD/ohlc?interval=15m&limit=3 → 200
```

Facts from the live body:

- `source: "MetaTrader 5 (Broker 1)"`
- bid/ask/mid, `stale`, `quoteAgeSeconds`, `marketState`
- 15m bars with `isOpen: true|false` (forming vs closed — useful)
- `volume: 0`, `tickVolume` only
- intervals claimed: 1m 5m 15m 30m 1h 4h 1d

**Classification:** Gold observation / corroboration. **Not** canonical engine tape. Broker quote, unknown book, no real volume, ToS not a licensed market-data contract.

### goldprice.dev — anonymous XAU-USD-SPOT tick

Documented:

```
GET https://api.goldprice.dev/v1/prices?symbol=XAU-USD-SPOT
```

This environment received **HTTP 429** (anonymous IP quota). The product exists; it is a **spot tick**, not a closed 15m engine bar. Free: ~100 req/IP/hour anonymous, 1,000/month with a key. WebSocket is **Realtime Pro (paid)**.

**Classification:** Display-only spot reference if quota allows. Not engine tape.

### Yahoo GC=F

Proven 15m chart JSON. Instrument type in the payload is **FUTURE / COMEX**. Wrong contract for “spot Gold.”

**Classification:** Not XAUUSD. Do not use as Gold engine input.

### Twelve Data / Metals-API / GoldAPI.io / metals.dev / FRED / metals.live

| Source | Live result here | Notes |
|---|---|---|
| Twelve Data `XAU/USD` 15min | 401 without key | Free ~800/day, delayed, key required |
| Metals-API | 401 | Key required |
| GoldAPI.io `/api/XAU/USD` | 403 | Key required |
| metals.dev `/v1/latest` | 401 | Key required |
| FRED series | 400 without key | Daily LBMA-style, not 15m |
| metals.live | TLS failure | Unusable |
| Frankfurter / open.er-api | 200 | FX only — **no XAU** |
| Stooq XAUUSD CSV | connection refused | Unproven here |

Paid XAUUSD (Polygon, Tradermade, OANDA, CME, Twelve Data Grow+, etc.) was **not purchased**. Incremental cost is typically **$29–$99+/month** for real-time FX/metals and still may not yield ENGINE-VALID closed bars with venue confirm flags.

---

## 4. PAXG as the current canonical Gold market

PAXG on Binance Vision is already ENGINE-VALID:

- aligned 15m/1h/4h klines
- public WS: `wss://data-stream.binance.vision:443/ws/paxgusdt@kline_15m`
- depth, trades, bookTicker, aggTrades all **200** on Vision REST (see market-data expansion)
- Kraken + OKX corroboration already in Model B

This is **tokenized gold**, redeemable in principle for allocated gold, traded as crypto. It tracks XAU but is not XAU. Funding/open-interest on **spot** PAXG is not a Binance Vision spot field (`/openInterest` → 404).

---

## 5. Multi-source Gold at $0

Possible **observation layer** (not a fake XAUUSD price):

```
PAXGUSDT (Binance)     canonical GOLD tape
PAXGUSD  (Kraken)      corroboration of the token
PAXG-USDT (OKX)        corroboration of the token
XAUTUSDT (Binance)     second token — context only
XAUUSD   (biquote)     broker spot — context only
```

Compare spreads and delays. If they diverge, **WAIT_DIVERGENCE** or show disagreement. Never synthesize a blended “true gold” close for `decide()`.

---

## 6. Product presentation

Primary identity: **GOLD**  
Secondary: `PAXGUSDT · TOKENIZED GOLD PROXY`  
Tertiary: venue, last close, source health

Do not put “GOLD PROXY” in the large market title. Do not hide PAXG.

When a licensed XAUUSD feed is purchased later:

```
GoldAdapter
├── PAXG     (canonical until XAU earns ENGINE-VALID)
├── XAUUSD_FREE  (observation only)
└── XAUUSD_PAID  (may become canonical only after closed-bar proof)
```

The Command Center should not need a redesign when the adapter changes.

---

## 7. Decision

**TRUE XAUUSD UNAVAILABLE FOR FREE as an engine tape.**

Keep PAXG as canonical Gold. Present the market as GOLD. Keep provenance inspectable. Optional free XAU broker quotes are corroboration, never silent substitution.
