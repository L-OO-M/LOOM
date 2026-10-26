# Hardening and integration plan

**Status:** audit complete; implementation not started.
**Audited:** 2026-10-26.
**Scope:** security, tenancy, backend integrity, workflows, coupling, loose ends, and department-level integrations.
**Method:** read-only static audit of the repository plus a live read of `/api/health`. No application files were changed for this audit.

This is a working register, not a claim that the work is done. Treat every
"fix" below as a proposal that must be implemented, tested, and reviewed.

Severity legend:

- **P0** - launch blocker or confirmed data exposure/loss.
- **P1** - high-impact security, integrity, or workflow breakage.
- **P2** - important hardening or operator friction.
- **P3** - cleanup, defence in depth, or polish.

Production snapshot at audit time:

```json
{
  "status": "ready",
  "tenant": "demo-college",
  "isolation": {
    "flag": false,
    "connection": "loom_app",
    "effective": false,
    "note": "Tenant isolation relies on application WHERE clauses only."
  }
}
```

That means database-enforced tenant isolation is **off in production**. Every
query currently depends on hand-written `tenant_id` predicates.

---

## 1. Executive assessment

- The verified-ranking spine is the strongest part of the product: evidence
  requires a verifier, scores are derived, provisional claims score zero, and
  the database enforces the ledger contract.
- The highest-risk problems are at the edges of that spine: two cross-tenant
  contest queries, a destructive "clear unverified" operation, one broken
  volunteer SQL query, server-side gaps in the Auth0 cutover, and legal pages
  that users must accept while they still contain placeholders.
- The largest productivity opportunities are unfinished workflows that already
  have schema or APIs: contest judging, event attendance, accepted answers,
  mentor sessions, announcements UI, finance/MoU lifecycle, and operator bulk
  actions.
- Do not add major new modules until the P0/P1 items below are closed. Several
  current features promise outcomes the code never records.

---

## 2. P0 - stop the bleeding

- [ ] **P0-1 Cross-tenant contest leak.**
  `app/(app)/student/page.jsx:75-81` queries `contests` with no tenant
  predicate. `app/(app)/admin/analytics/page.jsx:42-47` does the same.
  `contests` is a strict tenant table. Add the tenant predicate to both, remove
  the false allowlist at `tests/tenant-scoping-gate.test.js:121`, and fix the
  `SELF_KEY` early-skip at `tests/tenant-scoping-gate.test.js:155` so a
  subquery cannot mask an unscoped primary `FROM`.
  **Done when:** a regression test fails before the fix and passes after it.

- [ ] **P0-2 "Clear unverified" deletes verified evidence.**
  `app/api/admin/ranking/route.js:234-248` deletes every `ranking_events` row
  for the student, not only provisional claims. Revoke only the rejected
  `kind/refId` rows. Never delete by `tenant_id + user_id`.
  **Done when:** clearing one provisional claim leaves verified OSS, roadmap,
  and project evidence intact.

- [ ] **P0-3 Volunteer signup always fails.**
  `app/api/volunteers/[id]/signup/route.js:23` runs
  `SELECT COUNT(*) ... FOR UPDATE`, which PostgreSQL rejects. Remove
  `FOR UPDATE` from the aggregate; keep the slot-row lock and the transaction.
  **Done when:** signup succeeds and a capacity race test passes.

- [ ] **P0-4 Next.js critical advisory.**
  `npm audit` reports a critical Image Optimization RCE and a high App Router
  DoS affecting `next@15.5.27`. Upgrade to `next@15.5.28+`, then rerun build
  and the full local E2E suite.
  **Done when:** audit is clean and the gates below pass.

- [ ] **P0-5 Auth0-only is UI-only.**
  `NEXT_PUBLIC_AUTH0_ONLY` gates the login/register pages only. The legacy
  `/api/auth/register`, `/api/auth/login`, `/api/auth/verify-email/*`, and
  `/auth/supabase-callback` routes remain public. Add a server-side cutover
  flag, or explicitly document that dual auth is permanent.
  **Done when:** direct legacy signup is rejected during cutover.

- [ ] **P0-6 Terms consent is not real.**
  The registration checkbox is client-only; the API uses `.passthrough()` and
  does not require a consent timestamp. The Auth0 signup branch has no consent
  capture at all. Add a server-required consent field and an append-only
  consent record with terms version, time, and actor.
  **Done when:** consent cannot be skipped and can be audited.

