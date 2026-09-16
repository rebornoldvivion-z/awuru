# AWURU notification architecture

Notifications are **adapters**. They are not the engine.

```
ENGINE 7.3.0
  → QUALIFICATION / ASSURANCE MATRIX
  → ALERT EVENT (durable)
  → POLICY (who, which levels, quiet hours)
  → CHANNEL ADAPTER
```

Do not put Telegram, WhatsApp, Web Push, or email inside `decide()`.

---

## 1. Alert event (channel-agnostic)

```ts
type AlertEvent = {
  id: string;
  at: string;                 // UTC
  market: "BTC" | "ETH" | "GOLD";
  eventType:
    | "INFORMATION"
    | "WATCH"
    | "QUALIFIED"
    | "EXECUTION_READY"
    | "INVALIDATED"
    | "SYSTEM_FAILURE";
  assuranceLevel: string;
  thesisId: string | null;
  state: string;
  dataStatus: string;
  researchStatus: "UNVALIDATED" | "QUARANTINED" | "OBSERVATION" | "NONE" | "STRATEGY_VALIDATED";
  engineVersion: string;
  inputHash: string | null;
  decisionHash: string | null;
  evidence: Record<string, unknown>;
  blockers: string[];
  invalidation: string | null;
  delivery?: { channel: string; status: string; at?: string };
};
```

Every alert is append-only and reconstructable. “What did AWURU alert me about?” must be answerable from `events` + this row.

---

## 2. Channel order (free-first)

| Order | Channel | Cost | When |
|---|---|---|---|
| 1 | In-app FLOW / Command Center | $0 | First. Required before any push. |
| 2 | Browser Web Push | $0 infra (VAPID) | After event stream is trustworthy |
| 3 | Email (Resend/Postmark later) | usually $0 at low volume | Optional |
| 4 | Telegram bot | $0 API | Future adapter |
| 5 | WhatsApp | paid Cloud API | Last; not needed for personal |

In-app is the intelligence surface. Push is a pointer back to it.

---

## 3. Delivery semantics

Do **not** promise exactly-once external delivery.

- Persist the event first (source of truth)
- Attempt channel delivery
- Record delivery state
- Retry with backoff for SYSTEM_FAILURE / EXECUTION_READY only
- Deduplicate on `(thesisId, eventType, assuranceLevel)`

Suppression examples:

- `THESIS_INVALIDATED` → once per thesis death
- `THESIS_REVERSED` → once per transition
- `DATA_STALE` → once, then a recovery INFORMATION
- EXECUTION_READY → once per thesis identity until invalidation

---

## 4. READY alert copy (research freeze, not implementation)

Must include research status in the first screen of the notification:

```
BTC — READY
Bullish continuation thesis. Data verified. MTF aligned. Risk valid.
Research: UNVALIDATED. Manual confirmation required.
```

Must never say: “Guaranteed BTC win.”

GOLD alerts use the GOLD title with `PAXGUSDT · tokenized gold proxy` in the body.

---

## 5. Policy

Per user (later authenticated):

- which markets
- minimum level (e.g. only READY + INVALIDATED + SYSTEM_FAILURE)
- quiet hours
- channels enabled

Guest Model B: in-app only. No push until identity exists.

---

## 6. Dependencies

Alerts require a trustworthy event stream. That requires Stage 2+ tape + worker health. **Do not build channels during Gate A hold.**
