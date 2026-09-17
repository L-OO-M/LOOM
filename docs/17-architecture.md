# Architecture

How LOOM fits together: request path, roles, data, pages, workflows, and how to contribute. Ground truth is the code and the live schema (`C:\Users\asus\AppData\Local\Temp\opencode\schema.txt`, 62 tables); companion references are `docs/13-api-reference.md` (endpoints) and `docs/14-database-reference.md` (tables by migration).

## 1. System overview

Next.js 15 (React 19) monolith — there is no custom backend. Route handlers under `app/api/` talk directly to a single shared Postgres (Supabase-hosted, PgBouncer pooler `:6543`) with one connection string:

- **Auth**: Supabase Auth. Browser/session via `@supabase/ssr` cookies; server identity revalidated per request with `getUser()`.
- **Data**: `postgres` package via `lib/db.js` — `postgres(env.DATABASE_URL, { max: 10, idle_timeout: 10, prepare: false })`. `prepare: false` is mandatory: the pooler runs in transaction mode, where named prepared statements vanish between checkouts. Drizzle (`db/tenant-schema.js`, `db/control-plane-schema.js`) is a type/query mirror; most handlers use raw `sql` template literals.
- **Tenancy**: single-DB row-level tenancy. `profiles.tenant_id → tenants.id` is the root; every tenant query filters on it. Host→tenant resolution lives in `lib/tenant.js` (`getTenantFromRequest`, 60s memoized `queryTenant` in `lib/db.js`).
- **Async work**: `POST /api/jobs/github/process` (QStash worker) aggregates webhook events into `student_daily_activity`; `load/rollup-analytics.js` / `load/rollup-federation.js` compile snapshots. Rate limits are in-memory per instance (see `docs/13-api-reference.md`).
- **Config surface**: `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`, `DEV_TENANT_SLUG`, `GITHUB_WEBHOOK_SECRET`, QStash/Upstash, R2, Sentry). See `.env.example`.

## 2. Request lifecycle

```
middleware.js → getRequestContext() → can() → handler → writeAudit()
```

1. **middleware.js** — cookie-local `getSession()` only (no network round-trip; previously `getUser()` here cost a round-trip per navigation). Exact-match public allowlist (`/`, `/about`, `/faq`, `/events`, `/login`, `/register`, `/setup`, `/auth/callback`, `/api/health`, `/api/chapters`, `/api/public/*`, `/api/admin/check-setup`, `/api/admin/claim-first`, `/api/github/webhook`) plus prefix rules for `/verify/*` and `/domains/*`. Everything else: APIs get machine-readable `401 UNAUTHORIZED`, pages redirect to `/login?redirect=…`. Static assets and `_next/*` are never gated.
2. **getRequestContext** (`lib/auth-server.js`) — the single source of truth for authN/authZ. `getUser()` revalidates the JWT; loads `profiles` by `user_id` (auto-creates a `student` row on first login from signup metadata, plus instant `general` department memberships — best-effort, never breaks login); resolves/backfills `tenants`; attaches `department_memberships` to the profile (shape matches `lib/permissions.js`); maps `platform_admins` rows to effective role `admin`. `adminOnly: true` returns `FORBIDDEN` for non-admins. **Tenant is always derived server-side from the profile — never trusted from the client.**
3. **can()** (`lib/permissions.js`) — the 20-action matrix (Section 3 of the Website Plan) as a pure function: `can(user, action, scope) → { ok, note }`. `note` carries the conditional cells: `needs_approval` (dept-lead society posts), `needs_signoff` (suspend), `recommend_only` (VL on budget), `suggest_only` (VL on FAQ), `view_only` (VL on advisor), `limited` (dept-lead directory = name+dept), `own_feed` (dept announcements), `own_only` (roster/exports). Admins and `platform_admin` bypass (`isAdmin`). Legacy `role === "admin"` boundaries keep working via `isAdmin`; new code uses `can()`.
4. **Handler** — zod validation → tenant-scoped SQL → response envelope `{ ok: true, data }` / `{ ok: false, error: { code, message } }` (`lib/api.js`).
5. **Audit** — mutations call `writeAudit()` (`audit_logs`) and usually `notify()` (`notifications`). Both are best-effort: they never break the request.

