# AWURU free-first plan

**Prices retrieved 2026-09-15/16 from vendor docs.** They move. This is not an invoice.

---

## 1. What $0 can actually do

| Capability | At $0? | Honest mechanism |
|---|---|---|
| Command Center while a tab is focused | Yes | Model B today |
| Public REST klines / depth / trades | Yes | Binance Vision, Kraken, OKX |
| Guest ledger | Yes | IndexedDB |
| Durable cloud memory | Fragile | Supabase Free **pauses after 7 days of low activity** |
| Always-on WebSocket observer | **No** | Render workers are **not** a Free instance type |
| Sleeping HTTP API | Partial | Render Free web **spins down after 15 min idle** (750 hours/month) |
| Scheduled poll every 5 minutes | Partial | GitHub Actions; **not** a persistent WS; public repos auto-disable schedules after **60 days inactivity**; private Free = **2,000 minutes/month** |
| Cloudflare DNS/TLS | Yes | Free |
| Cloudflare Worker as Binance WS host | **No** | Free CPU **10 ms**/request; not a 24/7 socket process |
| True XAUUSD engine tape | **No** | See gold research |
| Background Cron on Render | **No** | **$1/month minimum**, 12h max run |

**There is no honest $0 architecture that continuously observes markets.** Calling GitHub Actions or a sleeping web service “24/7 realtime” is a category error.

---

## 2. ZERO / NEAR-ZERO (Mode A+)

**Cost:** $0  
**What it is:** Current Model B, plus optional GitHub Actions for *research/replay*, never for live authority.

- Public host remains the Command Center
- Intelligence remains browser `decide()` 7.3.0
- Optional: nightly Actions job writes a research artifact (if the repo is public, minutes are free; still not observation)
- Supabase Free may exist as **staging schema** and will pause

Use this until a worker is paid for.

---

## 3. FREE-FIRST HYBRID (Mode B — staging)

**Cost:** $0  
**What it is:** Model B production + unattached/paused Supabase Free + no Render worker.

- Apply Stage 1 SQL when a project exists
- RLS, hashes, theses tables ready
- Cloud not authoritative
- Useful for schema proof, not 24/7

This is the current Gate A hold, correctly.

---

## 4. MINIMAL PAID 24/7 (Mode C — recommended personal production)

The only missing paid primitive for continuous observation is **a process that never sleeps**.

Render: Background Worker **Starter $7/month** (0.5 CPU, 512 MB). No Free worker exists. Confirmed: Free instance types are Static Site, Web Service, Postgres, Key Value only.

### Floor (capability-max per dollar)

| Item | $/mo | Role |
|---|---|---|
| Render Background Worker Starter | **7** | WS ingest + `decide()` + heartbeat |
| Supabase Free (Nano) | **0** | Durable tape **if** the worker queries/writes often enough to avoid the 7-day pause |
| Current public UI (grok.me / static) | **0** | Presentation until dual-run needs a paid web |
| Cloudflare Free | **0** | DNS/WAF later |
| **Floor** | **~$7** | First honest 24/7 observer |

**Free-DB risk:** no automatic backups; pause if the worker dies for a week; 500 MB disk (closed 15m/1h/4h × 3 markets is tens of MB/year — disk is fine); 5 GB egress; 2M Realtime messages; 200 connections.

### Recommended durable personal

| Item | $/mo | Why |
|---|---|---|
| Render Worker Starter | 7 | Observation |
| Supabase Pro | **25** | Never-pause, **daily backups 7 days**, 8 GB, 250 GB egress, $10 compute credit covers Micro |
| **Recommended** | **~$32** | Memory you can replay |

Skip Render Web Starter **$7** until you need an independent `/health` API or Web Push HTTP. The existing host can remain Model B until cutover.

Skip Render Cron **$1 min** until nightly research jobs exist.

**Previous freeze quoted ~$39** (worker $7 + web $7 + Pro $25). The web service is **not required on day one** because a public UI already exists. That is the cost revision.

---

## 5. ADVANCED

| Add | ~$/mo | Buys |
|---|---|---|
| Render Web Starter | 7 | Always-on API, dual-run parity HTTP |
| Licensed XAUUSD (Twelve Data Grow / similar) | 29–99 | Still not automatically ENGINE-VALID |
| Render Standard worker | 25 | Headroom if WS + research jobs share a box |
| Cloudflare Workers Paid | 5 | Edge push / static, **not** the observer |
| PITR on Supabase | ~100 per 7-day window | Skip |

Do not add Redis. One worker + Postgres lease is enough.

---

## 6. GitHub Actions — useful, not an observer

- Private GitHub Free: **2,000 minutes/month**
- Public standard runners: unlimited minutes
- Minimum cron: every 5 minutes, **best-effort, often late**
- Public scheduled workflows **disable after 60 days** of repo inactivity
- Cannot hold Binance WebSocket
- **Use for:** nightly tape reconciliation, research batch, keepalive ping
- **Do not use for:** canonical live engine

---

## 7. Supabase Free vs Pro (workload check)

Expected AWURU personal load:

- 3 assets × 3 timeframes closed bars ≈ 400 rows/day
- events/decisions: hundreds/day
- Realtime: ~1 broadcast / 15m / 3 markets ≪ 2M messages
- Connections: 1 worker + 1 human ≪ 200

**Fits Free.** Pause and backups are the real reasons to pay Pro, not size.

Worker heartbeat every few minutes is “user database activity” in spirit; treat Pro as the switch for *production memory*, not for *making observation possible*.

---

## 8. Spend sequence (do not buy ahead of proof)

1. $0 — finish Gate A attach on Supabase Free; Model B stays live
2. $7 — Render staging worker; tape parity
3. $0 extra — engine parity on staging
4. $25 — Pro when dual-run / backups / user cloud state begin
5. $7 — paid web only if grok.me cannot host the dual-run API

Never pay for Redis, Render Postgres, Timescale, or an LLM.
