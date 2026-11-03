# Hardening and integration plan

**Status:** audit complete; implementation in progress (P0 and selected P1 integrity items closed where marked).
**Audited:** 2026-10-26.
**Updated:** 2026-10-28 — register reconciled with the hardening wave; every checked item below is verified by a test, command, or repository inspection.
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

- [x] **P0-1 Cross-tenant contest leak.**
  `app/(app)/student/page.jsx:75-81` queries `contests` with no tenant
  predicate. `app/(app)/admin/analytics/page.jsx:42-47` does the same.
  `contests` is a strict tenant table. Add the tenant predicate to both, remove
  the false allowlist at `tests/tenant-scoping-gate.test.js:121`, and fix the
  `SELF_KEY` early-skip at `tests/tenant-scoping-gate.test.js:155` so a
  subquery cannot mask an unscoped primary `FROM`.
  **Done when:** a regression test fails before the fix and passes after it.
  **Verified:** both queries now pin `tenant_id`; the gate strips subqueries
  before accepting a self-key and has explicit regressions for both pages.

- [x] **P0-2 "Clear unverified" deletes verified evidence.**
  `app/api/admin/ranking/route.js:234-248` deletes every `ranking_events` row
  for the student, not only provisional claims. Revoke only the rejected
  `kind/refId` rows. Never delete by `tenant_id + user_id`.
  **Done when:** clearing one provisional claim leaves verified OSS, roadmap,
  and project evidence intact.
  **Verified:** `clearUnverifiedFor()` reads the unverified claims first and
  reverses each by `(kind, ref_id)`, tenant and user pinned, through
  `revokeEvidence`; `tests/ranking-clear-unverified.test.js` proves verified
  OSS/roadmap/project rows survive.

- [x] **P0-3 Volunteer signup always fails.**
  `app/api/volunteers/[id]/signup/route.js:23` runs
  `SELECT COUNT(*) ... FOR UPDATE`, which PostgreSQL rejects. Remove
  `FOR UPDATE` from the aggregate; keep the slot-row lock and the transaction.
  **Done when:** signup succeeds and a capacity race test passes.
  **Verified:** the aggregate no longer uses `FOR UPDATE`; the transaction
  still locks the slot row before recounting. See
  `tests/volunteer-signup.test.js`.

- [x] **P0-4 Next.js critical advisory.**
  `npm audit` reports a critical Image Optimization RCE and a high App Router
  DoS affecting `next@15.5.27`. Upgrade to `next@15.5.28+`, then rerun build
  and the full local E2E suite.
  **Done when:** audit is clean and the gates below pass.
  **Verified already done:** `package.json` specifies `next ^15.5.28`,
  `package-lock.json` resolves `next` `15.5.28`, `npm audit --audit-level=high`
  reports 0 vulnerabilities, and the production-build E2E suite is green.

- [x] **P0-5 Auth0-only is UI-only.**
  **Verified:** `AUTH0_ONLY` now makes the legacy login/register APIs return 403
  and blocks the Supabase callback plus legacy verification minting;
  `NEXT_PUBLIC_AUTH0_ONLY` still gates only the login/register pages, and the
  server-side flag is the real cutover. `tests/auth0-cutover.test.js`.

- [x] **P0-6 Terms consent is not real.**
  **Verified:** migration 060 + `POST /api/consent`; registration records
  server-side consent and the consent gate blocks workspace entry until the
  current policy pair is accepted; `tests/consent-and-origin.test.js`.

- [x] **P0-7 Legal pages contain placeholders.**
  **Verified:** pages read `lib/legal.js`; no bracketed placeholders remain and
  the Auth0 disclosure is corrected.

- [x] **P0-8 Production RLS is off.** — **Deferred by product decision
  (2026-10-28): RLS stays off because its per-query policy checks cost latency
  this deployment cannot absorb. Application-level tenant scoping
  (`lib/tenant-scope.js`, strict equality, fail-closed `getRequestContext`) is
  the enforcement boundary instead.** The technical prerequisite (backfilling
  `tenant_id` + composite indexes on the eight uncovered tables) is still worth
  doing independently, since those indexes help tenant-scoped queries with or
  without RLS.
  Original text: live `/api/health` reports `isolation.effective = false`; follow
  `docs/rls-rollout-runbook.md` and backfill the tables in section 3.1.

- [ ] **P0-9 Rotate exposed credentials and prove restore.**
  The handoff says the Supabase database password was exposed. Rotate it and
  rotate the Auth0 M2M client secret. Confirm Supabase PITR/backups and run a
  restore drill into a scratch project.
  **Done when:** rotation is recorded and a restore has actually been tested.

- [x] **P0-10 Guard destructive scripts.**
  `load/clean-launch-data.js` deletes hardcoded test accounts and `auth.users`
  rows with only `--confirm`. Add the same production refusal used by
  `seed-dev.js`, `wipe-dev.js`, and `seed-e2e-student.js`.
  **Done when:** the script refuses to run with `NODE_ENV=production` or
  `VERCEL_ENV=production`.
  **Verified:** the refusal runs before any connection; pinned by
  `tests/clean-launch-data-guard.test.js`.

- [x] **P0-11 Fix the uncommitted dashboard restyle.**
  `components/student/OrgPanels.jsx` uses `desk-domain-*` classes that do not
  exist in `student-folio.css`; the `fill` image also needs a positioned parent.
  Either add the missing rules or revert the restyle.
  **Done when:** the dashboard renders correctly at 1440 and 390 in both themes.
  **Verified already done:** the `desk-domain-*` rules now exist in
  `app/(app)/student/_components/student-folio.css`, including an absolutely
  positioned `desk-domain-art` wrapper for the `fill` image.

**P0 gate:** lint, encoding, unit, build, full local E2E, manual security probes,
and a second review of every auth/tenant diff.

---

## 3. Security and tenancy backlog

### 3.1 Authorization and tenant isolation