`homeForRole` (`lib/auth.js`) is convenience only, never a gate: `admin`/`platform_admin` → `/admin`, `dept_lead`/`vertical_lead` → `/lead`, everyone else → `/student`. Layouts re-enforce access.

## 3. Roles

Five levels plus platform: `student` (General) < `core` < `dept_lead` (Head and Co-Head share one tier) < `vertical_lead` < `admin` (Super Admin); `platform_admin` implies admin. Hierarchy with inheritance lives in `lib/auth.js` (`roles`, `hasRole`); capability scoping (department/vertical/ownership) lives in `lib/permissions.js`. Mentorship is **not** a role — it derives from an approved `mentor_applications` row + the mentor bar (`lib/mentorship.js`); the legacy `mentor` role value was retired to `core` (migration 015).

| Role | How it is reached |
|------|-------------------|
| `student` | Signup default. Register form captures name/roll_number/branch/year + department picks; `getRequestContext` creates the profile and instant `general` memberships on first login. |
| `core` | Request + grant. Member clicks request (`POST /api/departments/[id]/request-core` sets `core_requested`); the department's Head/Co-Head grants (`PATCH …/members/[userId]` `{level: core}`). Role syncs **upward only** — never demotes. |
| `dept_lead` | Admin assigns with department scope (`PATCH …/members/[userId]` `{level: dept_lead}` is admin-only). Heads/co-heads are indistinguishable in code by design. |
| `vertical_lead` | Admin assigns with vertical scope (`technical`/`non_technical` on the profile). Owns their vertical's content, calendar, and approvals; `recommend_only` on budget, `suggest_only` on FAQ, `needs_signoff` on suspend. |
| `admin` | Setup claim (`POST /api/admin/claim-first` from `/setup` — only while `platform_admins` is empty) or promotion via `/api/admin/students` single/bulk endpoints (audited). Sees everything. |
| `platform_admin` | Row in `platform_admins`; `getRequestContext` maps it to effective role `admin` regardless of stored role. |

## 4. Data domains

~62 tables grouped by product area. One line each: what it stores → readers/writers (derived from route/page filenames; `ctx` = `getRequestContext`).

**Identity & Org** — who belongs where.

| Table | Stores → read / written by |
|-------|----------------------------|
| `profiles` | Identity/role/tenant/vertical/roll_number/branch — the single source of truth → `ctx`, `GET/PATCH /api/profile`, `GET/PATCH /api/admin/students`, bulk assign; written by first-login auto-create, grant upward-sync, admin edits |
| `tenants` | Chapter rows (`demo-college` seeded) → `queryTenant`, `/api/network`, public APIs; written by `seed-control-plane.js` |
| `tenant_domains` | Host→tenant mapping → `getTenantFromRequest` (webhook, `/api/public/*`); written by seed |
| `departments` | 8 seeded org units + head/co-head pointers + vertical → `/api/departments`, `/api/public/departments`, `/domains*`, lead/admin overviews; written by `seed-departments.js` (no admin UI — DB-managed) |
| `department_memberships` | User↔dept `level` (general/core/dept_lead) + `core_requested` + `succession_ready` → attached on every `ctx`, rosters; written by join / request-core / grant PATCH |
| `platform_admins` | Setup claimants → `ctx` effective role; written by `/api/admin/claim-first` |
| `user_profiles` | Public social cards (unique username) → `/api/social/profile`, `/student/[username]`, discover |
| `followers` | Follow edges → `/api/social/connections`, profile pages |
| `user_endorsements` | Skill endorsements → `/api/social/connections?mode=endorse`, profile pages |

**Learning** — roadmaps, resources, builds, guidance.

