# Model C Stage 2 — operator checklist

Gate A is **PASS**. Paid Render workers are **rejected**.  
Current observer: **SCHEDULED CLOUD OBSERVER** ($0). Canonical worker_status default remains `not_provisioned` until a cycle writes `scheduled`.

## Environment variable contract

Public / browser-safe:

```
AWURU_SUPABASE_URL
AWURU_SUPABASE_ANON_KEY
```

Server-only:

```
AWURU_SUPABASE_SERVICE_ROLE_KEY
AWURU_OBSERVER_SECRET
```

Required for any Model C infrastructure process:

```
AWURU_CLOUD_ENV=staging
AWURU_ENGINE_VERSION=7.3.0
AWURU_CONTRACT_VERSION=c-1
```

GitHub Actions (waker only):

```
AWURU_OBSERVER_URL
AWURU_OBSERVER_SECRET
```

Never:

- `VITE_*SERVICE_ROLE*`
- `DATABASE_URL` (App Builder Neon — unused for Model C)
- service role, database password, observer secret, or private tokens in git / frontend / `/api/health`

## Supabase

- [x] Create one Free staging project
- [x] Record project ref in `docs/environment-staging.md`
- [x] Apply **ONLY** `supabase/migrations/20260913000001_stage1_foundation.sql`
- [x] `npm run model-c:verify-hosted` → GATE A PASS

## $0 observer (required)

- [ ] Create Render **Free web** service from `docs/render.free-web.yaml` (not a background worker)
- [ ] Set server env + `AWURU_OBSERVER_SECRET`
- [ ] Put `.github/workflows/model-c-observer.yml` on the **default branch** (GitHub only schedules default-branch workflows)
- [ ] Set Actions secrets `AWURU_OBSERVER_URL` and `AWURU_OBSERVER_SECRET`
- [ ] Manual `workflow_dispatch` succeeds
- [ ] Scheduled run succeeds
- [ ] Tape parity 100%, engine parity 0 mismatches
- [ ] Fail-closed: bad secret 401, lease overlap 409, provider failure does not advance checkpoint

## Paid Render worker

Optional future infrastructure. Not required. Template remains `docs/render.staging.template.yaml` (**NOT PROVISIONED**).

## RESUME MODEL C STAGE 2

1. Attach real Supabase staging project.
2. Record project metadata.
3. Apply Stage 1 migration.
4. Run hosted Stage 1 verification.
5. If PASS → create Render **Free web** observer (not a paid worker).
6. Put the GitHub Actions waker on the default branch.
7. Begin canonical tape ingestion via scheduled POST `/internal/model-c/observe`.
8. Run tape parity.
9. Run engine parity.
10. Run recovery / idempotency / lease tests.
11. Produce Stage 2 parity report.

No step may be skipped.
