# Architecture

How LOOM fits together: request path, roles, data, pages, workflows, and how to contribute. Ground truth is the code plus tracked migrations; companion references are `docs/13-api-reference.md` (endpoints), `docs/14-database-reference.md` (tables by migration), and `DEPARTMENT_AUDIT.md` (department responsibility/interface coverage).

## 1. System overview

Next.js 15 (React 19) monolith — there is no custom backend. Route handlers under `app/api/` talk directly to a single shared Postgres (Supabase-hosted, PgBouncer pooler `:6543`) with one connection string:

- **Auth**: Auth0 is the primary front door (`@auth0/nextjs-auth0`); Supabase Auth remains the legacy/E2E fallback. `lib/user-identities.js` maps a verified Auth0 `sub` (or a verified Supabase OAuth identity) to one canonical `profiles.user_id`, so adding a provider does not split the account. Existing Supabase accounts migrate with `load/auth0-migrate.mjs`; see `24-auth0-migration.md`.
- **Data**: `postgres` package via `lib/db.js` — `postgres(env.DATABASE_URL, { max: 10, idle_timeout: 10, prepare: false })`. `prepare: false` is mandatory: the pooler runs in transaction mode, where named prepared statements vanish between checkouts. There is no ORM or schema mirror; handlers use raw `sql` template literals.
- **Tenancy**: single-DB row-level tenancy. `profiles.tenant_id → tenants.id` is the root; every tenant query filters on it. Host→tenant resolution lives in `lib/tenant.js` (`getTenantFromRequest`, 60s memoized `queryTenant` in `lib/db.js`).
- **Async work**: the GitHub webhook aggregates inline into `student_daily_activity`; contribution-calendar reads merge with it per day using `max()`, never sum. `load/rollup-analytics.js` / `load/rollup-federation.js` compile snapshots. The durable outbox (`lib/outbox.js`, migrations 066/067/096) uses tenant-local dedupe, `FOR UPDATE SKIP LOCKED`, lease-token ownership, bounded retries, dead letters, and an admin retry/health API. Atomic attendance enqueues `ranking.recompute`; `GET /api/jobs/run?job=outbox-drain` runs the worker and must be scheduled by deployment operations.
- **Config surface**: `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DATABASE_APP_URL`, `NEXT_PUBLIC_APP_URL`, `DEV_TENANT_SLUG`, `DEFAULT_TENANT_SLUG`, `DEV_TENANT_DOMAIN`, `GITHUB_WEBHOOK_SECRET`, `CREDENTIAL_SECRET`, QStash/Upstash, R2, Sentry). See `.env.example` and `docs/15-deploy-and-operations.md`.

## 2. Request lifecycle

```
middleware.js → getRequestContext() → can() → handler → writeAudit()
```

1. **middleware.js** — `auth0.getSession(request)` resolves the one identity provider and `auth0.middleware(request)` rolls the session cookie so it survives inactivity; there is no Supabase session client any more. Exact-match public allowlist (`/`, `/about`, `/faq`, `/events`, `/login`, `/register`, `/setup`, `/auth/signout`, `/auth/supabase-callback`, `/verify-email`, `/api/auth/providers`, `/api/auth/state`, `/api/health`, `/api/chapters`, `/api/public/*`, `/api/admin/check-setup`, `/api/admin/claim-first`, `/api/github/webhook`) plus prefix rules for `/verify/*`, `/u/*`, `/domains/*` and `/events/*`. Everything else: APIs get machine-readable `401 UNAUTHORIZED`, pages redirect to `/login?redirect=…`. Static assets and `_next/*` are never gated.
2. **getRequestContext** (`lib/auth-server.js`) — the single source of truth for authN/authZ. It resolves one canonical `profiles.user_id`, loads the server-owned tenant, active/expired department memberships, scoped grants, term data, and platform-admin flags, and returns a request-scoped SQL handle. `adminOnly: true` returns `FORBIDDEN` for non-admins. **Tenant is always derived server-side from the profile — never trusted from client input.**
3. **can()** (`lib/permissions.js`) — the 49-action capability matrix as a pure function: `can(user, action, scope) → { ok, note }`. Organizational title, scope, and capability are evaluated separately. Active vertical/event grants are authoritative; department authority comes from a live `dept_lead` membership for the named department. General/Core or expired memberships never widen a workspace. `resolveDepartment` honours explicit `departmentId`/`departmentSlug`, falls back only when the caller leads exactly one department, and treats `departmentId: null` as society-wide. Separation-of-duty checks (own work, own budget, own event/handoff decision) run before the admin bypass. `manage_leads` remains a denied/deprecated compatibility action; Sponsorship and PR use distinct capabilities.
4. **Handler** — zod validation → tenant-scoped SQL → response envelope `{ ok: true, data }` / `{ ok: false, error: { code, message } }` (`lib/api.js`).
5. **Audit** — ordinary mutations call `writeAudit()` and usually `notify()`. Governance-critical transitions (approval, credential key, event history, workflow handoff) insert their audit/history row in the same transaction. `audit_logs`, `event_status_history`, and `approval_decisions` are append-only in the database; retention can delete old audit rows only through the guarded private function. Notifications remain best-effort so delivery failure does not roll back business state.

`homeForRole` (`lib/auth.js`) is convenience only, never a gate: `admin`/`platform_admin` → `/admin`, `dept_lead`/`vertical_lead` → `/lead`, everyone else → `/student`. Layouts re-enforce access.