| Table | Stores → read / written by |
|-------|----------------------------|
| `roadmap_nodes` | 7 seeded text-keyed nodes (domain is the catalog key) → roadmap pages, `/api/roadmap`; written by `/api/admin/roadmaps`, `seed-content.js` |
| `student_roadmap_progress` | Per-student node status (unique student+node) + auto-awarded achievements → `POST /api/roadmap/progress`; read by insights/leaderboard |
| `resources` | 29 seeded library rows (kind/domain/level) → resource pages, `/api/resources`; written by `/api/admin/resources`, seeds |
| `resource_progress` | Per-student completions → resource detail pages (write path is page-local, no dedicated endpoint) |
| `projects` | Student builds + tags + repo_url → `/api/projects(+[id])`, `/api/public/projects` showcase, project pages |
| `repositories` | Linked GitHub repos → `/api/github`, `/student/github` |
| `mentors` | Approved mentors (user_id-keyed) → `/api/mentors`, `/api/mentor/*`, `/student/mentorship` (+`[id]`, `/sessions`, `/manage`) |
| `mentor_applications` | Applications + eligibility snapshot (pending/approved/rejected) → `/api/mentorship/apply`, `/api/admin/mentor-applications` |
| `mentor_sessions` | Mentor↔student sessions → `/api/mentors/[id]/book`, `/api/my-sessions`, `/api/mentor/requests` |
| `mentor_reviews` | 1–5 ratings (unique mentor+reviewer) → `/api/social/discover` (mentor review), discover page |

**Proof & Credentials** — verifiable outcomes.

| Table | Stores → read / written by |
|-------|----------------------------|
| `skill_badges` | Tier 1–3 badge definitions → `/api/admin/badges`, verification page |
| `student_achievements` | Issued badges (unique per student+badge+source) → `/api/credentials`; written by progress auto-awards, OSS verify, `POST /api/admin/achievements` |
| `verifiable_credentials` | Signed share links (`cred_*`, HMAC signature) → `POST /api/credentials`; verified at `/verify/credential/[id]` |
| `credential_views` | Share-link view counts → written on verify-page views |
| `certificates` | Per-event attendance certs (unique code, issued once at check-in) → attendance action; read at `/student/certificates(+[code])` |
| `oss_badges` | Per-student OSS badge keys → written by webhook/admin verify; read by opensource pages |

**Community** — forums, knowledge, broadcast, ledger.

| Table | Stores → read / written by |
|-------|----------------------------|
| `forum_threads` / `forum_replies` / `forum_votes` / `forum_flags` | Threads, replies, vote toggles, moderation flags → `/api/community/*`; mod queue at `/api/admin/community`, flags page |
| `wiki_pages` / `wiki_edit_requests` | Versioned pages (unique tenant+slug) + student suggestions → `/api/community/wiki(+[slug])`, wiki pages |
| `code_snippets` | Shared snippets → `/api/community/snippets`, snippets page |
| `announcements` | Society/vertical/department broadcasts, fanned out to `notifications` → `GET/POST /api/announcements` (visibility derived from memberships) |
| `member_contributions` | Contribution ledger (project/competition/certification/event; self- or lead-logged) → `GET/POST /api/contributions`, lead `recentLogs`, report export |
| `faqs` | Public Q&A per tenant → `/faq` page (published only), `GET/POST/PATCH /api/admin/faq`, `seed-faq.js` |
| `notifications` | Per-user inbox → `GET /api/notifications`, mark-read; written by every `notify()` call |

**Events & Attendance** — workshops, contests, presence.

| Table | Stores → read / written by |
|-------|----------------------------|
| `events` | Workshops/hackathons/talks (+`department_id`, `proposed` status) → `/api/events`, approve flow, `/api/public/events`, event + domain pages |
| `event_registrations` | Signups, door-code check-in, feedback (unique event+student) → `/api/events/[id]`, attendance action |
| `event_materials` | Attached link materials → `POST /api/events/[id]/materials`, event detail |
| `contests` / `contest_registrations` / `contest_submissions` | Challenges + entries → `/api/contests`, `/api/admin/contests`, contest pages |

**Operations** — reports, handover, finance, volunteers.

