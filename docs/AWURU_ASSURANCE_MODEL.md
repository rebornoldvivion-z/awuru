# AWURU assurance model

**Not a guarantee of profit.**  
**Not a confidence percentage.**  
**Not “AI-powered.”**

Assurance means: *the system has verified every required condition in its own contract.*

---

## 1. Forbidden language

Never in UI, alerts, docs, or research copy:

- guaranteed profit / guaranteed win / can’t lose
- assured trade (as a user-facing name)
- high-confidence prediction
- AI predicts / AI confidence
- STRATEGY-VALIDATED unless the research program has actually approved an engine version

The owner’s phrase “assured trade” is translated to a **system qualification state**.

---

## 2. Chosen vocabulary

| Use | Term | Meaning |
|---|---|---|
| Internal state | `EXECUTION_READY` | Every required non-scientific gate passed |
| User-facing headline | **READY** | Same, always paired with research status |
| Rejected | Assured / Guaranteed / Verified win | Dishonest |
| Strong honest alternatives | Fully Qualified, Contract Satisfied | Accurate but colder |

**READY** is allowed only as:

> READY — every AWURU gate in the current contract passed.  
> Research: UNVALIDATED. Manual confirmation required.

If research status is UNVALIDATED or QUARANTINED, READY must still show that line at the same visual weight as the headline. Hiding it is a product defect.

---

## 3. Two independent axes

```
SYSTEM QUALIFICATION  ≠  MARKET OUTCOME
STRATEGY STATUS       ≠  GATE COMPLETION
```

A candidate may be:

- highly qualified **and** historically weak
- READY **and** UNVALIDATED
- structurally beautiful **and** unprofitable

Engine 7.3.0 TREND is **PRODUCTION_UNVALIDATED**. It can never mint `STRATEGY_VALIDATED`. BREAKOUT can never become READY.

---

## 4. Assurance ladder

```
OBSERVING
  → FORMING          (setup location appearing; HTF not yet closed if required)
  → WATCH            (coherent thesis, trigger incomplete)
  → TRIGGERED        (closed trigger printed)
  → QUALIFIED        (structure + geometry + MTF + data gates)
  → RESEARCH_SCOPED  (family allowed; not quarantined)
  → EXECUTION_READY  (all product/risk/data/system gates)
       └── still UNVALIDATED until a later engine version is approved
```

Mapping to current 7.3.0 lifecycle: OBSERVING / FORMING / WATCH / TRIGGERED / QUALIFIED / CANDIDATE remain. **CANDIDATE is not READY.** READY is a *qualification overlay*, not a new family.

BREAKOUT stops at WATCH or `WAIT_QUARANTINE`. It cannot climb.

---

## 5. Assurance matrix (required dimensions)

| Dimension | Pass | Fail |
|---|---|---|
| Data | LIVE, closed bars only, ENGINE-VALID | DELAYED / STALE / PARTIAL / INVALID / UNAVAILABLE |
| Sources | AGREEMENT or PRIMARY_ONLY (policy) | DIVERGENCE → WAIT_DIVERGENCE |
| MTF | Native 15m/1h/4h, one venue, no forming HTF | Mixed venue, forming 4h/1h |
| Structure | Thesis has a valid structural read | UNKNOWN / expanding-range sold as trend |
| Location | Price in declared zone | No zone / broken invalidator |
| Trigger | Closed confirmation | Wick-only / forming bar |
| Risk | Legal qty, RR, budget, persona | WAIT_RISK / WAIT_UNSIZEABLE |
| Family | TREND only for actionable | BREAKOUT quarantined |
| Research | Explicit status shown | Hidden or implied “proven” |
| Engine | Worker hash = browser hash = 7.3.0 | WAIT_ENGINE |
| System | Worker HEALTHY, DB reachable | SYSTEM_FAILURE |
| User | Manual confirm | No auto-send |

READY requires **all rows except Research** to pass, **and** Research to be displayed, **and** User unconfirmed until the human acts.

Research may be UNVALIDATED while READY is true. That is the honest product.

---

## 6. What READY must never do

- originate from BREAKOUT
- use a forming bar
- use mixed-venue MTF
- use stale or divergent data
- bypass risk
- bypass user confirmation
- hide UNVALIDATED
- imply the next candle will pay

---

## 7. Alert levels (tied to the ladder, not excitement)

| Level | When | Strength |
|---|---|---|
| INFORMATION | Market/state changed | Weak |
| WATCH | Coherent thesis exists | Medium |
| QUALIFIED | Structural gates passed | Medium |
| EXECUTION_READY | Contract complete | Strong, still UNVALIDATED |
| INVALIDATED | Thesis died | Strong |
| SYSTEM_FAILURE | Observation infrastructure failed | Strong |

Same thesis + same level must not re-fire every 15m. Fire on **transition** only.

---

## 8. Replay is part of assurance

A READY mark that cannot be reconstructed is not assurance.

Replay inputs: market, timestamp, engine version, input_hash, decision_hash, matrix snapshot, blockers.

Question replay must answer: *Why was this candidate created, and which gate was red?*