- [ ] **P0-7 Legal pages contain placeholders.**
  `app/privacy/page.jsx:26-29`, `app/terms/page.jsx:26-29`, and
  `app/contact/page.jsx:26-28` still contain bracketed values. The privacy
  page also says "password-based Supabase Auth credentials" while Auth0 is the
  primary front door. Fill the values and correct the disclosure.
  **Done when:** no bracketed placeholders remain and the auth description is
  accurate.

- [ ] **P0-8 Production RLS is off.**
  Live `/api/health` reports `isolation.effective = false`. Follow
  `docs/rls-rollout-runbook.md`; backfill tenant columns and indexes for the
  uncovered tables listed in section 3.1.
  **Done when:** health reports effective isolation and cross-tenant probes
  fail at the database layer.

- [ ] **P0-9 Rotate exposed credentials and prove restore.**
  The handoff says the Supabase database password was exposed. Rotate it and
  rotate the Auth0 M2M client secret. Confirm Supabase PITR/backups and run a
  restore drill into a scratch project.
  **Done when:** rotation is recorded and a restore has actually been tested.

- [ ] **P0-10 Guard destructive scripts.**
  `load/clean-launch-data.js` deletes hardcoded test accounts and `auth.users`
  rows with only `--confirm`. Add the same production refusal used by
  `seed-dev.js`, `wipe-dev.js`, and `seed-e2e-student.js`.
  **Done when:** the script refuses to run with `NODE_ENV=production` or
  `VERCEL_ENV=production`.

- [ ] **P0-11 Fix the uncommitted dashboard restyle.**
  `components/student/OrgPanels.jsx` uses `desk-domain-*` classes that do not
  exist in `student-folio.css`; the `fill` image also needs a positioned parent.
  Either add the missing rules or revert the restyle.
  **Done when:** the dashboard renders correctly at 1440 and 390 in both themes.

**P0 gate:** lint, encoding, unit, build, full local E2E, manual security probes,
and a second review of every auth/tenant diff.

---

## 3. Security and tenancy backlog

### 3.1 Authorization and tenant isolation

- [ ] Fail closed in `lib/requirePermission.js:6-37`. It only checks
  `ctx.user`; when profile or tenant resolution fails, routes may proceed with
  an undefined `sql` or tenant. Require `ctx.profile`, `ctx.tenant`, and
  `ctx.sql`, and map `ctx.error` to the correct status.
- [ ] Replace the 49 fail-open `tenant_id = X OR tenant_id IS NULL` arms with
  one `scope(tenantId)` helper. Only genuinely global tables should use NULL.
  The current `lib/db.js` comment bans this pattern for exactly this reason.
- [ ] Strengthen `tests/tenant-scoping-gate.test.js`. It misses reverse-order
  OR-NULL expressions and skips the primary `FROM` when a self-key appears in a
  subquery.
- [ ] Resolve new-user tenants from the request host, not
  `DEV_TENANT_SLUG` (`lib/auth-server.js:149,185`). Fail closed instead of
  silently re-homing an existing profile whose tenant row is missing.
- [ ] Backfill `tenant_id` and composite indexes for tables excluded from
  migration 031, including `department_memberships`, `event_registrations`,
  `forum_votes`, `forum_flags`, `volunteer_signups`, `github_events`,
  `mentor_sessions`, and `contest_submissions`. Compare uuid columns as uuid,
  not text.
- [ ] Enforce "at least one admin remains" on handover transfer. The current
  path demotes the outgoing admin without checking the remaining admin count.
- [ ] Fix `lib/lead.js:46-61`, where a vertical lead's workshop fallback
  becomes `OR TRUE`, and `app/(app)/lead/mous/page.jsx:19`, which loads MoUs
  without vertical scope.
- [ ] Restrict `app/api/admin/resources` to platform admins, or add
  `tenant_id` to `resources`. A chapter admin currently mutates the global
  catalogue.
- [ ] Scope `app/api/contributions` admin writes to the caller's tenant; the
  current department lookup permits a NULL tenant.
- [ ] Require a department the caller actually leads when proposing an expense
  (`app/api/finance/expenses/route.js:32,69-75`).

### 3.2 Mutation integrity and transactions

- [ ] Make first-admin bootstrap atomic: one transaction plus an advisory lock
  or singleton constraint. It currently inserts `platform_admins` and
  `profiles` separately.