| Table | Stores → read / written by |
|-------|----------------------------|
| `volunteer_slots` / `volunteer_signups` | Titled capacity slots per event + one-seat-per-member signups → `GET/POST /api/volunteers`, `POST/DELETE …/[id]/signup` (capacity enforced live) |
| `dept_reports` | One row per (department, month): auto-compiled JSON draft → submitted → `GET/POST /api/reports`, `GET/PATCH …/[id]`, compiled from the lead console |
| `handover_checklists` | Admin continuity items + done flags → `GET/POST /api/handover`, `PATCH …/[id]` |
| `budget_heads` | Budget envelopes, optional vertical (NULL = society-wide) → `GET /api/finance`, admin finance page (created directly in DB) |
| `expenses` | Proposed→approved/rejected spend → `POST` (leads+ propose) / `PATCH` decide (admin only) `/api/finance/expenses` |
| `sponsorships` | Sponsor pipeline→committed→received → `POST/PUT /api/finance/sponsorships` (admin) |

**GitHub pipeline** — link → deliver → verify → aggregate.

| Table | Stores → read / written by |
|-------|----------------------------|
| `github_connections` | User↔GitHub username link → `GET/POST /api/github`, github page |
| `github_events` | Raw deliveries keyed by idempotency (`delivery-event`) → written by webhook; counted by admin summary |
| `open_source_projects` | Curated tracked repos (unique repo URL, nullable tenant = global) → `GET/POST /api/opensource/projects`, opensource + network pages |
| `student_oss_contributions` | PR/issue claims (claimed→verified/rejected, unique student+PR) → claim endpoint, admin verify, webhook auto-verify on merged PR |

**Analytics** — rollups, never edited by hand.

| Table | Stores → read / written by |
|-------|----------------------------|
| `student_daily_activity` | Per-day commits/PRs/reviews/score → written by `jobs/github/process`; read by insights, github page |
| `student_analytics_snapshots` | Daily per-student rollup → written by `rollup-analytics.js`; read by `/api/insights` |
| `cohort_metrics` / `roadmap_node_analytics` / `mentor_effectiveness` | Tenant/cohort/node/mentor aggregates → written by rollups; read by admin analytics, insights |
| `federation_metrics` | Cross-chapter totals → written by `rollup-federation.js`; read by `/api/network` |
| `chapter_profiles` / `chapter_partnerships` | Public chapter cards + federation edges → `/api/chapters`, `/api/network`, network pages |

**Control plane** — flags, trail, runner state.

| Table | Stores → read / written by |
|-------|----------------------------|
| `feature_flags` | Per-tenant kill-switches (`github_integration`, `contests`, `mentorship`) → `queryTenant().features`, webhook gate; written by `/api/admin/flags` |
| `audit_logs` | Every audited mutation (actor/action/resource/before/after) → `writeAudit`; read by `/api/admin/audit`, audit page |
| `schema_migrations` | Applied-migration ledger → written by `node load/migrate.js` |
| `tenant_database_routes` | Present in the Drizzle control-plane mirror but **absent from the live DB** — treated as reserved, unused |

## 5. Page map

**Public** (middleware allowlist; honest empty states, no mocks).

| Page | Purpose |
|------|---------|
| `/` | Landing: living-network hero, live events/projects pulse, domain rails → `/register` |
| `/about` | Society story + department index |
| `/faq` | Published FAQs only |
| `/events` | Upcoming public events; prompts sign-in to register |
| `/domains` + `/domains/[slug]` | Department catalog + per-department page (workshops, projects); unknown slugs get an empty state, not a 404 |
| `/login` / `/register` | Supabase auth; register captures name/roll/branch/year + department picks into `user_metadata` |
| `/setup` | First-admin claim (refuses once `platform_admins` is non-empty) |
| `/verify` + `/verify/credential/[id]` | Public proof check: HMAC re-verified, view counted |
| `/auth/callback` | Supabase code exchange |

**App** (session-gated; layouts re-enforce roles).

