# API Reference

Base: same origin. Envelope: `{ ok: true, data }` / `{ ok: false, error: { code, message } }`.
Auth: Supabase session cookie. Pages redirect to `/login`; `/api/*` returns `401 UNAUTHORIZED`.
Tenant: derived server-side from the caller's profile. `adminOnly` routes return `403 FORBIDDEN` for students.

Public (no session): `GET /api/health`, `GET /api/chapters`, `POST /api/github/webhook` (HMAC `x-hub-signature-256`), `POST /api/admin/claim-first`, `GET /api/admin/check-setup`.

## Core

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET/PUT | `/api/profile` | user | own profile |
| GET | `/api/roadmap` | user | nodes + my progress |
| POST | `/api/roadmap/progress` | user | mark node (body: nodeId, status); awards first-step/halfway/complete achievements idempotently + notifies |
| GET | `/api/resources` | user | curated library |
| GET/POST | `/api/projects` | user | create: title, description, roadmapNodeId?, repoUrl?, tags[≤8] |
| GET/PATCH | `/api/projects/[id]` | owner/admin | |
| GET/POST | `/api/contests` | user/admin-create | register + submit flows |
| GET/POST | `/api/mentorship` | user | request/list sessions |
| GET/POST | `/api/mentorship/apply` | user | generational loop: list my applications / apply (evidence-checked eligibility; 422 with reasons when not yet eligible) |
| GET/POST | `/api/admin/mentor-applications` | admin | review queue / approve (promotes to mentor) or reject |
| GET | `/api/leaderboard` | user | `?scope=college\|global` |
| GET | `/api/notifications` | user | |
| POST | `/api/notifications/[id]/read` | user | |
| GET/POST | `/api/github` | user | link username, list repos/activity |
| POST | `/api/jobs/github/process` | service | QStash worker: aggregates webhook events |

## Open source

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/opensource/projects` | user | global curated + own tenant; includes my counts |
| POST | `/api/opensource/projects` | admin | curate `{owner, repo, difficulty, primaryDomain}` — live GitHub fetch; 404 if repo missing |
| GET | `/api/opensource/contributions` | user | my claims + badges |
| POST | `/api/opensource/contributions` | user | claim PR/issue URL in a tracked repo → `claimed` (20/min) |
| PATCH | `/api/opensource/contributions/[id]` | admin | `{status: verified\|rejected}` — awards badges + achievements + notify |

## Chapters & network

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/chapters` | public | featured public chapters, anonymized counts |
| GET | `/api/network` | user | all public chapters + my partnerships + latest federation row |

## Credentials & insights

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/credentials` | user | achievements + share links |
| POST | `/api/credentials` | user | issue signed link for own achievement (`expiresInDays` 0–730) |
| GET/POST | `/api/admin/badges` | admin | badge definitions (tier 1–3) |
| POST | `/api/admin/achievements` | admin | issue to a chapter student + notify |
| GET | `/api/insights` | user | latest snapshot, 14-trend, peer avgs, rank, heuristic recommendation |

## Community

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/community/threads` | list (q, domain, sort) / create (10/min) |
| GET/POST/PATCH | `/api/community/threads/[id]` | detail+replies / reply / solve (author) or pin (admin) |
| POST | `/api/community/votes` | toggle vote thread/reply/snippet (60/min) |
| POST | `/api/community/flags` | flag thread/reply for moderation |
| GET/POST | `/api/community/wiki` | search / create page |
| GET/PATCH | `/api/community/wiki/[slug]` | detail+edits / suggest (student) · apply/review (admin) |
| GET/POST | `/api/community/snippets` | search / share |
| GET/PATCH | `/api/admin/community` | admin: flag queues / hide-visible |

