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
| [**Verified ranking**](20-verified-ranking.md) | Developers | What the leaderboard counts, what stops a student faking it, the review queue, the `ranking_verified` flag |
| [**GitHub OAuth setup**](21-github-oauth-setup.md) | Operators | Production env vars, OAuth App + Supabase config, flag rollout order, verification steps |
| [**Security findings — deferred**](22-security-findings-todo.md) | Developers | The two security-report items left **unfixed** (username-change takeover, temp-email spam) with exact locations + proposed fixes, and a table of what was fixed |
| [**Governance & terms**](23-governance-and-terms.md) | Admins, developers | Founder permanence, annual rotation, term expiry, domain non-interference, seeding founders |
| [**Auth0 migration**](24-auth0-migration.md) | Operators, developers | Dry-run, export, import, verification, cutover, and rollback for existing Supabase accounts |
| [**RLS rollout runbook**](rls-rollout-runbook.md) | Operators | Enabling database-level tenant isolation, verifying it, rolling it back |

## Read this before deploying

**Tenant isolation has two layers, and you need to know which one is active.**

1. **Application layer (always on).** Every query carries an explicit
   `WHERE tenant_id = …`. This is what the app has always relied on.
2. **Database layer (opt-in).** Row Level Security policies, enforced only when
   the `loom_app` role is used *and* the `tenant_rls_enforced` flag is on.

Check which one is live at any time — no credentials needed:

```bash
curl -s https://<your-domain>/api/health
```

The `isolation.effective` field is the single source of truth. `false` means the
app is relying on layer 1 alone. The procedure for turning layer 2 on, verifying
it, and rolling it back is in [the RLS runbook](rls-rollout-runbook.md).

The flag is deliberately **not** exposed as an admin UI toggle. See
`app/api/admin/flags/route.js` for why.

## Retired docs

Superseded design docs were deleted (git history keeps them): `01-system-architecture.md` → covered by `17-architecture.md`; `02-tenant-and-security-model.md` → invariants folded into `17-architecture.md`; `03-data-model.md` → `14-database-reference.md`; `04-github-pipeline.md` → `16-github-integration.md`; `07-api-contracts.md` → `13-api-reference.md`; `08-build-phases.md` (history only); `10-production-checklist.md` → `15-deploy-and-operations.md`.

## Conventions used across these docs

- **Tenant** = one college chapter. One shared Postgres; every row is scoped by `tenant_id` resolved server-side from the member's profile — never from the client.
- **Roles** (upward-only, see `lib/permissions.js` 27 actions): `student` → `core` → `dept_lead` (Head = Co-Head, one tier) → `vertical_lead` → `admin` → `platform_admin`. Roles are granted (request/appoint/claim), never self-selected. Mentorship is a capability, not a role.
- All API responses use `{ ok: true, data }` or `{ ok: false, error: { code, message } }` (see `13-api-reference.md`).
- UI has two themes (dark black / light warm cream) and works without JavaScript for reading, with JS for actions.