| Area | Pages |
|------|-------|
| `/student` | Home dashboard (roadmap progress, GitHub, threads, horizon). Learn: `roadmap`, `roadmap/[nodeId]`, `resources`, `resources/[resourceId]`, `projects`, `projects/new`, `projects/[id]`, `github`, `opensource`, `contests`, `contests/[id]`. Gather: `events`, `events/[id]`, `community/forums(+[id])`, `community/wiki(+[slug])`, `community/snippets`, `mentorship(+`[id]`, `/sessions`, `/manage`)`, `network(+[slug])`, `discover`. Proof: `credentials`, `certificates(+[code])`, `insights`, `leaderboard`. Self: `[username]`, `notifications`, `onboarding`, `settings`, `privacy`. |
| `/lead` | Lead console (shared query in `lib/lead.js` with `GET /api/lead/overview`): led departments + roster + core requests, workshops, `proposed` approval queue (VL/admin), vertical calendar with conflict detection (VL/admin), succession flags, recent contribution logs, report compile/submit entry. |
| `/admin` | `overview` command deck (per-dept cards + approval counts); `students(+[id])` roles/memberships + bulk; `analytics` SaaS dashboard (`/api/analytics/summary`); `audit` trail; `community` mod queue; `flags` kill-switches; `contests`, `events` (+attendance), `opensource` (curation + claims), `verification` (badges/achievements/mentors); `projects`, `resources`, `roadmaps` content; `reports` submitted + export; `finance` heads/expenses/sponsors; `faq` manager; `settings`. |

## 6. Key workflows

1. **Signup → member.** Register (metadata: name, roll_number, branch, year, department slugs) → Supabase user → first `getRequestContext` creates `profiles(student)` + `general` memberships → lands on `/student/onboarding` → roadmap. No approval anywhere.
2. **Core request → grant.** Member `POST …/[id]/request-core` (creates `general` membership with `core_requested=true` if none) → Head/Co-Head sees request in `/lead` roster → `PATCH …/members/[userId]` `{level: core}` → profile role syncs upward to `core` → `notifications` row + `audit_logs` entry.
3. **Workshop propose → approve.** Dept lead `POST /api/events` with `scope: department` + own `departmentId` → live (`upcoming`, attached). Same lead with `scope: society` → `proposed` → VL/admin sees it in `/lead` proposed queue or `/admin/events` → `POST /api/events/[id]/approve` `{approve}` → `upcoming` (or `cancelled`) + author notified.
4. **OSS claim → webhook verify.** Student links GitHub (`/api/github`) → claims PR URL in a tracked repo (`claimed`, 20/min) → webhook delivery (HMAC-checked, 120/min/tenant) stored idempotently in `github_events` → merged-PR in tracked repo auto-verifies the claim + awards `oss_badges`/achievements + notifies → queued aggregation via QStash worker. Admins can also verify/reject manually (same side effects, idempotent).
5. **Monthly report → export.** Dept lead opens `/lead` → draft auto-compiles from live counts (contributions by kind, events held, new members, upcoming) → `POST /api/reports` (one row per dept+month) → edits → `PATCH …/[id]` `{status: submitted}` (terminal; only admin reopens) → VL/admin reads at `/admin/reports` → `GET /api/reports/export?scope=semester|annual` downloads JSON.
6. **Expense propose → approve.** Dept/VL/admin `POST /api/finance/expenses` (`proposed`, head + optional department) → admin-only `PATCH` `{approved|rejected}` + `decided_by` → society/VL-visible spend updates in `GET /api/finance`. VLs are `recommend_only` — they cannot decide.
7. **Webhook ingestion + kill-switch.** GitHub `POST /api/github/webhook` (tenant from host header, HMAC `x-hub-signature-256`, ping acked without storage) → if `github_integration` flag off for the tenant: ack `{accepted: false, reason: GITHUB_INGESTION_PAUSED}`, store nothing (opt-in since migration 020; toggled at `/admin/flags`) → else store idempotently → best-effort OSS auto-verify → 200. Failures after signature check never fail the ack.

## 7. Contributing guide