## 3. Roles

Five levels plus platform: `student` (General) < `core` < `dept_lead` (Head and Co-Head share one tier) < `vertical_lead` < `admin` (Super Admin); `platform_admin` implies admin. Hierarchy with inheritance lives in `lib/auth.js` (`roles`, `hasRole`); capability scoping (department/vertical/ownership) lives in `lib/permissions.js`. Mentorship is **not** a role — it derives from an approved `mentor_applications` row + the mentor bar (`lib/mentorship.js`); the legacy `mentor` role value was retired to `core` (migration 015).

| Role | How it is reached |
|------|-------------------|
| `student` | Signup default. Register form captures name/roll_number/branch/year + department picks; `getRequestContext` creates the profile and instant `general` memberships on first login. |
| `core` | Request + grant. Member clicks request (`POST /api/departments/[id]/request-core` sets `core_requested`); the department's Head/Co-Head grants (`PATCH …/members/[userId]` `{level: core}`). Role syncs **upward only** — never demotes. |
| `dept_lead` | Admin assigns through `PATCH /api/admin/students` with a department and term. Heads/co-heads are co-equal in capability. Roster endpoints cannot create, demote, or delete a leadership seat because the profile, term history, membership term, head/co-head pointer, and scoped grant must change in one transaction. |
| `vertical_lead` | Admin assigns with vertical scope (`technical`/`non_technical` on the profile). Owns their vertical's content, calendar, and approvals; `recommend_only` on budget, `suggest_only` on FAQ, `needs_signoff` on suspend. |
| `admin` | Setup claim (`POST /api/admin/claim-first` from `/setup` — only while `platform_admins` is empty, and only with the `FIRST_ADMIN_CODE` bootstrap secret) or promotion via `/api/admin/students` single/bulk endpoints (audited). Sees everything. |
| `platform_admin` | Row in `platform_admins`; `getRequestContext` maps it to effective role `admin` regardless of stored role. |

**Governance & terms (migrations 048, 087, 094, 096).** Leadership is term-bound and permanent only for founders. `profiles.role_term_start/role_term_end`, `department_memberships.term_start/term_end`, and append-only `leadership_terms` preserve the appointment history; expired positions lose authority without erasing their title/history. `scoped_role_grants` records independently expiring vertical, department, event, project, or tenant authority and validates that the member and resource belong to the same tenant. Grant synchronization preserves unrelated scoped assignments by default; global role replacement and handover explicitly revoke all leadership grants. Migration 087 makes founder permanence structural: locked founder seats/profile rows cannot be deleted, unlocked, or truncated. Domain non-interference is enforced by `can()`/`lib/scope.js`, not by trusting a profile label. Full model: `docs/23-governance-and-terms.md`.

## 4. Data domains

Relational tables grouped by product area. One line each: what each domain stores and which application paths read/write it (`ctx` = `getRequestContext`). Migration 097 adds the approval/workflow layer, so old table-count snapshots are not authoritative.

**Identity & Org** — who belongs where.

| Table | Stores → read / written by |
|-------|----------------------------|
| `profiles` | Identity/role/tenant/vertical/roll_number/branch + `role_term_start/role_term_end` [048] — the single source of truth; an expired term downgrades the governing role to `core` → `ctx`, `GET/PATCH /api/profile`, `GET/PATCH /api/admin/students`, bulk assign; written by first-login auto-create, grant upward-sync, admin edits |
| `people_checklist_items` | Per-role onboarding/offboarding completion [073]; templates in `lib/people.js`, panel on `/admin/students/[id]`; closing an account requires every offboarding item |
| `tenants` | Chapter rows (slug/name configured per deployment) → `queryTenant`, `/api/network`, public APIs; written by `seed-control-plane.js` |
| `tenant_domains` | Host→tenant mapping → `getTenantFromRequest` (webhook, `/api/public/*`); written by seed |
| `departments` | 13 seeded org units (6 technical + 7 non-technical) + head/co-head pointers + vertical → `/api/departments`, `/api/public/departments`, `/domains*`, lead/admin overviews; written by `seed-departments.js` (no admin UI — DB-managed) |
| `department_memberships` | User↔dept `level` (general/core/dept_lead) + `core_requested` + `succession_ready` + `term_start/term_end` [048] (an ended `dept_lead` row stops conferring authority) → attached on every `ctx`, rosters; General/Core writes use the department roster APIs, while Head seats are changed only by the atomic admin leadership route |
| `scoped_role_grants` | Independently expiring capability scope (`role_name`, tenant/vertical/department/event/project `scope_type/id`, grant/revoke actors and reason) [094/096] → attached on every `ctx`; written transactionally by leadership appointment/handover and event-role administration |
| `department_tasks` | One department's work with proof [091]: status `assigned→in_progress→blocked→submitted→done`, assignee, due date, `evidence_url` + `completion_note` on submit, `reviewed_by` + `review_note` on approve/return, soft `is_active` → `/lead/departments/[slug]` board, `/student/work` (which also lists the member's `event_ops_tasks` read-only, under a namespaced `event:<id>` key, so one page answers "what do I owe" without merging either vocabulary), `/api/departments/[id]/tasks*`; written by the department's own heads and assignees (a submitter can never review their own work) |
| `platform_admins` | Setup claimants → `ctx` effective role; `is_founder`/`locked`/`label` [048] mark permanent founder seats immune to role changes; written by `/api/admin/claim-first` (founder) and `load/seed-founder.js` |
| `leadership_terms` | Append-only appointment history (`role`, `vertical`, `department_id`, `starts_on`/`ends_on`, `status` active/ended/expired) with partial unique indexes against two active non-department terms per user/role → `load/expire-terms.js`; written by admin role changes |
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
| `mentors` | Approved mentors (user_id-keyed) → `/api/mentorship`, `/api/admin/mentors`, mentorship page |
| `mentor_applications` | Applications + eligibility snapshot (pending/approved/rejected) → `/api/mentorship/apply`, `/api/admin/mentor-applications` |
| `mentor_sessions` | Mentor↔student sessions → `/api/mentorship` |
| `mentor_reviews` | 1–5 ratings (unique mentor+reviewer) → `/api/social/discover` (mentor review), discover page |