- [ ] Make event registration capacity atomic: lock the event row and recount
  inside the transaction, or use `INSERT ... SELECT ... WHERE count < capacity`.
- [ ] Make contest submission/judging idempotent once judging exists.
- [ ] Make report submission immutable. A lead can reopen a submitted report
  and overwrite content (`app/api/reports/[id]/route.js:62-72`,
  `app/api/reports/route.js:129-131`). Preserve revisions instead of
  overwriting.
- [ ] Revoke evidence when a verified item is rejected:
  - OSS rejection must revoke `oss_verified` and badges
    (`app/api/opensource/contributions/[id]/route.js:36-62`).
  - Re-claiming a verified roadmap node must not downgrade it to provisional
    while leaving the old score.
  - Changing a project repo must revoke old evidence.
  - Re-linking a different GitHub account must revoke old webhook evidence and
    grants.
- [ ] Fix `app/api/community/flags/route.js:37-40`: `forum_replies` has no
  `tenant_id`; validate the reply through its thread and remove the bogus
  predicate.
- [ ] Add a partial unique index for project repo claims:
  `(tenant_id, owner_id, lower(repo_full_name)) WHERE repo_full_name IS NOT NULL`.
  Map `23505` to `409`.
- [ ] Add unique/consistency constraints for leadership terms and report
  revisions where the application currently relies on read-then-write.
- [ ] Fix `planner_sessions.owner_user_id` uuid vs `profiles.user_id` text.

### 3.3 Webhooks, OAuth, and external identity

- [ ] Replace the GitHub webhook dedupe marker with a processed state machine
  (`processed_at`, `status`, retry/resume). The current insert commits before
  side effects, so a timeout can permanently skip aggregation.
- [ ] Make webhook notifications idempotent. Redelivery currently re-notifies.
- [ ] Sign GitHub OAuth state with HMAC. Repo selection is stored unsigned
  despite the comment claiming otherwise. Add PKCE.
- [ ] Derive GitHub identity only from provider identities or GitHub `/user`.
  `lib/github-identity.js:31-68` currently trusts user-editable
  `user_metadata`.
- [ ] Require a dedicated `CREDENTIAL_SECRET` in production. It currently falls
  back to the GitHub webhook secret.
- [ ] Validate all user-supplied URLs as `http`/`https` only. `z.string().url()`
  accepts `javascript:` and `data:` in roadmap, contributions, contests,
  directory, assets, and achievements.
- [ ] Restrict asset download redirects to known `http`/`https` hosts.

### 3.4 Auth, abuse, and tokens

- [ ] Move rate limiting off the in-memory `Map` for auth/register/username/
  flags. It resets on cold start and does not coordinate across instances.
- [ ] Make email-verification token use atomic:
  `UPDATE ... SET used_at = NOW() WHERE id = ... AND used_at IS NULL RETURNING *`.
- [ ] Add username-change cooldown, change count, and optional tombstone.
- [ ] Reject disposable email domains and align client/API password minimum
  (currently 6 vs 8).
- [ ] Add CSRF/origin checks for cookie-authenticated mutations where the
  current routes rely on same-site cookies alone.
- [ ] Narrow Auth0 Management API scopes; the default includes delete users.
- [ ] Remove the legacy Supabase auth client from `middleware.js` after
  cutover, or keep an explicit fail-safe branch.

### 3.5 Headers and browser surface

- [ ] Tighten CSP: remove `unsafe-eval`, move inline scripts to nonces/hashes,
  add `object-src 'none'`, `base-uri 'self'`, and explicit `frame-src`.
- [ ] Fix the current CSP breakage: YouTube embeds have no `frame-src`, and
  Google Fonts are blocked by `style-src`/`font-src`.
- [ ] Fix dark-theme contrast: white on `--text`, `--accent`, and orange/green
  tier pills is below accessible contrast.
- [ ] Add accessible names to admin search inputs.
- [ ] Add `id="main"` in the shared shell so the existing skip link works.

### 3.6 Lower-severity hardening

- [ ] Make community vote toggles transactional; concurrent requests can drift
  counts.
- [ ] Validate `resourceId` as UUID before querying.
- [ ] Validate `primaryDomain` against `PRIMARY_DOMAINS` in profile updates.
- [ ] Restrict help-match GET to the participants, matching PATCH.
- [ ] Cap or batch large announcement fan-out and bulk student writes.
- [ ] Add upload scanning or at least type/size policy enforcement at the
  storage boundary.

