# L.O.O.M. Documentation

Learning, Opportunity, Open source, Mentorship — one student journey per chapter.

## Start here

| Doc | Audience | Contents |
|-----|----------|----------|
| [Student guide](11-student-guide.md) | Students | Every section of the app, first-week path, how proof is earned |
| [Admin guide](12-admin-guide.md) | Chapter admins | Setup, content curation, moderation, events, verification |
| [API reference](13-api-reference.md) | Developers | Every endpoint, auth rules, envelopes, rate limits |
| [Database reference](14-database-reference.md) | Developers | Every table, migration order, key relationships |
| [Deploy & operations](15-deploy-and-operations.md) | Operators | Env vars, scripts, nightly jobs, runbook, troubleshooting |

## Design docs (existing)

- `00-product-brief.md` — vision and scope
- `01-system-architecture.md` — architecture decisions
- `02-tenant-and-security-model.md` — tenancy and authZ
- `03-data-model.md` — data modeling rationale
- `04-github-pipeline.md` — webhook ingestion design
- `05-classification-and-recommendations.md` — recommendation logic
- `06-frontend-ux-and-motion.md` — UX system and motion
- `07-api-contracts.md` — response envelopes and status codes
- `08-build-phases.md` — build history
- `09-verification-plan.md` — verification strategy
- `10-production-checklist.md` — launch readiness

## Conventions used across these docs

- **Tenant** = one college chapter. One shared Postgres; every row is scoped by `tenant_id` resolved server-side from the member's profile — never from the client.
- **Roles**: `student`, `admin` (chapter), plus `platform_admins` for operators.
- All API responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }` (see `07-api-contracts.md`).
- UI has two themes (dark black / light warm cream) and works without JavaScript for reading, with JS for actions.