## Events & social

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/events` | upcoming/past / admin create (capacity enforced) |
| GET/POST/PATCH | `/api/events/[id]` | detail+materials / register-cancel / feedback |
| POST | `/api/events/[id]/materials` | admin: attach link material |
| POST | `/api/admin/events/[id]/attendance` | admin: check in by door code → attended + certificate (once) + notify |
| GET/PUT | `/api/social/profile` | my card / claim-edit username (unique, validated) |
| GET/POST | `/api/social/connections` | follow state+endorsements / follow-toggle or `?mode=endorse` |
| GET/POST | `/api/social/discover` | trending threads, mentors, rising builders / mentor review |

## Errors & limits

Common codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `REPO_NOT_TRACKED` 404, `EVENT_FULL` 409, `USERNAME_TAKEN` 409, `DUPLICATE` 409, `RATE_LIMITED` 429, `GITHUB_SIGNATURE_INVALID` 401.
Rate limits are in-memory per instance (vote 60/min, claims 20/min, thread-create 10/min, webhook 120/min per tenant).

## Org, leads & operations (added after the initial reference)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/departments` | user | active tenant departments + member counts + my level |
| POST | `/api/departments/[id]/join` | user | instant approval-free join as `general` (idempotent) |
| POST | `/api/departments/[id]/request-core` | user | one-click core request (creates `general` + `core_requested` if needed) |
| PATCH | `/api/departments/[id]/members/[userId]` | lead/admin | `{level: core}` by dept Head/Co-Head or admin; `{level: dept_lead}` admin-only; upward-only role sync + audit |
| GET/POST | `/api/announcements` | user | scoped feed (society + my verticals + my departments) / post (`post_announcement`: VL anywhere, dept_lead own feed) + fan-out to notifications |
| GET/POST | `/api/contributions` | user | contribution ledger: self-log, or lead-log for own department (`log_contribution`) |
| GET | `/api/lead/overview` | dept_lead+ | lead console dataset (shared query with `/lead` page; `?vertical=` override) |
| PATCH | `/api/lead/succession` | dept_lead/admin | flag/unflag a core member `succession_ready` (Head/Co-Head of that dept, or admin) |
| GET | `/api/admin/overview` | admin | command deck: per-department cards + pending approval counts |
| POST | `/api/admin/students/bulk` | admin | assign role to ≤50 users at once (audited; membership levels untouched) |
| POST | `/api/events` | lead/admin | lead-create: VL/admin go live; dept_lead's department workshop goes live, society-wide post waits as `proposed` |
| POST | `/api/events/[id]/approve` | VL/admin | publish (`upcoming`) or send back (`cancelled`) a proposed event + notify author |
| GET/POST | `/api/volunteers` | user | list slots (`?eventId=`) / open a slot (dept lead of the event's dept, VL, admin) |
| POST/DELETE | `/api/volunteers/[id]/signup` | user | take a seat (live capacity check, idempotent) / release it |
| GET/POST | `/api/reports` | lead+ | list (own depts for leads, all for VL/admin) + auto-compile a monthly draft from live counts |
| GET/PATCH | `/api/reports/[id]` | lead+ | read / edit-submit (`submitted` is terminal; only admin reopens) |
| GET | `/api/reports/export` | VL/admin | semester/annual JSON export of submitted reports + live counts (`export_reports`; VL scoped to own vertical) |
| GET/POST | `/api/handover` | admin | continuity checklist list / create |
| PATCH | `/api/handover/[id]` | admin | toggle `done` / edit `detail` |
| GET | `/api/finance` | VL/admin | snapshot: budget heads + approved spend + pending expenses + sponsorship pipeline (VL scoped to own vertical + society-wide) |
| POST/PATCH | `/api/finance/expenses` | lead+/admin | propose (dept leads and above) / approve-or-reject `{approved\|rejected}` (admin only; VL `recommend_only`) |
| POST/PUT | `/api/finance/sponsorships` | admin | create / update sponsor pipeline rows |
| GET | `/api/public/departments` | public | active departments + head names + member counts (tenant from host) |
| GET | `/api/public/events` | public | upcoming/live events (tenant from host) |
| GET | `/api/public/projects` | public | latest 24 showcased projects (tenant from host) |
| GET/POST/PATCH | `/api/admin/faq` | admin | FAQ manager backing store (create / edit incl. publish flag) |
| GET/PATCH | `/api/admin/flags` | admin | feature-flag list / toggle (incl. `github_integration` ingestion kill-switch) |