---

## 4. Backend, data, and architecture backlog

### 4.1 One scoring contract

- [ ] `app/api/github/webhook/route.js:18` uses
  `{ commit: 5, pullRequest: 20 }`; `lib/standings.js:55` uses
  `{ commit: 2, pullRequest: 12 }`. Export one constant from a shared module.
- [ ] Apply `LEAST(...)` caps inside `scoreColumns()` in `lib/standings.js`.
  `scoreStandings()` applies caps, but production reads `scoreColumns()`
  directly, so the board is uncapped.
- [ ] Add tests that execute the real board/self queries. The current tests
  exercise a pure function production does not call.
- [ ] Make the three advertised-but-unwritten kinds real or remove them:
  `contest_top`, `solution_accepted`, `event_attended`.

### 4.2 Transactions and background work

- [ ] Wrap multi-table writes in transactions: role changes, handover,
  finance, reports, bulk import, asset upload metadata, contest judging.
- [ ] Add an outbox/queue for webhook fan-out, notifications, email, and
  rollups. Do not do all of this inline in a GitHub delivery.
- [ ] Add idempotency keys for webhooks and destructive admin actions.
- [ ] Move scheduled work out of request paths: deadline reminders, analytics
  rollups, federation rollups, retention pruning, term expiry.

### 4.3 Observability and failure behavior

- [ ] Add structured logs with correlation IDs and no secret/token content.
- [ ] Wire Sentry or equivalent; `SENTRY_DSN` is reserved but unused.
- [ ] Add uptime/error-rate alerting and a documented incident owner.
- [ ] Audit silent catches in cache/feature-flag paths and make failures
  visible without leaking internals.
- [ ] Document backup/restore, rollback, and migration recovery.

### 4.4 Schema and query hygiene

- [ ] Fix duplicate migration number `036`:
  `036_roadmap_node_resources.sql` and `036_tenant_leading_indexes.sql`.
- [ ] Add missing indexes for tenant-scoped hot paths and tenant text/uuid
  comparisons.
- [ ] Add pagination and server-side filters to admin lists currently capped
  at 50/100 rows.
- [ ] Remove or fix `OR tenant_id IS NULL` in docs and code; it teaches the
  wrong invariant.
- [ ] Fix `resource_progress` predicates that mix `status = 'completed'` and
  `completed_at IS NOT NULL`.

### 4.5 Layering and coupling

- [ ] Introduce a small service layer only where transactions or reuse demand
  it: ranking/evidence, events/capacity, finance, handover, reports, webhooks.
  Do not add a generic repository or DDD layer.
- [ ] Stop route modules importing other route modules or duplicating helpers.
- [ ] Consolidate score constants, status tone, stat strips, filter toolbars,
  and tenant predicates.
- [ ] Remove the three mutation patterns in the UI in favour of one helper
  that always releases busy state and normalizes the envelope.

---

## 5. Workflows, CI, and release backlog

- [ ] PR CI: lint + encoding, unit, build, migration apply-twice against a
  disposable Postgres service, and schema/doc drift checks. No app secrets
  required.
- [ ] Keep E2E out of per-PR CI, as deliberately decided. Run it nightly or on
  a dedicated staging environment with a seeded database.
- [ ] If nightly E2E is added, use a separate Supabase project/staging DB, not
  the production database.
- [ ] Add CODEOWNERS for auth, RLS, migrations, `.github/`, and finance code.
- [ ] Enable branch protection and stop self-approved direct pushes to `main`.
  This session bypassed the rules because the workflow was broken; that must
  not become normal.
- [ ] Add secret scanning and a pre-commit check for `.env.local`, logs,
  screenshots, and generated artifacts.
- [ ] Keep Dependabot and add a monthly dependency review; do not ignore
  critical advisories.
- [ ] Make migrations CI-verifiable and document the rollback/rehearsal path.
- [ ] Add a deploy-time environment check. `assertProductionSecrets()` currently
  has one caller (the GitHub webhook), so the app can boot with placeholders.
- [ ] Resolve the doc contradiction: `.env.example` says
  `DATABASE_APP_URL` falls back to `DATABASE_URL`, while `lib/env.js:167-168`
  refuses production boot without it.
- [ ] Update `AGENTS.md` and `README.md` to match the deliberate E2E exception
  or the new staging lane.

