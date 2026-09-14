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
