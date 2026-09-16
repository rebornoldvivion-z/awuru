# Staging environment — operator metadata

Never put passwords, service-role keys, database connection strings, or private tokens here.

```
Environment: STAGING
Provider: Supabase
Plan: not independently confirmed (operator target = Free)
Project ref: olughqzjqfecqccjzrna
Region: edge + pooler observed us-east-1 (IAD)
Project URL: https://olughqzjqfecqccjzrna.supabase.co
JWKS: https://olughqzjqfecqccjzrna.supabase.co/auth/v1/.well-known/jwks.json
Migration: supabase/migrations/20260913000001_stage1_foundation.sql
Applied: 2026-09-16T00:59:57.244Z
Verified: GATE A PASS — HOSTED_STAGE1_VERIFIED
Render web: Free web observer (pending live service id)
Render worker: not used (paid worker rejected)
Observation: SCHEDULED CLOUD OBSERVER — not 24/7
```

Public/runtime mapping:

```
AWURU_CLOUD_ENV=staging
AWURU_SUPABASE_URL=https://olughqzjqfecqccjzrna.supabase.co
AWURU_ENGINE_VERSION=7.3.0
AWURU_CONTRACT_VERSION=c-1
```

Server-only (not stored in git):

```
AWURU_SUPABASE_ANON_KEY=<publishable>
AWURU_SUPABASE_SERVICE_ROLE_KEY=<sb_secret_>
```