---

## 6. Non-technical departments - integration roadmap

| Department | Build now (smallest useful version) | Next | Defer |
|---|---|---|---|
| Operations | Event edit/cancel after publish; volunteer slots and signup roster; task templates/runbooks; admin check-in and attendee export | Recurring events; waitlists; event budget linkage | Full project-management suite |
| Finance | Sponsor status editing; expense receipt/attachment; payout state; budget-head scoping; budget vs actual | Reconciliation view; approval chains; CSV/accounting export | Payroll, full ledger, invoicing engine |
| Partnerships / MoUs | Renewal task creation; sponsor-to-MoU link; owner and next action; expiry attention queue | E-signature; partner portal | Full CRM |
| Marketing / Community | Announcement composer UI (the API exists, but no UI posts announcements); campaign calendar; asset rights/usage metadata; approval before publish | Social scheduling; reusable campaign templates | Marketing automation |
| HR / People | Onboarding/offboarding checklists; suspend/deactivate; mentor accept/decline/complete; bulk role/department UI; term tracking | Availability editing; mentor matching metrics | Performance reviews, HRIS |
| Admin / Reporting | Narrative report field; CSV/PDF export; department x month coverage; audit filters/export; unified attention queue | Cross-chapter federation operations | Data warehouse |
| Succession | One read model combining checklist, brief, transfer flags, and term status; enforce last-admin guard | Automated reminders | - |

Specific evidence and gaps:

- Operations: `components/lead/EventOpsBoard.jsx:9-90` has tasks and owners, but
  no event edit/cancel after publish and no operator UI for volunteer slots.
- Finance: sponsor status cannot be advanced in the UI; expenses have no
  receipt or payout state; `proposeExpense` lacks full scope checks.
- MoUs: records, statuses, expiry, and documents exist; no renewal tasks or
  sponsor link.
- Marketing: `app/api/announcements/route.js` exists, but the only consumer is
  `components/student/OrgPanels.jsx:30`; there is no composer.
- HR: role/term assignment exists; no onboarding/offboarding checklist,
  suspension path, or mentor-session lifecycle.
- Reporting: submitted department reports and JSON export exist; no narrative
  editing, CSV/PDF, or coverage view.
- Succession: handover checklist and brief exist in separate views; no unified
  "what is still untransferred" record.

**Do not build yet:** payroll, full accounting ledger, performance reviews,
marketing automation, public partner portal, generic workflow builder, asset
inventory/checkout.

---

## 7. Technical departments - integration roadmap

| Priority | Workflow | Why |
|---|---|---|
| P0 | Contest judging: submission status/score/placement/judge/feedback; winner notification | The loop dead-ends at submission and promises points that cannot exist |
| P0 | Event attendance writes `event_attended`; lead check-in surface | Copy promises standing that is never scored |
| P0 | Accepted answer writes `solution_accepted`; revoke on unsolve | Disclosed leaderboard row is unreachable |
| P0 | Mentor session lifecycle: accept, schedule, complete, cancel; mentor view | Sessions never leave `requested`; notifications link to an admin-only page |
| P0 | One `nextNode` and verified-only progress; per-domain milestone denominator | Dashboard, roadmap page, and API give three different answers |
| P1 | Project lifecycle: team, milestones, review, showcase, credential | Projects are claimed but not managed |
| P1 | GitHub proof hardening: signed state, revocation on relink, webhook processed state, one scoring constant | Proof integrity is the product's strongest asset |
| P1 | OSS pipeline: issue matching, review verification, rejection revocation | Existing flow is close; close the trust gaps |
| P1 | Roadmap content refresh: AI/ML has 62 nodes but 2 resources; embedded has null URLs | Content quality limits real learning |
| P2 | GitHub App for installation tokens/CI checks | Only after OAuth/webhook limits are proven |
| P2 | LeetCode/Codeforces, registries, cloud labs, Discord/Slack | Defer until anti-gaming and tenancy mapping exist |

Additional technical gaps:

- `contest_submissions` has no judging fields;
  `app/(app)/admin/contests/page.jsx` promises judging that no route supports.
- Mentor sessions have schema support but no lifecycle routes.
- `lib/mentorship.js:12,34` divides by all roadmap nodes, so finishing one
  track is about 10% and the 40% mentor bar is effectively unreachable.
- Student dashboard computes progress from all completed nodes, including
  provisional claims; "Recent proof" also shows provisional completions.
