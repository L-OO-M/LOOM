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
| [GitHub integration](16-github-integration.md) | Developers | Webhook contract, pause gate, OSS auto-verify |
| [Architecture](17-architecture.md) | Developers | Request lifecycle, roles, table map, workflows, security invariants |
| [Public site](18-public-site.md) | Developers | Public pages, tenant fallback, empty-state policy |
| [Operations](19-operations.md) | Developers | Departments, volunteers, reports, handover, finance |

## Retired docs

Superseded design docs were deleted (git history keeps them): `01-system-architecture.md` → covered by `17-architecture.md`; `02-tenant-and-security-model.md` → invariants folded into `17-architecture.md`; `03-data-model.md` → `14-database-reference.md`; `04-github-pipeline.md` → `16-github-integration.md`; `07-api-contracts.md` → `13-api-reference.md`; `08-build-phases.md` (history only); `10-production-checklist.md` → `15-deploy-and-operations.md`.

## Conventions used across these docs

- **Tenant** = one college chapter. One shared Postgres; every row is scoped by `tenant_id` resolved server-side from the member's profile — never from the client.
- **Roles** (upward-only, see `lib/permissions.js` 20 actions): `student` → `core` → `dept_lead` (Head = Co-Head, one tier) → `vertical_lead` → `admin` → `platform_admin`. Roles are granted (request/appoint/claim), never self-selected. Mentorship is a capability, not a role.
- All API responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }` (see `13-api-reference.md`).
- UI has two themes (dark black / light warm cream) and works without JavaScript for reading, with JS for actions.