**Debug & Build** — real bugs in an external starter repository, verified before review.

| Table | Stores -> read / written by |
|-------|----------------------------|
| `debug_challenges` | Admin-authored catalogue row: LOOM primary domain, slug, title, difficulty, `repo_path`, brief, verification notes, publish flag + `published_at` (the fork-created-after boundary) -> `/student/debug(+[slug])`, `/admin/debug`; written by `POST /api/admin/debug/challenges` |
| `debug_submissions` | One member fork per challenge: fork URL/owner/repository id, cached GitHub verification state/reason, PR URL, human review state/feedback/reviewer -> `/student/debug`, `/lead/debug`, `/admin/debug`; written by `POST /api/debug/submissions` and reviewed through `POST /api/lead/debug` |
| `oss_challenge_submissions` | One member fork per society/curated repository (domain, upstream + fork names, verification status/reason, review feedback) -> `/student/challenges`, `/lead/debug`, `/admin/opensource`; written by `POST /api/challenges/oss` and graded through `PATCH /api/challenges/oss/[id]` |

**Proof & Credentials** — verifiable outcomes.

| Table | Stores → read / written by |
|-------|----------------------------|
| `skill_badges` | Tier 1–3 badge definitions → `/api/admin/badges`, verification page |
| `student_achievements` | Issued badges (unique per student+badge+source) → `/api/credentials`; written by progress auto-awards, OSS verify, `POST /api/admin/achievements` |
| `verifiable_credentials` | Signed achievement share links (`cred_*`, legacy HMAC contract) → `POST /api/credentials`; verified at `/verify/credential/[id]` |
| `credential_views` | Share-link view counts → written on verify-page views |
| `tenant_keyrings` | Tenant Ed25519 public keys + encrypted private signer, rotation/revocation state [095/096] → admin key API; old public keys remain for verification |
| `certificates` | Per-event attendance certs (unique code, issued once at check-in), versioned algorithm/key/payload, expiry and revocation [096] → canonical attendance action; verified publicly and read by holder/admin |
| `oss_badges` | Per-student OSS badge keys → written by webhook/admin verify; read by opensource pages |

**Community** — forums, knowledge, broadcast, ledger.

| Table | Stores → read / written by |
|-------|----------------------------|
| `forum_threads` / `forum_replies` / `forum_votes` / `forum_flags` | Threads, replies, vote toggles, moderation flags → `/api/community/*`; mod queue at `/api/admin/community`, flags page |
| `wiki_pages` / `wiki_edit_requests` | Versioned pages (unique tenant+slug) + student suggestions → `/api/community/wiki(+[slug])`, wiki pages |
| `code_snippets` | Shared snippets → `/api/community/snippets`, snippets page |
| `announcements` | Society/vertical/department broadcasts with draft → published lifecycle, optional expiry, and preview composer at `/lead/announcements` + `/admin/announcements` → `GET/POST /api/announcements`, `PATCH /api/announcements/[id]` (visibility derived from memberships; drafts never reach students) |
| `member_contributions` | Contribution ledger (project/competition/certification/event; self- or lead-logged) → `GET/POST /api/contributions`, lead `recentLogs`, report export |
| `faqs` | Public Q&A per tenant → `/faq` page (published only), `GET/POST/PATCH /api/admin/faq`, `seed-faq.js` |
| `notifications` | Per-user inbox → `GET /api/notifications`, mark-read; written by every `notify()` call |

**Events & Attendance** — workshops, contests, presence.

| Table | Stores → read / written by |
|-------|----------------------------|
| `events` | Workshops/hackathons/talks with canonical FSM state, registration window, completion/cancellation metadata, and `lock_version` [094] → `/api/events`, scoped event workspace/approval, public/student pages; legacy proposed/upcoming/past values are read-only aliases |
| `event_status_history` | Append-only accepted transitions (previous/new state, actor, reason) → written transactionally with status changes |
| `event_registrations` | Signups, door-code check-in, feedback (unique event+student) → `/api/events/[id]`, attendance action |
| `event_materials` | Attached link materials → `POST /api/events/[id]/materials`, event detail |
| `contests` / `contest_registrations` / `contest_submissions` | Challenges + entries → `/api/contests`, `/api/admin/contests`, contest pages |

**Operations** — reports, handover, finance, volunteers.