- The dashboard "next step" ignores prerequisites and domain; the roadmap page
  treats optional edges as required; the API only checks required edges.
- `PLANNER_ENABLED = false` hard-disables planner and ICS while docs advertise
  them.
- Admin projects is read-only; verification actually lives in `/admin/ranking`.
- Admin and lead contests are the same feature on different endpoints.

**Anti-gaming:** apply caps in the SQL that serves the board, align webhook and
stored scores, and test the real queries.

---

## 8. Integration stack - build vs buy

| Need | Recommendation | Notes |
|---|---|---|
| Backups/PITR | Buy: Supabase backup plan | Add a restore drill; do not build backup tooling |
| Scheduler | Buy: Vercel Cron or QStash | Run reminders, analytics/federation rollups, retention pruning, term expiry |
| Email | Buy: Resend/Postmark | Verification, reminders, announcements, mentorship updates; in-app notifications remain the record |
| Error tracking | Buy: Sentry | Replace the reserved `SENTRY_DSN` with real wiring |
| Rate limiting | Buy: Upstash Redis or gateway | Current in-memory limits fail across instances |
| Payments | Buy: Razorpay/Stripe | Only after finance workflow is stable |
| E-signature | Buy: Dropbox Sign/DocuSign | MoU audit trail; later |
| Slack/Discord | Buy: incoming webhooks, small adapter | Operational alerts only; no tenancy mapping yet |
| Calendar | Keep/build: existing ICS | Enable planner/ICS before Google Calendar OAuth |
| Storage | Keep: Supabase Storage | Add upload scanning and retention lifecycle |
| Auth | Keep Auth0; retire Supabase Auth | Dual IdPs are the current integration risk |
| GitHub | Keep OAuth + webhook; GitHub App later | Revisit when CI/repo-admin permissions are needed |

Also:

- [ ] Self-host or remove `cdn.21st.dev` hero assets.
- [ ] Fix the CSP so YouTube and Google Fonts work, or remove those integrations.
- [ ] Use `qrcode` for credential verification or remove the dependency.
- [ ] Configure Auth0 password-reset email delivery and register local callback
  URLs before local browser E2E.
- [ ] Decide whether preview deployments should share the production database;
  currently they do.

---

## 9. Loose ends register

- [ ] Planner is hard-disabled but documented and nav-linked as live; dates are
  hardcoded to 2026-27.
- [ ] `docs/17` describes a nonexistent Drizzle `db/` mirror and 8 departments;
  the seed has 11.
- [ ] Docs and test counts drift: README says Supabase Auth, docs say Auth0
  primary; dependency count says 10, actual is 15; test/spec counts are stale.
- [ ] `docs/17` and `docs/18` contain real C0 control-character corruption that
  `check:encoding` misses.
- [ ] `docs/13` omits six live routes and misstates contests; `docs/15` claims
  no workflows and boot-time secret rejection.
- [ ] `.env.example` has 34 keys; about 51 are referenced in code.
- [ ] `clean-launch-data.js` lacks a production guard.
- [ ] Dead landing components and a `/student/showcases` link point nowhere.
- [ ] `EmptyState` says "for now" even when it is permanent.
- [ ] `admin/faq` shows a false empty state before fetch.
- [ ] `admin/mentors` requires pasting a raw UUID.
- [ ] Settings routing and the workspace switcher mislabel admin/lead as
  Student.
- [ ] Admin has no mobile navigation below 640px.
- [ ] Admin event actions route into student chrome.
- [ ] `admin/{event-ops,mous,directory,assets}` are redirect stubs.
- [ ] Admin/report and audit screens are read-only, capped at 100 rows.
- [ ] `admin/students` filters after `LIMIT 50`, so tier counts are wrong.
- [ ] `admin/contests` cannot close or judge contests; lead and admin surfaces
  use different APIs.
- [ ] `skip to content` is a dead link.
- [ ] Drawer/menu focus behavior is incomplete.
- [ ] Dark-theme contrast fails on several pills and accent surfaces.
- [ ] "This week" covers 13 days and `weekSessions` counts active days.
- [ ] Student dashboard presents provisional claims as progress/proof.
- [ ] Roadmap resource coverage is thin or broken in several domains.
- [ ] Test counts and doc claims are unreliable after the E2E removal.
- [ ] `qrcode` is installed but unused.
- [ ] `SECURITY.md` version claim lags `package.json`.
- [ ] `docs/22` line references are stale and propose a migration number that
  collides with an existing file.