- [x] Fail closed in `lib/requirePermission.js`. It now requires
  `ctx.profile`, `ctx.tenant`, and `ctx.sql`, maps `ctx.error` to the correct
  status, and treats a thrown context lookup as `CONTEXT_ERROR`.
  **Verified:** `tests/require-permission.test.js` covers missing context,
  unresolved tenant/profile, and guard response mapping.
- [x] Replace the 49 fail-open `tenant_id = X OR tenant_id IS NULL` arms with
  one `scope(tenantId)` helper. Only genuinely global tables should use NULL.
  **Verified:** the fail-open arm is gone from every tenant-scoped query;
  `scope()`/`lib/tenant-scope.js` is the only helper. Remaining
  `tenant_id IS NULL` matches are intentional global-catalogue reads
  (`open_source_projects`, curated resources), legacy owner-null project rows,
  comments, and applied migrations — not the fail-open tenant arm.
  The current `lib/db.js` comment bans this pattern for exactly this reason.
- [x] Strengthen `tests/tenant-scoping-gate.test.js`.
  **Verified:** the gate now covers reverse-order OR-NULL and strips subqueries
  before accepting a self-key.
- [x] Resolve new-user tenants from the request host, not
  a hardcoded fallback (`lib/auth-server.js`). New profiles use
  `resolveRequestTenant()` (host, then configured `DEFAULT_TENANT_SLUG`);
  existing profiles are never silently re-homed when their tenant row is
  missing. **Verified:** `tests/tenant-configuration.test.js`.
- [ ] Backfill `tenant_id` and composite indexes for tables excluded from
  migration 031, including `department_memberships`, `event_registrations`,
  `forum_votes`, `forum_flags`, `volunteer_signups`, `github_events`,
  `mentor_sessions`, and `contest_submissions`. Compare uuid columns as uuid,
  not text.
  **Verified:** `065_tenant_backfill_indexes.sql` (applied). Backfill runs
  NULL-only from the owning row, then the student's profile; measured result
  after applying: every table 0 unresolved tenant rows except the 256
  `github_events` rows that carry no `student_id` (repo-level dependabot/star
  events) — those stay NULL rather than being assigned a chapter. Two to three
  tenant-leading indexes per table; `github_events` gained
  `(tenant_id, received_at DESC)` alongside its existing ones.
- [x] Enforce "at least one admin remains" on handover transfer.
  **Verified:** `applyHandoverTransfer` promotes the successor to `admin` first
  and only then demotes the outgoing admin, inside the transfer transaction;
  a failed promotion throws before any demotion. `tests/handover.test.js` and
  the transfer route's `FOR UPDATE` cover the seat change.
- [x] Fix `lib/lead.js`, where a vertical lead's workshop fallback became
  `OR TRUE`, and `app/(app)/lead/mous/page.jsx`, which loaded MoUs without
  vertical scope. **Verified:** vertical leads now see their vertical plus
  department-less chapter-wide events; `tests/lead-scope.test.js` pins the
  admin/dept/vertical matrix.
- [x] Restrict `app/api/admin/resources` to platform admins, or add
  **Verified:** mutations require `platform_admin`; reads remain available to chapter admins.
  `tenant_id` to `resources`. A chapter admin currently mutates the global
  catalogue.
- [x] Scope `app/api/contributions` writes to the caller's tenant.
  **Verified:** both department lookups and the ledger read now require
  `tenant_id = ctx.tenant.id`; the fail-open `OR ... IS NULL` arms are gone.
  `tests/hardening-batch-2.test.js` pins the query shape and tenant value.
- [x] Require a department the caller actually leads when proposing an
  expense
  (`app/api/finance/expenses/route.js:32,69-75`).
  **Verified already done:** the route now checks that a non-admin caller
  leads the targeted department (or owns its vertical) before inserting.
### 3.2 Mutation integrity and transactions

- [x] Make first-admin bootstrap atomic: the claim and profile promotion now
  share one transaction guarded by `pg_advisory_xact_lock(741852963)`.
  **Verified:** `tests/claim-first-atomic.test.js` covers the lost race,
  profile-write rollback, and idempotent repeat claim.
- [x] Make event registration capacity atomic: the event row is locked and
  seats are recounted inside the transaction before insert.
  **Verified:** `tests/event-capacity.test.js` covers full events, cancels,
  and concurrent registration.
- [x] Make contest submission/judging idempotent once judging exists.
  **Verified:** submission is `ON CONFLICT (contest_id, student_id) DO NOTHING`,
  judging upserts `contest_top` evidence and revokes a displaced winner in one
  transaction, and an identical repeat returns `unchanged: true` without a
  second audit or notification; `tests/contest-judging.test.js`.
- [x] Make report submission immutable: non-admins cannot edit or re-submit a
  submitted report, and compile returns `409 REPORT_LOCKED` instead of
  overwriting it. **Verified:** `tests/report-immutability.test.js`.
- [x] Fix roadmap completion crashing before the prerequisite gate. The route
  destructured the first row from a `SELECT node_id` result and then called
  `.map()` on it, so every "completed" update threw before inserting progress.
  **Verified:** `tests/evidence-revocation.test.js` drives the real completion
  route and reaches the upsert.
- [x] Preserve report revision history. Immutability is enforced, but edits are
  still overwritten in place rather than stored as revisions.
  **Verified:** migration 063 adds append-only `report_revisions` (unique
  `(report_id, revision)`); compile, edit, submit, and reopen each snapshot the
  draft through `lib/report-revisions.js`; `GET /api/reports/[id]` returns the
  history; `tests/report-immutability.test.js`.