| Table | Stores → read / written by |
|-------|----------------------------|
| `volunteer_slots` / `volunteer_signups` | Titled capacity slots per event + one-seat-per-member signups → `GET/POST /api/volunteers`, `POST/DELETE …/[id]/signup` (capacity enforced live); operator roster on the shared event ops page |
| `dept_reports` | One row per (department, month): auto-compiled JSON draft + lead narrative → submitted → `GET/POST /api/reports`, `GET/PATCH …/[id]`, compiled from the lead console |
| `handover_checklists` | Admin continuity items + done flags + named owner/department [075] → `GET/POST /api/handover`, `PATCH …/[id]` |
| `lead_handovers` | Guided seat transitions: outgoing/successor, brief JSON, transfer flags, draft→submitted→completed → `GET/POST /api/lead/handover`, `PATCH …/[id]`, `POST …/[id]/transfer`; transfer logic in `lib/handover.js`; the unified read model (`lib/succession.js`) merges these rows, checklist ownership and term expiries, outstanding first |
| `budget_heads` | Budget envelopes, optional vertical (NULL = society-wide) + owning `department_id` [070] → `GET /api/finance`, admin finance page |
| `expenses` | Proposed→approval-backed approved/rejected→paid, receipt metadata, request version/group, approval request, paid/decision actors [070/097] → scoped proposal, independent shared decisions, separate payout through `/api/finance/expenses` |
| `sponsorships` | Sponsor pipeline→committed→received + `vertical` [048] (NULL = society-wide), `updated_at/by` [070] → `POST/PUT /api/finance/sponsorships` (admin or scoped VL); `/student/sponsors` reads committed/received only |
| `approval_policies` / `approval_requests` / `approval_decisions` | Shared, versioned approval snapshots and independent append-only decisions [097]; expense thresholds can require two approvers and escalation |
| `workflow_instances` / `workflow_handoffs` | Typed cross-department workflow + ordered deliverable/dependency/review FSM [097] → `/api/workflows*`; only `society_workshop` currently has an implemented template |

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
| `student_daily_activity` | Per-day commits/PRs/reviews/score (webhook) plus `github_contributions` (GitHub's own calendar, 092). Readers merge with `max()` per day → insights, github page, public profile, builder card |
| `student_analytics_snapshots` | Daily per-student rollup → written by `rollup-analytics.js`; read by `/api/insights` |
| `cohort_metrics` / `roadmap_node_analytics` / `mentor_effectiveness` | Tenant/cohort/node/mentor aggregates → written by rollups; read by admin analytics, insights |
| `federation_metrics` | Cross-chapter totals → written by `rollup-federation.js`; read by `/api/network` |
| `chapter_profiles` / `chapter_partnerships` | Public chapter cards + federation edges → `/api/chapters`, `/api/network`, network pages |

**Control plane** — flags, trail, runner state.

| Table | Stores → read / written by |
|-------|----------------------------|
| `feature_flags` | Per-tenant kill-switches (`github_integration`, `contests`, `mentorship`) → `queryTenant().features`, webhook gate; written by `/api/admin/flags` |
| `audit_logs` | Every audited mutation (actor/action/resource/before/after/reason/request/auth context); database-append-only, read by `/api/admin/audit`; guarded retention only through `loom_private.prune_audit_logs_before` |
| `outbox` | Tenant-local idempotent side effects with pending/processing/done/dead state, lease token, retry schedule, and dead-letter diagnostics → jobs runner + admin outbox API |
| `schema_migrations` | Applied-migration ledger → written by `node load/migrate.js` |
| `tenant_database_routes` | **Absent from the live DB** — reserved name, unused |

## 5. Page map

**Public** (middleware allowlist; honest empty states, no mocks).

| Page | Purpose |
|------|---------|
| `/` | Landing: living-network hero, live events/projects pulse, domain rails → `/register` |
| `/about` | Society story + department index |
| `/faq` | Published FAQs only |
| `/events` + `/events/[id]` | Upcoming public events and per-event detail pages (canonical, Event JSON-LD, per-event OG card, sitemap); registration stays signup-only and deep-links back through `/login?redirect=` |
| `/domains` + `/domains/[slug]` | Department catalog + per-department page (workshops, projects); unknown slugs get an empty state, not a 404 |
| `/login` / `/register` | Auth0 is the only front door: GitHub and email/username both complete on the Auth0 Universal Login page, and signup is the same page with `screen_hint=signup`. Register metadata captures name/roll/branch/year + department picks, and onboarding captures a track, a public handle and an optional password |
| `/setup` | First-admin claim. Public in middleware but gated by `FIRST_ADMIN_CODE` (≥16 chars, timing-safe); fails closed with 503 when the secret is unset, and refuses once `platform_admins` is non-empty |
| `/verify/credential/[id]` + `/verify/certificate/[code]` | Public proof check: achievement links retain HMAC verification; new certificates verify canonical payloads with a tenant Ed25519 public key (legacy HMAC certificates remain supported). Revoked/expired/tampered proof fails closed and is `noindex` |
| `/auth/callback` | Auth0 code exchange |
| `/auth/supabase-callback` | **retired**: 307 to `/login?error=auth0_only`; the Supabase session path is gone |

**App** (session-gated; layouts re-enforce roles).

| Area | Pages |
|------|-------|
| `/student` | Home dashboard (roadmap progress, GitHub, threads, horizon). Learn: `roadmap`, `roadmap/[nodeId]`, `resources`, `resources/[resourceId]`, `projects`, `projects/new`, `projects/[id]`, `github`, `opensource`, `contests`, `contests/[id]`. Build: `debug` catalogue and `debug/[slug]` challenge/submission, `work` (department assignments with proof submission). Gather: `events`, `events/[id]`, `community/forums(+[id])`, `community/wiki(+[slug])`, `community/snippets`, `mentorship`, `network(+[slug])`, `discover`. Proof: `credentials`, `certificates(+[code])`, `insights`, `leaderboard`. Self: `[username]`, `notifications`, `onboarding`, `settings`, `privacy`. |
| `/lead` | Lead console (shared query in `lib/lead.js` with `GET /api/lead/overview`): live led departments + roster/core requests, submitted-event approval queue, vertical calendar, succession, contribution logs, and report entry. `debug` is the domain-scoped verified-fork review queue. The cross-department workflow backend is shipped, but its inbox/timeline UI is deliberately tracked in issue #82 rather than claimed here. |
| `/lead/departments` | Department workspaces - the *organisation's* view rather than a person's: every active department the caller may open (admin: all, VL: own vertical, head: own departments) with cover art, member count, upcoming events and open work; `/lead/departments/[slug]` aggregates heads, the work board, roster controls, events, event ops, reports, contributions, assets, budget, agreements and leadership history for one department. A head/co-head assigns work with a deadline and proof, reviews the other head's submissions (never their own), and adds/promotes/demotes/removes members inside that department. Data comes from `lib/department-workspace.js` (sequential, tenant-pinned queries); each module renders only when `can()` says the viewer holds the matching permission. Unknown and retired slugs (`backend`, `devops`, `pr_outreach`, `sponsorship_evm`) redirect or 404 rather than guessing. |
| `/lead` · `/admin` · Chapter tools | Mirror of four operations tools, each with its own API and a server page in both consoles: `assets` (media/creative library — uploads to the private `loom-files` bucket, immutable versions, signed-URL downloads, link-out rows; `lib/assets.js`), `mous` (MoU database with partner/status/value metadata, versioned documents, optional sponsorship link, and owned renewal tasks in a due-date attention queue; `lib/mou.js`), `directory` (internal leadership directory — name, dept, tenure, links; `lib/directory.js`), `event-ops` (per-event task board with owner, priority, deadline; `lib/event-ops.js`). Edit needs Head/Co-Head, VL, or admin; `core` reads only. Deadlines feed the reminder job (below). |
| `/admin` | Command deck and department cards; role/term/membership administration; account lifecycle/checklists; mentor, analytics, audit, moderation, flags, contests, full event FSM/attendance, OSS/debug review, credentials, projects/resources/roadmaps, reports/export, approval-backed finance, FAQ, and validated tenant settings. Governance/outbox analytics are available by API; specialist department gaps are recorded in `DEPARTMENT_AUDIT.md`. |

## 6. Key workflows

1. **Signup → member.** Register through Auth0 (GitHub or email/username; there is no local credential form) → `lib/user-identities.js` resolves one canonical `profiles.user_id` → first `getRequestContext` creates `profiles(student)` in the chapter the request host resolves to + `general` memberships → `/student/onboarding` shows only tracks that have roadmap content, and captures the college, the chosen track, the public handle and an optional password → roadmap. No approval anywhere. **The college is what can change the chapter:** on that first save, if a chapter has claimed the college (`tenants.institution` or an alias in `tenant_institutions`), the account moves there before it owns any chapter data, and department picks come along by slug. After onboarding the chapter is fixed — moving it is an admin decision, not a form field.
2. **Core request → grant or decline.** Member `POST …/[id]/request-core` (creates `general` membership with `core_requested=true` if none) → Head/Co-Head sees request in `/lead` roster → `PATCH …/members/[userId]` `{level: core}` → profile role syncs upward to `core` → `notifications` row + `audit_logs` entry. The same endpoint accepts `{declineCore:true, reason}`: it clears `core_requested`, closes the matching `role_requests` row with the reason, and tells the applicant. A decline with no reason is refused, so a request is never answered silently.
3. **Event propose → approve → operate → archive.** An owned department workshop may be published directly by policy; a department lead's society event enters `submitted`. An independent scoped VL/admin reviews it through `/api/events/[id]/approve`, which records `submitted → approved → published` (or `rejected`) in append-only status history and rejects self-approval/stale `lockVersion`. Operators then use the FSM for registration close, live, completed, and archived; cancelled/postponed are explicit branches, not inferred from a two-hour timer.
4. **OSS claim → webhook verify.** Student links GitHub (`/api/github`) and, for project ownership, completes the repository OAuth grant (`/api/github/oauth/start`, scopes `repo` + `read:user`) → claims a PR/issue URL in a tracked repo (`claimed`, 20/min, canonical URL) → webhook delivery (HMAC-checked, 120/min/tenant) stored idempotently in `github_events` → merged PR or submitted review in a tracked repo auto-verifies the claim (`oss_verified` / review evidence) + awards `oss_badges`/achievements + notifies → aggregation happens inline in the same webhook request. Admins can also verify/reject manually (same side effects, idempotent).
5. **Monthly report → export.** Dept lead opens `/lead` → draft auto-compiles from live counts (contributions by kind, events held, new members, upcoming) → `POST /api/reports` (one row per dept+month) → edits → `PATCH …/[id]` `{status: submitted}` (terminal; only admin reopens) → VL/admin reads at `/admin/reports` → `GET /api/reports/export?scope=semester|annual` downloads JSON, CSV, or PDF (all rendered from one shared payload); `/admin/reports` renders the same department x month coverage grid the export carries.
6. **Expense propose → independently approve → pay.** A scoped lead/admin proposes against a tenant-owned budget head with receipt evidence. The same transaction opens a versioned approval request using chapter settings; aggregate spend at/above the threshold requires two distinct approvers. The proposer and other recorded participants cannot decide it. Final approval updates the expense, while payout remains a separate authority and audit event.
7. **Webhook ingestion + kill-switch.** GitHub `POST /api/github/webhook` (tenant from host header, HMAC `x-hub-signature-256`, ping acked without storage) → if `github_integration` flag off for the tenant: ack `{accepted: false, reason: GITHUB_INGESTION_PAUSED}`, store nothing (opt-in since migration 020; toggled at `/admin/flags`) → else store idempotently → best-effort OSS auto-verify → 200. Failures after signature check never fail the ack.

8. **Debug challenge -> verified fork -> review.** Admin publishes a challenge only after its content exists in `DEBUG_CHALLENGE_REPO` (default `L-OO-M/buggy`); publishing stamps `published_at`. Student forks that repository after publication, commits from the GitHub login already linked in `github_connections`, and submits the fork on `/student/debug/[slug]`. The route checks owner identity, fork parent, creation time and an authored commit (GitHub outages stay `error`/pending, never auto-rejected; a fork repository id can belong to one member). The matching domain lead (or an admin) sees verified forks on `/lead/debug` and approves or returns with mandatory feedback; approval upserts `debug_fixed` ranking evidence and recompute runs in the same transaction, returning removes it, and both audit + notify.

9. **Society challenge -> graded fork.** `L-OO-M/buggy` is also the society open-source challenge, but it has no per-member catalogue row: the challenge is a real folder (`domains/<track>`), configured in `lib/society.js`. The roadmap's challenge panel opens `/student/challenges?domain=<track>`, which states the rules, links the folder and the curated repositories for that track, and accepts a fork URL on `POST /api/challenges/oss`. The upstream must be the society repo or a repository curated for that domain; GitHub verifies ownership, fork parent and an authored commit. The queue appears on `/lead/debug` (domain scope) and `/admin/opensource`; `PATCH /api/challenges/oss/[id]` approves or returns. Approval requires a verified fork, writes `oss_challenge` evidence (weight 20, cap 10) and recomputes, so it is visible on chapter standing without pretending to be a merged upstream PR.

10. **Attendance → evidence → score → certificate.** An exact event-door grant, owning operator, scoped VL, or admin calls the canonical `/api/events/[id]/attendance`. Registration attendance, deduplicated evidence, score-recompute outbox row, and certificate issuance share one transaction. The outbox worker owns a lease token, so a stale worker cannot complete a reclaimed job. A tenant Ed25519 key signs new certificates when configured; legacy HMAC remains only for old/fallback records.

11. **Society workshop → department handoffs.** A scoped technical lead creates `society_workshop`; the backend writes seven ordered handoffs for Technical → Documentation → Design → SMM → Publicity → Management → Documentation. Each receiving team submits its schema-defined deliverable, an independent lead approves/returns it, and optimistic status predicates reject stale writers. Unsupported reserved workflow types fail validation. The operational UI is issue #82.

12. **Audit retention.** Governance histories reject update/delete in Postgres. `loom_app` cannot directly delete audit rows; the retention job invokes `loom_private.prune_audit_logs_before`, which refuses any cutoff newer than 365 days and opens the trigger exception only inside that security-definer function.

13. **Self-service account closure.** A member closes their own account from `/student/settings` with a typed phrase. `POST /api/account/close` re-checks that the chapter would lose nothing it cannot replace (an admin seat or a live Head seat refuses until handed over), then in one transaction: deactivates the profile, replaces identity fields with "Former member", deletes the public card and GitHub link, removes department seats, withdraws open seat requests, and clears notifications. The `profiles` row, its `user_id`, verified work, contributions and audit history stay, so past records keep their meaning; migration 104 records `closed_at`/`closed_reason`. An admin can restore the account, and the erased details are re-entered rather than invented.

14. **Per-tab unread dots.** The shell makes exactly one `GET /api/notifications` call and derives both the bell count and the nav dots from it. Each unread notification carries the link it is about; `lib/nav.js#unreadTabsFor` maps that link to the leaf tab that owns the page and `navHasUnread` lifts it to the parent group, so a lead sees a dot on Events when a workshop needs approval and a member sees one on Build when new work is assigned. Read notifications, external links and unknown paths mark nothing.

15. **Insight readings.** `lib/insights.js` is a pure engine: metrics in, explainable cards out (`risk | watch | next | win`). Every card names the number it was built from and links to the page that owns it; a metric that is missing produces no card at all, so an empty account reads as empty instead of being told it is doing well. There is no model and no forecast. The same engine answers four different questions: a member's own week (`lib/insights-data.js` reads roadmap progress, `loadMyWork`, attendance, practice, and the open mentoring loop), a Core member's review queue, a lead's scope (the `lib/queue.js` counts plus `quietMembers` / `noProofMembers` computed in `getLeadOverview`), and the chapter rollup (`adminInsights` over cohort history, funnel bottlenecks, mentor load, contest conversion, and the admin queue). Cards render through `components/loom/InsightCards.jsx`, so the visual language is identical at every level even though the questions differ. `/student/insights` is a real page under Prove; the lead console recomputes its reading on each 15s poll; `/admin/analytics` computes it server-side from the same queue the admin dashboard already shows.

16. **Practice follows the department track.** A week carries `track` (department slug) and each question carries its hosted `url` + detected `source`; `lib/practice-catalog.js` ships the seven-item starting set for DSA (LeetCode), AI/ML (Kaggle), Web (Frontend Mentor), Cybersecurity (PortSwigger/OverTheWire/…), Blockchain (Ethernaut/…), and Embedded (Arduino/…), and accepts any other https link. Authoring is the same capability as owning a department's learning track (`upload_roadmap`), so a Web or AI/ML lead authors their own week; an admin may author any. Only LeetCode keeps automatic verification (`lib/practice-sync.js` matches `source = 'leetcode'` by slug) — every other source is honestly self-reported and confirmed by a correction.

17. **Long-form event pages.** `events.page_sections` is an ordered jsonb array of typed blocks (overview, problem, prizes, schedule, rules, faq, resources) with `events.tagline` and `events.cover_image_url`. `lib/event-page.js` is the single validator/normalizer (https-only links, https-or-app-path images, 12 blocks max, and a heading with no body/bullets/links is dropped rather than published empty) used by both the API and `components/admin/EventPageBuilder.jsx`. The builder offers starter block sets per event type (`EVENT_PAGE_TEMPLATES`), one-block add, duplicate, and up/down reordering; `components/events/EventSections.jsx` renders the same blocks on the public and signed-in event pages, and the generated `EventBanner` stays as the cover fallback.

18. **Image storage.** Public page imagery goes through `POST /api/uploads/images`; private documents continue through `lib/storage.js` + signed URLs. The upload route has two interchangeable providers: Supabase Storage (default, stored under `public/…` and served by `/api/media/[...key]` with immutable caching) and Cloudinary (when `CLOUDINARY_*` is configured, signed server-side and delivered from its CDN). `lib/media-url.js#optimizedImageUrl` adds `f_auto,q_auto,c_limit,w_…` only for Cloudinary URLs, so the same stored link gets a free format/size optimisation without a second field.

## 7. Contributing guide

**Local setup.** Copy `.env.example` → `.env.local` (fill `DATABASE_URL` pooler string, Supabase keys, `DEV_TENANT_SLUG`), `npm install`, `npm run dev`. Never commit `.env.local`.

**Migrations.** Tracked, ordered, idempotent: add `load/migrations/NNN_name.sql` (every statement `IF NOT EXISTS`, constraints added via `DROP CONSTRAINT IF EXISTS` + re-add), apply with `node load/migrate.js` (`npm run db:migrate`). The runner records names in `schema_migrations` and skips applied files. Never edit an applied migration — write a new one.

**Seeds.** `npm run db:seed` = control-plane (tenant, domains, flags) + content (roadmap nodes, resources). Then `node load/seed-departments.js` (13 departments, all active) and `node load/seed-faq.js` (idempotent on `(tenant_id, slug)`). `node load/seed-dev.js` (`db:seed:dev`) is **LOCAL ONLY** — it refuses production, and must never run against the shared DB. `node load/wipe-dev.js --confirm` removes seed/dummy rows only; `--full` truncates all data tables (keeps schema + ledger); both refuse production.

**Tests.** `npm test` (vitest, `tests/**/*.test.js`, node env, `@` alias). `npm run test:e2e` (Playwright: chromium + Pixel 7, `reuseExistingServer`, `webServer.timeout: 120000` — first run pays Next.js cold compile, so allow ~2 min before judging a failure). `npm run lint` (eslint `next/core-web-vitals`) must pass before handing off.

**Conventions.** JS only (no TypeScript). Every `<Link>` carries `prefetch={false}` (75+ usages — keeps pooler-backed navigations cheap). Page components issue sequential awaits rather than parallel batches against the pooler. Every mutating route validates with zod, scopes by server-derived tenant, and calls `writeAudit()` (+ `notify()` where a human waits). Empty states are honest sentences ("No workshops scheduled for X yet"), never mock data or silent blanks. One concern per commit with a topic-prefixed message (`Membership flows: …`, `Operations: …`); see `git log --oneline`.

## 8. Post-audit hardening (no-dummy-data pass)

- Seed wipe: all seed-user-* rows removed from the shared DB via load/wipe-dev.js --confirm; orphaned content (1 event, 1 thread, 1 wiki page) reassigned to the real admin; 20 fixed a live webhook 500 (normalized.payload never existed) found by HMAC-signed delivery tests.
- Tenant renamed Demo College → MSIT (tenants.name, chapter_profiles.public_name); seed-control-plane is now insert-only on tenant name so reruns never clobber it.
- New surfaces: LevelGuide (auth pages explain all 5 levels; roles are granted, never self-selected), StatTiles (visual metric tiles on student/admin/lead dashboards), /admin/departments (create/rename/archive), /admin/handover (transfer checklist board), budget-head creation on /admin/finance, global app/error.jsx + app/not-found.jsx, role-scoped assignment in PATCH /api/admin/students (dept_lead requires department + fills Head?Co-Head slots; vertical_lead requires vertical).


## 9. Security invariants (ported from retired 02-tenant-and-security-model)

- Tenant identity never comes from the client: authority is profiles.tenant_id (lib/auth-server.js); host/domain lookup (lib/tenant.js) is only a fallback helper for public pages.
- Every mutation runs session ? tenant membership ? role check (lib/permissions.js can()) ? zod validation ? standard {ok,data/error} envelope ? writeAudit() (+ notify() where a human waits)./api/* returns machine 401 {ok:false}; pages redirect to /login.
- GitHub webhook verifies x-hub-signature-256, rejects unsigned/mismatched with 401, dedupes on GitHub delivery id, and honors the per-chapter pause gate (GITHUB_INGESTION_PAUSED) before storing anything.
- Audit rows carry actor, tenant, action, resource type/id, before/after, reason, request/IP/authorization context, and timestamp. Audit logs, event status history, and approval decisions are database-append-only; direct runtime deletion is revoked and retention is guarded by a private 365-day-minimum function.
- Secrets live only in env / .env.local (untracked). load/*.js scripts share load/env-local.js and refuse to run without DATABASE_URL; hardcoded connection strings were purged.
- The chapter cannot lose its last active admin through a role change, account suspension/deactivation, or bulk role write: `lib/last-admin.js` locks every active admin row (`FOR UPDATE`) inside the write transaction, then refuses the removal. Handover transfer promotes the successor before demoting the outgoing seat and keeps the same guarantee.
- Succession has one read model (`lib/succession.js`): checklist items (each with a named owner), handover briefs, transfer flags and leadership-term expiries are merged outstanding-first and surfaced by `GET /api/admin/succession` + `/admin/handover`.
- Tenant isolation is **layered**, and only one layer is guaranteed. The
  application layer (`WHERE tenant_id = ...` in every query) is always on.
  The database layer (Row Level Security on ~44 tables, migrations 025/030/031/033)
  is opt-in via the `tenant_rls_enforced` flag **and** requires
  `DATABASE_APP_URL` to point at the `loom_app` role. `postgres`/the owner
  connection has `rolbypassrls = true`, which overrides `FORCE ROW LEVEL
  SECURITY` -- so anything running on `DATABASE_URL` is invisible to RLS.
  `GET /api/health` reports `isolation.effective` as the single source of
  truth. Full procedure: `docs/rls-rollout-runbook.md`. Migration 065 closed the
  gap 031 had to skip: `department_memberships`, `event_registrations`,
  `forum_votes`, `forum_flags`, `volunteer_signups`, `mentor_sessions`, and
  `contest_submissions` now carry a backfilled `tenant_id` plus tenant-leading
  indexes (RLS stays off by decision), so a future policy rollout has a column to
  key on instead of a join upward.
- The RLS flag is **operator-only**. `PATCH /api/admin/flags` rejects
  `tenant_rls_enforced` with `OPERATOR_ONLY` and `/admin/flags` renders it
  read-only, because it is global (not chapter-scoped) and one misclick would
  change production security posture.
- The federation directory (`/student/network`, `/api/network`) deliberately
  reads **across** tenants via `getFederationSql()` -- anonymised counts and
  public chapter names only, never member identities.
- Security headers (CSP, H-Frame, HSTS, Referrer, Permissions) are defined once
  in `next.config.mjs` so they cover static assets and SEO files the
  middleware matcher excludes.
- `assertProductionSecrets()` rejects placeholder signing secrets by **value**
  (`dev-secret`, `hello`, ...) as well as by presence, and additionally
  requires `DATABASE_APP_URL` and `NEXT_PUBLIC_APP_URL` in production.
- Raw error text is never rendered to the browser. `app/(app)/error.jsx` logs
  to the console and shows a generic message, because Postgres errors leak the
  pooler host, constraint names, and RLS denial wording.
- Helper enrollment requires explicit opt-in. `lib/auth-server.js` no longer
  lists every authenticated member as an available helper on every request.

## 10. Operational queue (`lib/queue.js`)

One read-only aggregation that answers "what is waiting on me today", shared by
`/admin` and the lead console. It owns no workflow, writes nothing, and has no
table of its own -- every counter is a `COUNT(*)` over a table another module
already owns, and every `href` points at the screen that already has the
buttons. `tests/queue.test.js` fails if `lib/queue.js` ever gains an
`INSERT`/`UPDATE`/`DELETE`.

Three groups, kept apart on purpose:

| Group | Meaning | Example |
|---|---|---|
| `action` | The viewer is the decider. A number here is a personal debt. | A submission awaiting their review; a seat request an admin can approve |
| `attention` | Deteriorating, or someone waits on a decision the viewer cannot make | Overdue work, blocked work, work with no owner, a seat request seen by a department head |
| `visibility` | Not a problem yet, shown so it can be planned for | Work due in the next 3 days |

Scope is resolved once from the viewer's own profile (`admin` -> every active
department, `vertical_lead` -> their vertical, `dept_lead` -> the departments
they actually lead) and applied to every query, so a page cannot widen its own
reach. Ageing (`waitingDays`) is computed server-side from the oldest row in
each bucket -- `submitted_at` for reviews (how long the member waited), `due_at`
for overdue work, `created_at` for unowned work -- so the client never has to
guess and hydration cannot disagree.

`/api/lead/overview` returns the same `queue` object the page renders, so the
console's 15s poll keeps it live without a second endpoint.