---

## 10. Phased execution

### Phase 0 - immediate (1-2 days)

- [ ] Fix P0-1 through P0-3.
- [ ] Upgrade Next.js and rerun gates.
- [ ] Fill legal placeholders and enforce consent server-side.
- [ ] Rotate database and M2M secrets; guard destructive scripts.
- [ ] Fix or revert the uncommitted dashboard restyle.
- [ ] Verify 1440/390, dark/light, and the affected auth/tenant paths.

**Gate:** lint, encoding, unit, build, full local E2E, manual security probes.

### Phase 1 - week 1-2

- [ ] Finish Auth0 cutover: callbacks, email delivery, server-side flag,
  retire Supabase auth.
- [ ] Enable RLS with backfills, indexes, and host-based tenant resolution.
- [ ] Make webhook processing resumable; unify scoring constants and caps.
- [ ] Make reports immutable, finance scoped, handover last-admin-safe.
- [ ] Add migration apply-twice CI, CODEOWNERS, and branch protection.
- [ ] Run docs truth pass and extend the encoding checker.

### Phase 2 - week 2-4

- [ ] Contest judging and winner evidence.
- [ ] Event attendance evidence, lead check-in, admin event detail.
- [ ] Accepted-answer evidence and mentor session lifecycle.
- [ ] Announcement composer, volunteer roster, finance/MoU lifecycle.
- [ ] AppShell layout, single mutation helper, workspace-aware settings,
  mobile admin nav.
- [ ] Server-side student filters, bulk actions, audit/report filters, exports.

### Phase 3 - week 4-8

- [ ] Scheduler for reminders, rollups, retention, and term expiry.
- [ ] Real email delivery, Sentry, durable rate limiting.
- [ ] Backup/restore drill and operational runbooks.
- [ ] Onboarding/offboarding checklists and unified handover view.
- [ ] Roadmap content refresh and per-domain milestones.

### Phase 4 - only with explicit approval

- [ ] GitHub App, payments, e-signature, partner CRM, advanced technical
  integrations.

---

## 11. Do not build yet

- Payroll or a full accounting ledger.
- Performance reviews or a full HRIS.
- Marketing automation.
- A public partner portal.
- A generic workflow builder.
- Asset inventory/checkout until the document library is stable.
- Team projects before a membership/attribution model exists.
- Peer code review beyond OSS PRs before a review schema exists.
- LeetCode/Codeforces/registry sync before an anti-gaming model exists.
- Cloud labs or sandboxed execution before the cost/security boundary is
  designed.
- Discord/Slack tenancy mapping before chapter boundaries are stable.
- An AI tutor/mentor; this is currently a product non-goal.

---

## 12. Open decisions

- [ ] Is `demo-college` the real production chapter or still a demo tenant?
- [ ] Enforce Auth0-only server-side now, or keep a documented dual-auth
  transition?
- [ ] Is there a separate staging Supabase project for nightly E2E? If not,
  approve creating one.
- [ ] Which non-technical department comes first: finance/sponsorship,
  operations/events, partnerships/MoUs, marketing, or HR/onboarding?
- [ ] Which paid services are approved: Sentry, Resend, Upstash/Redis, Vercel
  Cron/QStash, Supabase PITR?
- [ ] What legal entity, privacy/terms contacts, retention period, and
  governing law replace the placeholders?
- [ ] After approval, should implementation start with Phase 0 as small PRs, or
  should detailed specs/ADRs come first for the larger workflows?

---

## 13. Audit coverage and caveats

- Static review covered the API route tree, auth/tenant helpers, migrations,
  representative lead/admin pages, ranking/evidence paths, integrations,
  docs, tests, and CI.
- Live checks were limited to `GET /api/health`; no database mutation, deploy,
  or browser session was performed for this audit.
- Contrast findings are computed from token values, not measured in a browser.
- Firefox/WebKit behaviour for `javascript:` URLs was not verified; Chromium
  neutralizes them in `_blank` links, but the input allowlist should still be
  fixed.
- Some findings are latent because `lib/auth-server.js` currently fails closed;
  they become live if that behavior changes or a new caller bypasses it.
- Re-verify every P0/P1 item before editing; this register is a starting map,
  not a substitute for a reproduction test.