**Local setup.** Copy `.env.example` → `.env.local` (fill `DATABASE_URL` pooler string, Supabase keys, `DEV_TENANT_SLUG`), `npm install`, `npm run dev`. Never commit `.env.local`.

**Migrations.** Tracked, ordered, idempotent: add `load/migrations/NNN_name.sql` (every statement `IF NOT EXISTS`, constraints added via `DROP CONSTRAINT IF EXISTS` + re-add), apply with `node load/migrate.js` (`npm run db:migrate`). The runner records names in `schema_migrations` and skips applied files. Never edit an applied migration — write a new one.

**Seeds.** `npm run db:seed` = control-plane (tenant, domains, flags) + content (roadmap nodes, resources). Then `node load/seed-departments.js` (8 departments, non-technical start inactive) and `node load/seed-faq.js` (idempotent on `(tenant_id, slug)`). `node load/seed-dev.js` (`db:seed:dev`) is **LOCAL ONLY** — it refuses production, and must never run against the shared DB. `node load/wipe-dev.js --confirm` removes seed/dummy rows only; `--full` truncates all data tables (keeps schema + ledger); both refuse production.

**Tests.** `npm test` (vitest, `tests/**/*.test.js`, node env, `@` alias). `npm run test:e2e` (Playwright: chromium + Pixel 7, `reuseExistingServer`, `webServer.timeout: 120000` — first run pays Next.js cold compile, so allow ~2 min before judging a failure). `npm run lint` (eslint `next/core-web-vitals`) must pass before handing off.

**Conventions.** JS only (no TypeScript). Every `<Link>` carries `prefetch={false}` (75+ usages — keeps pooler-backed navigations cheap). Page components issue sequential awaits rather than parallel batches against the pooler. Every mutating route validates with zod, scopes by server-derived tenant, and calls `writeAudit()` (+ `notify()` where a human waits). Empty states are honest sentences ("No workshops scheduled for X yet"), never mock data or silent blanks. One concern per commit with a topic-prefixed message (`Membership flows: …`, `Operations: …`); see `git log --oneline`.

## 8. Post-audit hardening (no-dummy-data pass)

- Seed wipe: all seed-user-* rows removed from the shared DB via load/wipe-dev.js --confirm; orphaned content (1 event, 1 thread, 1 wiki page) reassigned to the real admin;  20 fixed a live webhook 500 (
ormalized.payload never existed) found by HMAC-signed delivery tests.
- Tenant renamed Demo College ? MSIT (	enants.name, chapter_profiles.public_name); seed-control-plane is now insert-only on tenant name so reruns never clobber it.
- New surfaces: LevelGuide (auth pages explain all 5 levels; roles are granted, never self-selected), StatTiles (visual metric tiles on student/admin/lead dashboards), /admin/departments (create/rename/archive), /admin/handover (transfer checklist board), budget-head creation on /admin/finance, global pp/error.jsx + pp/not-found.jsx, role-scoped assignment in PATCH /api/admin/students (dept_lead requires department + fills Head?Co-Head slots; vertical_lead requires vertical).


## 9. Security invariants (ported from retired 02-tenant-and-security-model)

- Tenant identity never comes from the client: authority is profiles.tenant_id (lib/auth-server.js); host/domain lookup (lib/tenant.js) is only a fallback helper for public pages.
- Every mutation runs session ? tenant membership ? role check (lib/permissions.js can()) ? zod validation ? standard {ok,data/error} envelope ? writeAudit() (+ 
otify() where a human waits)./api/* returns machine 401 {ok:false}; pages redirect to /login.
- GitHub webhook verifies x-hub-signature-256, rejects unsigned/mismatched with 401, dedupes on GitHub delivery id, and honors the per-chapter pause gate (GITHUB_INGESTION_PAUSED) before storing anything.
- Audit rows carry actor, tenant, action, resource type/id, before/after, request metadata, timestamp; append-only in app flows.
- Secrets live only in env / .env.local (untracked). load/*.js scripts share load/env-local.js and refuse to run without DATABASE_URL; hardcoded connection strings were purged.