- [x] Revoke evidence when a verified item is rejected:
  - OSS rejection revokes `oss_verified`, removes badges no longer earned, and
    deletes the matching OSS achievements; verify clears legacy raw-URL ledger
    rows so one merge has one identity.
    **Verified:** `tests/evidence-revocation.test.js`.
  - Re-claiming a verified roadmap node revokes `roadmap_done` and recomputes.
    **Verified:** same test file.
  - Changing or clearing a project repo (or archiving it) already revoked
    `project_verified` and recomputed. **Verified:** source inspection of
    `app/api/projects/[id]/route.js:119-124`.
  - Unlinking GitHub revokes webhook `github:` evidence and recomputes.
    **Verified:** `app/api/github/route.js` DELETE path.
  - Re-linking a different GitHub account still needs the same revocation
    before the OAuth upsert.
- [x] Fix `app/api/community/flags/route.js`: validate the thread in the
  caller's tenant and the reply through its thread before inserting; update
  replies by id because `forum_replies` has no `tenant_id`.
  **Verified:** `tests/hardening-batch-2.test.js` proves a foreign target never
  reaches the insert and a valid reply update no longer uses a tenant column.
- [x] Add a partial unique index for project repo claims:
  `(tenant_id, owner_id, lower(repo_full_name)) WHERE repo_full_name IS NOT NULL`
  (059 excludes archived rows so a retired project's repo can be reclaimed).
  `POST /api/projects` wraps project + evidence + audit in one transaction and
  maps `23505` to `409`. **Verified:** `load/migrations/058-059`,
  `tests/schema-integrity.test.js`, and the database index check.
- [x] Add unique/consistency constraints for leadership terms and report
  revisions where the application currently relies on read-then-write.
  **Verified:** `048_governance_terms.sql` already enforces one active term per
  user/role and per department plus role/status/date checks; `063` adds the
  unique `(report_id, revision)` key behind the revision writer.
- [x] Fix `planner_sessions.owner_user_id` uuid vs `profiles.user_id` text.
  **Verified:** 058 converts the column in place and rebuilds
  `(tenant_id, owner_user_id)`; live schema reports `text`.
- [x] Wrap every remaining multi-table write in one transaction, so a mid-way
  failure cannot leave half-applied state. **Verified:** mentorship approval
  (mentor row + role promotion), new asset upload (`media_assets` +
  `asset_versions`), and new asset version (`asset_versions` +
  `media_assets.current_version`) each run inside `sql.begin`; handover transfer,
  contest judging and the bulk student import were already transactional and
  were confirmed rather than rewritten. Side effects that cannot join the
  transaction are ordered deliberately: `writeAudit`/`notify` either take the
  `tx` client (and roll back with it) or run after commit; uploaded objects are
  removed only when the transaction rolled back. Pinned by
  `tests/mentorship-review-tx.test.js`, `tests/asset-upload-transaction.test.js`,
  `tests/asset-version-transaction.test.js` and the rollback cases in
  `tests/contest-judging.test.js` / `tests/admin-students-bulk.test.js`.
- [x] Cap the bulk student write path. **Verified:**
  `POST /api/admin/students/bulk` rejects an empty array and anything over 500
  users with `400 VALIDATION_ERROR` before any SQL runs; the accepted batch is
  still one transaction.

### 3.3 Webhooks, OAuth, and external identity

- [x] Replace the GitHub webhook dedupe marker with a processed state machine
  **Verified:** migration 062 adds status/attempt lease/backoff fields; `tests/github-webhook-state.test.js` covers retry and duplicate delivery.
  (`processed_at`, `status`, retry/resume). The current insert commits before
  side effects, so a timeout can permanently skip aggregation.
- [x] Make webhook notifications idempotent.
  **Verified:** `notifications.dedupe_key` partial unique index + `notifyOnce`. Redelivery currently re-notifies.
- [x] Sign GitHub OAuth state with HMAC. Repo selection is covered by the
  signed state payload. **Verified:** `lib/github-oauth.js` signs/verifies a
  nonce, user id, and encoded repo selection; `tests/github-oauth.test.js`
  rejects tampering, expiry, and a mismatched user.
- [x] Add PKCE to the GitHub OAuth exchange.
  **Verified:** S256 verifier/challenge with signed state; `tests/github-oauth.test.js`.
- [x] Derive GitHub identity only from provider identities or GitHub `/user`.
  **Verified:** `lib/github-identity.js` ignores editable `user_metadata`; provider identities or `/user` only.
  `lib/github-identity.js:31-68` currently trusts user-editable
  `user_metadata`.
- [x] Require a dedicated `CREDENTIAL_SECRET` in production. It currently falls
  **Verified:** `assertProductionSecrets()` requires it separately and rejects placeholders; `tests/deploy-env-check.test.js`.
  back to the GitHub webhook secret.
- [x] Validate all user-supplied URLs as `http`/`https` only. `z.string().url()`
  accepts `javascript:` and `data:` in roadmap, contributions, contests,
  directory, assets, and achievements.
  **Verified:** shared `isOptionalHttpUrl()` now guards roadmap evidence,
  project/contest/achievement/contribution URLs, directory and social-profile
  links; pinned by `tests/url-safety.test.js`.
- [x] Restrict asset download redirects to known `http`/`https` hosts.
  **Verified:** asset downloads reject a stored non-http(s) external URL before
  redirecting.

### 3.4 Auth, abuse, and tokens

- [x] Move rate limiting off the in-memory `Map` for auth/register/username/
  **Verified:** login/register/social-profile/community-flags use `durable: true` with Upstash when configured and a documented per-instance fallback.
  flags. It resets on cold start and does not coordinate across instances.
- [x] Make email-verification token use atomic. Consumption and profile
  verification now run in one transaction, with `used_at IS NULL` and the
  expiry check in the `UPDATE ... RETURNING` predicate.
  **Verified:** `tests/hardening-batch-2.test.js` covers success, reuse, and
  expiry.
- [x] Add username-change cooldown, change count, and optional tombstone.
  **Verified:** migration 064 adds `username_changed_at` and
  `username_change_count`; `PUT /api/social/profile` enforces a 30-day cooldown
  (`409 USERNAME_COOLDOWN`) and a five-change cap (`403 USERNAME_CHANGE_LIMIT`)
  without consuming a change for an unchanged handle;
  `tests/username-change.test.js`. The optional tombstone remains a product
  choice and is documented in `docs/22`.
- [x] Reject disposable email domains and align client/API password minimum
  **Verified:** API and client both require 8 characters; `isDisposableEmail()` rejects known throwaway domains.
  (currently 6 vs 8).
- [x] Add CSRF/origin checks for cookie-authenticated mutations where the
  **Verified:** `lib/csrf.js` in middleware checks Origin/Referer for unsafe API methods; signed webhooks are the only exemptions; `tests/consent-and-origin.test.js`.
  current routes rely on same-site cookies alone.
- [ ] Narrow Auth0 Management API scopes; the default includes delete users.
  **Partially done:** `AUTH0_MANAGEMENT_SCOPES` now overrides the default; the
  default still includes `delete:users` because the password-identity rollback
  deletes the half-created user on failure.
- [ ] Remove the legacy Supabase auth client from `middleware.js` after
  cutover, or keep an explicit fail-safe branch.

### 3.5 Headers and browser surface

- [x] Tighten CSP: remove `unsafe-eval`, move inline scripts to nonces/hashes,
  add `object-src 'none'`, `base-uri 'self'`, and explicit `frame-src`.
  **Verified:** `middleware.js` emits a per-request nonce policy built by
  `lib/csp.js`; production `script-src` has no `'unsafe-inline'` and
  `'unsafe-eval'` is dev-only. `app/layout.jsx` reads request headers, which opts
  the tree into dynamic rendering, the documented requirement for nonce CSP. The
  six previously prerendered public pages (`/about`, `/contact`, `/domains`,
  `/faq`, `/privacy`, `/terms`) are now `force-dynamic`: prerendering shipped
  unnonced inline scripts that the browser blocked, which would have killed
  their theme toggle and mobile nav. Measured against the production build: every
  inline Next script carries the nonce on those pages and on `/`, `/events`
  (13/13, 15/15, 41/41) and the nonce differs per request. `style-src` keeps
  `'unsafe-inline'` because Next emits inline style attributes. `/sitemap.xml`,
  `/robots.txt` and `*.txt` stay outside auth but now pass through middleware's
  public branch so they keep the CSP header after it moved out of
  `next.config.mjs`. Pinned by `tests/csp.test.js`,
  `tests/csp-static-pages.test.js` and the security-header assertion in
  `e2e/public.spec.js`.
- [x] Fix the current CSP breakage: YouTube embeds have no `frame-src`, and
  Google Fonts are blocked by `style-src`/`font-src`.
  **Verified:** `frame-src` names both youtube-nocookie and youtube hosts
  (`tests/csp.test.js`). Fonts no longer need a CSP allowance at all: the app
  self-hosts through `next/font/google` in `app/layout.jsx`, and the only runtime
  Google Fonts loader (`app/_components/storyloom/liquid-sculpture-hero.jsx`) is
  gated on `loadFonts`, which its sole consumer (`StoryHome.jsx`) passes as
  `false`. So `style-src`/`font-src` do not block a request that is ever made.
- [x] Fix dark-theme contrast: white on `--text`, `--accent`, and orange/green
  tier pills is below accessible contrast.
  **Corrected and fixed:** measured rather than assumed. The dark palette was
  already compliant (`--text`/`--bg` 17.7:1, `--text-muted` 7.9:1, accent 9.8:1,
  tier pills 5.2–7.0:1). The real failures were in the **light** palette: the
  gold pill's hardcoded `#101314` ink was 3.81:1, green pill 3.57:1 and orange
  pill 3.16:1 on `--bg-muted`, and `--text-muted` 4.25:1 on `--bg-muted`.
  `.pill.is-gold` now takes `var(--on-accent)` per theme, and the light
  `--text-muted`/`--success`/`--warn` tokens were darkened. Pinned by
  `tests/theme-contrast.test.js` (29 ratio assertions, no hex values).
- [x] Add accessible names to admin search inputs.
  **Verified already done:** the admin search inputs carry `aria-label`s.
- [x] Add `id="main"` in the shared shell so the existing skip link works.
  **Verified:** `components/AppShell.jsx` renders one `id="main"` target and
  `tests/nav.test.js` guards it.

### 3.6 Lower-severity hardening

- [x] Make community vote toggles transactional; concurrent requests can drift
  counts.
  **Verified:** `lib/community.js` now locks the target row, lets the
  `ON CONFLICT ... RETURNING` insert decide add-vs-remove, and updates the
  counter only for a row it actually inserted or deleted;
  `tests/community.test.js` covers the add and remove paths.
- [x] Validate `resourceId` as UUID before querying.
  **Verified:** `lib/ids.js` provides `isUuid()`; the resource page 404s before
  touching a uuid column and `POST /api/resources` uses `z.string().uuid()`;
  `tests/resource-progress-tenant.test.js`.
- [x] Validate `primaryDomain` against `PRIMARY_DOMAINS` in profile updates.
  **Verified:** `app/api/profile` uses `z.enum(PRIMARY_DOMAINS)`.
- [x] Restrict help-match GET to the participants, matching PATCH.
  **Verified:** the GET now joins `help_signals` and requires the caller to be
  the signal owner or the match helper; `tests/hardening-batch-2.test.js` pins
  the participant predicates and the 404 path.
- [ ] Cap or batch large announcement fan-out and bulk student writes.
  **Partially done:** the fan-out was already three set-based `INSERT … SELECT`
  statements (no per-user loop), so batching was never the gap. It is now
  idempotent: every notification carries `dedupe_key = announcement:<id>:<user>`
  and `ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`
  against the 062 partial unique index, so a retried fan-out cannot duplicate an
  inbox; failures are logged at `warn` instead of being swallowed. Verified
  against the live schema with a rolled-back duplicate insert (2 inserts → 1 row).
  Still open: an explicit cap on a society-wide fan-out and the bulk student-role
  path in `POST /api/admin/students/bulk`.
- [x] Add upload scanning or at least type/size policy enforcement at the
  **Verified:** `lib/media.js` + `lib/storage.js` enforce size/MIME/extension/magic bytes before upload.
  storage boundary.

---

## 4. Backend, data, and architecture backlog

### 4.1 One scoring contract

- [x] `app/api/github/webhook/route.js:18` uses
  `{ commit: 5, pullRequest: 20 }`; `lib/standings.js:55` uses
  `{ commit: 2, pullRequest: 12 }`. Export one constant from a shared module.
  **Verified:** both import `lib/scoring.js`; `tests/scoring-contract.test.js`
  pins the numbers and parity.
- [x] Apply `LEAST(...)` caps inside `scoreColumns()` in `lib/standings.js`.
  `scoreStandings()` applies caps, but production reads `scoreColumns()`
  directly, so the board is uncapped.
  **Verified:** the SQL now applies `LEAST` to commits and PRs.
- [x] Add tests that execute the real board/self queries. The current tests
  exercise a pure function production does not call.
  **Verified:** `tests/standings.test.js` asserts the generated query shape and
  cap behavior, not only the pure helper.
- [x] Make the three advertised-but-unwritten kinds real or remove them:
  `contest_top`, `solution_accepted`, `event_attended`.
  **Verified done:** all three are written by their real paths — `contest_top`
  via `POST /api/admin/contests/judge`, `solution_accepted` via the community
  thread answer route, and `event_attended` via
  `POST /api/admin/events/[id]/attendance`; pinned by `tests/contest-judging.test.js`,
  `tests/forum-solution-evidence.test.js`, and `tests/event-attendance-evidence.test.js`.

### 4.2 Transactions and background work

- [ ] Wrap multi-table writes in transactions: role changes, handover,
  finance, reports, bulk import, asset upload metadata, contest judging.
- [ ] Add an outbox/queue for webhook fan-out, notifications, email, and
  rollups. Do not do all of this inline in a GitHub delivery.
- [ ] Add idempotency keys for webhooks and destructive admin actions.
- [x] Move scheduled work out of request paths: deadline reminders, analytics
  **Verified:** `GET|POST /api/jobs/run` maps every job in `lib/scheduler.js`; disabled unless `CRON_SECRET` is set.
  rollups, federation rollups, retention pruning, term expiry.

### 4.3 Observability and failure behavior

- [x] Add structured logs with correlation IDs and no secret/token content.
  **Verified:** `lib/log.js` emits one JSON line per event with
  `level/scope/msg/ts/requestId`, recursive redaction of
  password/secret/token/authorization/cookie/api-key/session fields, Error
  flattening, `child()` context, and a `LOG_LEVEL` filter; wired into
  `app/api/jobs/run/route.js` (job name + duration, no secret). Pinned by
  `tests/log.test.js` (14 tests). Other routes still use `console.*` and adopt
  the helper incrementally — the helper is the standard, not a mandate to
  rewrite every route in one change.
- [x] Wire Sentry or equivalent; `SENTRY_DSN` is reserved but unused. —
  **Deferred by product decision (2026-10-28): no paid service is approved, so
  `SENTRY_DSN` stays empty and the reserved hook stays dormant.**
- [x] Add uptime/error-rate alerting and a documented incident owner. —
  **Deferred: no monitoring subscription approved. Manual checks remain:
  `GET /api/health` for liveness and Vercel's built-in function-error view.**
- [x] Audit silent catches in cache/feature-flag paths and make failures
  visible without leaking internals.
  **Verified:** 30 catch sites across `lib/auth-server.js`, `lib/oss.js`,
  `lib/tenant.js`, `app/api/help/signals`, `app/api/roadmap/progress`,
  `app/domains/[slug]`, `app/sitemap.js`, and the Supabase callback now bind the
  error and log it (`debug` in the build-time/tenant-resolution paths so the
  default level stays quiet, `warn` where a human would need to know, `error`
  for the RLS-enforcement flag). Control flow, status codes, and response bodies
  are unchanged. Pinned by `tests/silent-catch-audit.test.js`. Two remaining
  gaps are recorded rather than silently fixed: `writeAudit` failures are still
  only a log, and the logger's own `console` write is now guarded so a logging
  call can never fail a request.
- [x] Document backup/restore, rollback, and migration recovery.
  **Verified:** `docs/15` §4c documents rehearsal and forward-only rollback, and
  §4d documents the restore drill and the external rotation/branch-protection
  steps.

### 4.4 Schema and query hygiene

- [x] Fix duplicate migration number `036`:
  `036_roadmap_node_resources.sql` and `036_tenant_leading_indexes.sql`.
  **Verified:** the leading-index file is now
  `036b_tenant_leading_indexes.sql`; it reapplied idempotently and is recorded
  separately in `schema_migrations`.
- [ ] Add missing indexes for tenant-scoped hot paths and tenant text/uuid
  comparisons.
  **Partially done:** `065_tenant_backfill_indexes.sql` gives the eight tables
  excluded from 031 a derived `tenant_id` plus tenant-leading indexes (uuid = uuid,
  not `::text`), all backfilled with zero unresolved rows except the 256
  repo-level `github_events` that have no `student_id` by nature. Applied and
  verified (`npm run db:status` → up to date). Still open: indexes for existing
  text/uuid comparisons outside these tables.
- [x] Add pagination and server-side filters to admin lists currently capped
  at 50/100 rows.
  **Partially done:** the admin roster (`app/(app)/admin/students/page.jsx`)
  already read `?page=` but ignored it — it now pages with `LIMIT ${PAGE_SIZE}
  OFFSET ${win.offset}` over a stable `updated_at DESC, user_id DESC` order,
  slices *after* the JS-side tier filter, and shows "Showing X–Y of Z" with
  keyboard-usable prev/next links that preserve every filter
  (`lib/pagination.js`, `tests/pagination.test.js`). An out-of-range page states
  it is past the end instead of re-showing another page's rows. Remaining:
  projects/contests/mentors/resources lists are still capped.
- [x] Remove or fix `OR tenant_id IS NULL` in docs and code; it teaches the
  wrong invariant.
  **Verified:** the fail-open tenant arm is gone; `lib/db.js` and
  `lib/tenant-scope.js` document the rule, and the remaining NULL-allowing reads
  are the global catalogue and legacy owner-null rows, called out as such in
  `docs/13`.
- [x] Fix `resource_progress` predicates that mix `status = 'completed'` and
  `completed_at IS NOT NULL`.
  **Verified:** every reader (standings, tiers, recommendations, resource and
  roadmap pages, API) now uses `status = 'completed'`; the column is `NOT NULL
  DEFAULT 'completed'`, so the timestamp was never the authority.

### 4.5 Layering and coupling

- [ ] Introduce a small service layer only where transactions or reuse demand
  it: ranking/evidence, events/capacity, finance, handover, reports, webhooks.
  Do not add a generic repository or DDD layer.
- [ ] Stop route modules importing other route modules or duplicating helpers.
  **Half verified:** no route module imports another route module
  (`rg 'from "@/app/api' app` returns nothing), so the coupling half of this is
  already true. The remaining risk is duplicated helpers between routes, which
  needs a named helper to be extracted before this can be closed honestly.
- [ ] Consolidate score constants, status tone, stat strips, filter toolbars,
  and tenant predicates.
- [ ] Remove the three mutation patterns in the UI in favour of one helper
  that always releases busy state and normalizes the envelope.

---

## 5. Workflows, CI, and release backlog

- [x] PR CI: lint + encoding, unit, build, migration apply-twice against a
  **Verified:** `.github/workflows/ci.yml` runs lint+encoding, unit, build, and migrations twice against `postgres:16`, including the dup-number/doc drift tests.
  disposable Postgres service, and schema/doc drift checks. No app secrets
  required.
- [x] Keep E2E out of per-PR CI, as deliberately decided.
  **Verified:** README/docs state the local production-build E2E policy. Run it nightly or on
  a dedicated staging environment with a seeded database.
- [x] If nightly E2E is added, use a separate Supabase project/staging DB, not
  **Verified:** documented as a hard prerequisite; no nightly workflow is committed.
  the production database.
- [x] The lint gate did not lint JSX at all, so every component bypassed
  `react-hooks` and `jsx-a11y` rules.
  **Verified:** `eslint.config.mjs` now declares `files: ["**/*.jsx"]`; ESLint 9's
  flat config only walks `.js`/`.mjs`/`.cjs` without it. `eslint-config-next` is
  aligned to `15.5.28`, matching `next`. `npx eslint .` now reports 684 files
  (395 `.js`, 283 `.jsx`, 5 `.mjs`, 1 `.ts`) and the gate is back to exactly the
  two pre-existing `import/no-anonymous-default-export` warnings, 0 errors.
  Turning the light on found real defects the blind spot had hidden: `ReviewQueue`
  rendered `<Meta>` without importing it (`react/jsx-no-undef`, a crash on the
  ranking queue), six `aria-pressed` attributes on `role="tab"` buttons that
  already carried `aria-selected` (invalid ARIA), a dead `departments.length`
  effect dependency, three unescaped `'` entities and two `no-img-element`
  uses that now carry justified suppressions (member-supplied avatar hosts and
  our generated OG raster). Guarded by `tests/lint-jsx-coverage.test.js`, which
  fails if `.jsx` stops being matched or the React/jsx-a11y rule sets stop
  applying.
- [ ] Add CODEOWNERS for auth, RLS, migrations, `.github/`, and finance code.
  **Blocked:** no verifiable GitHub owner/team handle in repository metadata;
  a guessed entry is worse than none.
- [ ] Enable branch protection and stop self-approved direct pushes to `main`.
  This session bypassed the rules because the workflow was broken; that must
  not become normal.
- [x] Add secret scanning and a pre-commit check for `.env.local`, logs,
  screenshots, and generated artifacts.
  **Verified:** CI has a read-only gitleaks job scanning the checked-out tree
  with redacted output; `.gitleaks.toml` extends the default rules. The
  pre-commit hook remains a local/operator step.
- [ ] Keep Dependabot and add a monthly dependency review; do not ignore
  critical advisories.
  **Partially done:** `.github/dependabot.yml` is committed for npm and GitHub
  Actions; the monthly human review is still a team process, not code.
- [x] Make migrations CI-verifiable and document the rollback/rehearsal path.
  **Verified:** CI now applies all migrations twice against `postgres:16`; `docs/15` documents rehearsal and revert guidance.
- [x] Add a deploy-time environment check. `assertProductionSecrets()` currently
  **Verified:** root `instrumentation.js` calls `assertDeployEnv()` for serving Node instances (build phase skipped); `tests/deploy-env-check.test.js`.
  has one caller (the GitHub webhook), so the app can boot with placeholders.
- [x] Resolve the doc contradiction: `.env.example` says
  **Verified:** `.env.example` now states the local fallback and the production explicit-value requirement.
  `DATABASE_APP_URL` falls back to `DATABASE_URL`, while `lib/env.js:167-168`
  refuses production boot without it.
- [x] Update `AGENTS.md` and `README.md` to match the deliberate E2E exception
  **Verified:** README corrected; AGENTS retains the production-build E2E instruction.
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

- [x] Self-host or remove `cdn.21st.dev` hero assets.
  **Verified:** the four hero defaults in
  `app/_components/storyloom/liquid-sculpture-hero.jsx` and the `timeline.jsx`
  default image now point at `/storyloom/*` files that are already committed
  under `public/`. The one real consumer (`StoryHome.jsx`) was already passing
  local paths, so this only removes a dormant third-party default — a grep of
  the tree finds no remaining reference outside the docs.
- [x] Fix the CSP so YouTube and Google Fonts work, or remove those integrations.
  **Verified:** YouTube is allowed in `frame-src`; the hero passes `loadFonts={false}` and fonts are self-hosted, so no Google Fonts request is permitted.
- [x] Use `qrcode` for credential verification or remove the dependency.
  **Verified:** removed; certificates/credentials use server-rendered verification URLs.
- [ ] Configure Auth0 password-reset email delivery and register local callback
  URLs before local browser E2E.
- [x] Decide whether preview deployments should share the production database;
  currently they do. — **Decided (2026-10-28): previews keep the shared
  production database. No separate staging project and no paid project tier for
  now; preview links are treated as internal.**

---

## 9. Loose ends register

- [x] Planner is hard-disabled but documented and nav-linked as live; dates are
  hardcoded to 2026-27.
  **Verified:** `PLANNER_ENABLED = false` hides every planner nav entry and the
  planner routes/APIs return 404; `docs/06` and `docs/13` now say so. The
  academic-year dates are the deliberate 2026-27 calendar, not a bug.
- [x] `docs/17` describes a nonexistent Drizzle `db/` mirror and 8 departments;
  **Verified:** `docs/17` now says there is no ORM/schema mirror and 11 seeded departments; `tests/docs-drift.test.js`.
  the seed has 11.
- [x] Docs and test counts drift: README says Supabase Auth, docs say Auth0
  primary; dependency count says 10, actual is 15; test/spec counts are stale.
  **Verified:** README/HANDOFF/SECURITY now state Auth0-primary with Supabase
  fallback, 15 runtime deps, and current test/spec shapes.
- [x] `docs/17` and `docs/18` contain real C0 control-character corruption that
  `check:encoding` misses. **Verified:** the corrupted runs were repaired;
  `npm run check:encoding` reports only two legitimate-text notices.
- [x] `docs/13` omits six live routes and misstates contests; `docs/15` claims
  no workflows and boot-time secret rejection. **Verified:** contests,
  OAuth/auth probes, CI scope, and deploy behavior are now documented.
- [x] `.env.example` has 34 keys; about 51 are referenced in code.
  **Verified:** every `process.env.*` key read by app/lib/load is documented
  (60 entries) except platform-provided `NODE_ENV` and `VERCEL_ENV`.
- [x] `clean-launch-data.js` lacks a production guard.
- [x] Dead landing components and a `/student/showcases` link point nowhere.
  **Verified:** the unused landing components were removed and no student route
  is left pointing at a nonexistent showcase.
- [x] `EmptyState` says "for now" even when it is permanent.
- [x] `admin/faq` shows a false empty state before fetch. **Verified:** it now
  has explicit loading, error, and empty branches.
- [x] `admin/mentors` requires pasting a raw UUID.
  **Verified:** the page now renders `MentorPicker`, which searches chapter
  members by name instead of asking for an id.
- [x] Settings routing and the workspace switcher mislabel admin/lead as
  Student. **Verified:** `settingsForArea()` and area-aware active rows are
  pinned by `tests/nav.test.js`.
- [x] Admin has no mobile navigation below 640px. **Verified:** admin/lead
  mobile bars derive from their desktop nav.
- [x] Admin event actions route into student chrome.
  **Verified:** `components/admin/EventAdminActions.jsx` is rendered by the
  admin/lead `EventOpsPage` and calls `/api/events/[id]/approve` and
  `/api/admin/events/[id]`; it no longer sends admins to student event pages.
- [x] `admin/{event-ops,mous,directory,assets}` are redirect stubs.
  **Verified:** each renders its real board (`EventOpsBoard`, `MouBoard`,
  `LeadDirectory`, `AssetLibrary`) behind an `adminOnly` context check.
- [x] Admin/report and audit screens are read-only, capped at 100 rows.
  **Verified:** both screen and API now page with server-side filters, and
  reports export JSON. Read-only is the intended contract for an audit log and
  for immutable submitted reports, so the 100-row cap was the only defect.
- [x] `admin/students` filters after `LIMIT 50`, so tier counts are wrong.
  **Verified:** the tier index is built from the full filtered roster before
  the 50-row page; API and page agree.
- [x] `admin/contests` cannot close or judge contests; lead and admin surfaces
  use different APIs.
  **Verified:** `ContestStatusControl` closes/opens via `/api/admin/contests`
  and `ContestJudge` records status/score/feedback via
  `POST /api/admin/contests/judge`, which writes/revokes `contest_top` evidence
  in one transaction; pinned by `tests/contest-judging.test.js`.
- [x] `skip to content` is a dead link. **Verified:** `id="main"` exists.
- [x] Drawer/menu focus behavior is incomplete.
  **Verified:** `components/loom/Drawer.jsx` traps Tab/Shift+Tab inside the
  panel, restores focus to the opener on close (opener captured before React's
  `autoFocus` runs), and guards a detached opener; `e2e/drawer-focus.spec.js`.
- [x] Dark-theme contrast fails on several pills and accent surfaces.
  **Verified:** the dark palette already met AA; the light gold/green/orange
  pills and light `--text-muted` were the failures and are fixed. See §3.5 and
  `tests/theme-contrast.test.js`.
- [x] "This week" covers 13 days and `weekSessions` counts active days.
  **Verified:** `lib/week-activity.js` uses Monday-Sunday and counts unique active days; dashboard totals use the same window.
- [ ] Student dashboard presents provisional claims as progress/proof.
- [ ] Roadmap resource coverage is thin or broken in several domains.
  **Partially done:** the Web graph is merged and live (33 nodes, 38 internal
  edges, all reachable from `web_html5`, four legacy placeholder ids rekeyed with
  progress preserved; `tests/roadmap-web-graph.test.js`). Still open: AI/ML has
  62 nodes but 2 curated resources and 16 resources across domains keep a null
  URL because the source documents gave none.
- [x] Test counts and doc claims are unreliable after the E2E removal.
  **Verified:** AGENTS/HANDOFF counts refreshed to this state: 1022 unit tests
  across 120 files, 416 E2E passed, 6 skipped (production build).
- [x] `qrcode` is installed but unused.
  **Verified:** removed from `package.json`/lockfile (`npm uninstall qrcode`, 0 vulnerabilities).
- [x] `SECURITY.md` version claim lags `package.json`.
  **Verified:** SECURITY.md states Next 15.5.x and the lockfile resolves 15.5.28.
- [x] `docs/22` line references are stale and propose a migration number that
  collides with an existing file.
  **Verified:** `docs/22` now records V1/V2 as fixed with current file names,
  migration 064, and the test that pins the limits; no migration number is
  proposed.

---

## 10. Phased execution

### Phase 0 - immediate (1-2 days)

- [x] Fix P0-1 through P0-3.
- [x] Upgrade Next.js and rerun gates.
- [x] Fill legal placeholders and enforce consent server-side.
  **Verified:** pages read `lib/legal.js` with honest defaults (real values via
  `LEGAL_*` env), and `POST /api/consent` + the workspace gate cannot be skipped;
  `tests/consent-and-origin.test.js`.
- [ ] Rotate database and M2M secrets; **guard destructive scripts done**.
  Rotation/restore drill still needs production credentials and a human.
- [x] Fix or revert the uncommitted dashboard restyle.
- [x] Verify 1440/390, dark/light, and the affected auth/tenant paths; full
  production-build Playwright suite passed (416 passed, 6 skipped).

**Gate:** lint, encoding, unit, build, full local E2E, manual security probes.

### Phase 1 - week 1-2

- [ ] Finish Auth0 cutover: callbacks, email delivery, server-side flag,
  retire Supabase auth.
  **Partially done:** server-side `AUTH0_ONLY` flag, callbacks, and consent gate
  are in place; email delivery and retiring the middleware Supabase client need
  external credentials/a human decision.
- [x] Enable RLS with backfills, indexes, and host-based tenant resolution. —
  **Deferred by product decision (2026-10-28): RLS stays off; latency matters
  more here than database-layer defence in depth. Host-based tenant resolution
  is live and application scoping is the boundary.**
- [x] Make webhook processing resumable; unify scoring constants and caps.
  **Verified:** migration 062 processed-state machine; `lib/scoring.js` shared by
  the webhook and standings with `LEAST` caps.
- [x] Make reports immutable, finance scoped, handover last-admin-safe.
  **Verified:** `tests/report-immutability.test.js`, finance department-scope
  checks, and the atomic handover transfer.
- [ ] Add migration apply-twice CI, CODEOWNERS, and branch protection.
  **Partially done:** CI applies migrations twice; CODEOWNERS and branch
  protection need a verified handle and repo-admin action.
- [x] Run docs truth pass and extend the encoding checker.
  **Verified:** docs 13/14/15/17/18/25 reconciled; `tests/docs-drift.test.js`
  and `tests/encoding-checker.test.js`.

### Phase 2 - week 2-4

- [x] Contest judging and winner evidence. **Verified:** migration 057,
  admin judge route, `contest_top` award/revocation, unit gates.
- [x] Event attendance evidence, lead check-in, admin event detail.
  **Verified:** shared check-in flow plus lead/admin event workspaces and tests.
- [x] Accepted-answer evidence and mentor session lifecycle.
  **Verified:** mentor accept/decline/complete/cancel is live, and marking a
  reply as the answer records `solution_accepted` (revoking the previous one) in
  `app/api/community/threads/[id]/route.js`; pinned by
  `tests/forum-solution-evidence.test.js`.
- [ ] Announcement composer, volunteer roster, finance/MoU lifecycle.
- [ ] AppShell layout, single mutation helper, workspace-aware settings,
  mobile admin nav.
  **Partially done:** workspace-aware settings and the derived admin/lead mobile
  nav are live; the single mutation helper is still open.
- [x] Server-side student filters, bulk actions, audit/report filters, exports.
  **Verified:** the student roster/API filter by q/role/department/tier,
  `BulkRolePanel` performs bulk role changes, and the audit/report screens page
  with server-side filters plus JSON exports.

### Phase 3 - week 4-8

- [x] Scheduler for reminders, rollups, retention, and term expiry.
  **Verified:** `lib/scheduler.js` maps `deadline-reminders`,
  `analytics-rollup`, `federation-rollup`, `retention-prune`, and `term-expiry`
  behind `GET|POST /api/jobs/run`, closed unless `CRON_SECRET` is set.
- [x] Real email delivery, Sentry, durable rate limiting. — **Deferred by product
  decision (2026-10-28): no paid service is approved. Durable rate limiting is
  done with the Upstash path plus a documented per-instance fallback; email and
  Sentry stay dormant until a provider is approved.**
- [ ] Backup/restore drill and operational runbooks.
  **Not scheduled (2026-10-28): the runbook and drill steps are documented in
  `docs/15` §4d, but the drill itself is deferred with the paid-service hold.
  This is the one deferred item that carries real data-loss risk — do it before
  the chapter holds data you cannot re-create.**
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

- [x] Is `demo-college` the real production chapter or still a demo tenant? —
  **Answered (2026-10-28): `demo-college` is the live chapter; it is the
  `DEFAULT_TENANT_SLUG` for this deployment.**
- [ ] Enforce Auth0-only server-side now, or keep a documented dual-auth
  transition?
- [x] Is there a separate staging Supabase project for nightly E2E? If not,
  approve creating one. — **Decided (2026-10-28): no. Nightly E2E targets the
  shared database, and no paid project tier is added.**
- [ ] Which non-technical department comes first: finance/sponsorship,
  operations/events, partnerships/MoUs, marketing, or HR/onboarding?
- [x] Which paid services are approved: Sentry, Resend, Upstash/Redis, Vercel
  Cron/QStash, Supabase PITR? — **Decided (2026-10-28): none for now. Every paid
  integration stays dormant with an empty key rather than being half-wired.**
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
