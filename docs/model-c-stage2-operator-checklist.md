# Model C Stage 2 — operator checklist

Gate A is **FAIL / BLOCKED** until every item in Supabase + Migration + Verification is done.  
Do not skip steps. Do not create Render services first. Do not invent credentials.

Current canonical worker status: `not_provisioned`.

## Environment variable contract

Public / browser-safe:

```
AWURU_SUPABASE_URL
AWURU_SUPABASE_ANON_KEY
```

Server-only:

```
AWURU_SUPABASE_SERVICE_ROLE_KEY
```

Required for any Model C infrastructure process:

```
AWURU_CLOUD_ENV=staging
AWURU_ENGINE_VERSION=7.3.0
AWURU_CONTRACT_VERSION=c-1
```

Never:

- `VITE_*SERVICE_ROLE*`
- `DATABASE_URL` (App Builder Neon — unused for Model C)
- service role, database password, or private tokens in git / frontend / `/api/health`

Environments: `development` | `staging` | `production`.  
The worker may run against **staging only**. Production is refused until cutover authorization.

## Supabase

- [ ] Create one Free staging project (not production, not a second architecture, not Neon)
- [ ] Record project ref in `docs/environment-staging.md`
- [ ] Record region
- [ ] Record project URL
- [ ] Record plan = Free
- [ ] Verify classification = staging
- [ ] Keep service role server-side only

## Migration

Apply **ONLY**:

```
supabase/migrations/20260913000001_stage1_foundation.sql
```

Do not recreate tables by hand. Do not apply `/workspace/migrations` (Neon). Do not add undocumented production-only SQL.

## Verification

Run hosted verification. It must connect to the real project. Failure to connect is failure, not success.

```
npm run model-c:verify-hosted
```

That script must pass:

- [ ] hosted schema verification
- [ ] hosted RLS verification
- [ ] hosted hash verification (`canonicalPayload()` → `inputHash()` → `decisions.input_hash`, plus `decision_hash`)
- [ ] hosted candle conflict tests (duplicate = no-op, different OHLC = conflict, canonical unchanged)
- [ ] hosted thesis / event / decision tests
- [ ] Gold identity remains PAXGUSDT / TOKENIZED_GOLD_PROXY
- [ ] `system_health.worker_status` is still `not_provisioned` until a worker exists

If any check fails: **STOP**. Do not lower the gate.

## Render

Only after the hosted database passes:

- [ ] create staging web service
- [ ] create staging worker
- [ ] connect staging credentials (server-side)
- [ ] refuse production targeting

Do not migrate DNS. Do not change the public Command Center.

Template (not provisioned): `docs/render.staging.template.yaml`

## Parity

Only after the worker exists and is ingesting staging data:

```
npm run model-c:tape-parity
npm run model-c:engine-parity
```

- [ ] tape parity (identity, OHLC exact, close status, timestamps)
- [ ] engine parity (userDecision, waitCode, lifecycle, family, research qualification, regime, structure, direction, input_hash, decision_hash)
- [ ] reconnect
- [ ] gap fill
- [ ] duplicate handling
- [ ] health

Tape target: ≥99.9% primary closed-bar parity with exact OHLC equality.  
Engine target: zero mismatches on contracted fields.  
Do not start these as live measurements while Gate A is blocked. The scripts currently exit blocked.

## RESUME MODEL C STAGE 2

1. Attach real Supabase staging project.
2. Record project metadata.
3. Apply Stage 1 migration.
4. Run hosted Stage 1 verification.
5. If PASS → create Render staging web.
6. Create Render observation worker.
7. Begin canonical tape ingestion.
8. Run tape parity.
9. Run engine parity.
10. Run recovery tests.
11. Produce Stage 2 parity report.

No step may be skipped.
