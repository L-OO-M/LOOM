# API Reference

Base: same origin. Envelope: `{ ok: true, data }` / `{ ok: false, error: { code, message } }`.
Auth: Supabase session cookie. Pages redirect to `/login`; `/api/*` returns `401 UNAUTHORIZED`.
Tenant: derived server-side from the caller's profile. `adminOnly` routes return `403 FORBIDDEN` for students.
Governance: non-founder leadership is term-bound; an ended term is treated as `core` at request time. Scoped routes require the record's vertical/department to be owned by the caller (see [Governance](23-governance-and-terms.md)).

Public (no session): `GET /api/health`, `GET /api/chapters`, `POST /api/github/webhook` (HMAC `x-hub-signature-256`), `POST /api/admin/claim-first`, `GET /api/admin/check-setup`.

## Core

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET/PUT | `/api/profile` | user | own profile |
| GET | `/api/roadmap` | user | nodes + my progress |
| POST | `/api/roadmap/progress` | user | mark node (body: nodeId, status, evidenceUrl?, evidenceNote?). **Prerequisites are checked** against `roadmap_edges`; unmet ones return `409 PREREQUISITES_UNMET` with the outstanding node titles. A completion is stored `provisional` and **scores nothing** until a lead confirms it. Rate limited. |
| GET | `/api/resources` | user | curated library |
| GET/POST | `/api/projects` | user | create: title, description, roadmapNodeId?, **`repositoryId` (preferred; a repo row from your linked GitHub account) or `repoUrl` (github.com/owner/repo)**, tags. Ownership is proven by the OAuth `github_repo_grants` row when available; otherwise the legacy owner-handle match is accepted but stays `provisional` — **scores nothing** until a signed delivery proves activity or a lead confirms it. One claim per repo. Rate limited. |
| GET/PATCH | `/api/projects/[id]` | owner/admin | PATCH cannot set `evidence_state`/`verified_by`/`verified_at`. Changing `repoUrl` returns the claim to provisional. Archiving withdraws the standing. |
| GET/POST | `/api/admin/ranking` | admin | the evidence review queue: GET lists provisional node/project claims; POST `{kind, id, decision:"verified"\|"rejected"}`, or `clearAllForStudent:true` to reverse every unverified claim for one student. Requires `verify_evidence` (admin/platform_admin). |
| GET/POST | `/api/contests` | user/admin-create | register + submit flows |
| GET/POST | `/api/mentorship` | user | request/list sessions |
| GET/POST | `/api/mentorship/apply` | user | generational loop: list my applications / apply (evidence-checked eligibility; 422 with reasons when not yet eligible) |
| GET/POST | `/api/admin/mentor-applications` | admin | review queue / approve (promotes to mentor) or reject |
| GET | `/api/leaderboard` | user | Standings board: `?scope=college\|global\|friends` `&period=all\|30d` `&q=` `&limit=` (≤100) `&offset=`; ranks share on ties (`RANK()`), service roles excluded. Returns `verifiedOnly` + `breakdown`; rows carry `verified_score` and `pending`. Counts **only** attested GitHub activity and verified evidence — see [`20-verified-ranking.md`](20-verified-ranking.md) |
| GET | `/api/notifications` | user | |
| POST | `/api/notifications/[id]/read` | user | |
| GET/POST/DELETE | `/api/github` | user | link username (POST), unlink own connection (DELETE), list repos + 120-day activity + `ingestionPaused` + `lastEventAt` (GET) |
| GET/POST | `/api/github/repos` | user | OAuth repo picker: `GET ?page=1..5` lists repositories the token can push to (cached in `repositories`, marks `alreadyLinked`); `POST {name, description?, isPrivate?}` creates one on the student's account and audits `created_github_repo` (5/min) |
| POST | `/api/github/sync` | user | refresh cached repository metadata from GitHub (up to 3 pages / 300 repos; 3/min) |
| POST | `/api/github/webhook` | service | HMAC-signed GitHub delivery: stores the event, aggregates into `student_daily_activity`, auto-verifies merged OSS PRs and submitted `pull_request_review` claims. Also reachable at the `/api/webhook` alias. |

## Open source

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/opensource/projects` | user | global curated + own tenant; includes my counts; metadata carries `topics`, `contributing_url`, `homepage`, `pushed_at`, `metadata_synced_at`, `is_active` |
| POST | `/api/opensource/projects` | admin | curate `{owner, repo, difficulty, primaryDomain}` — live GitHub fetch; 404 if repo missing; upserts by canonical GitHub URL and refreshes metadata (`metadata_synced_at`) |
| GET | `/api/opensource/contributions` | user | my claims + badges |
| POST | `/api/opensource/contributions` | user | claim PR/issue URL in a tracked repo → `claimed` (20/min; body `contributionType` pr\|issue\|review, audited). The server derives the type from the URL, stores a canonical URL, and rejects mismatches (`TYPE_MISMATCH`) or repo/issue combinations that cannot be verified. Duplicate canonical URLs upsert instead of inflating badges. |
| PATCH | `/api/opensource/contributions/[id]` | admin | `{status: verified\|rejected}` — awards badges + achievements + notify |

## Chapters & network

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/chapters` | public | featured public chapters, anonymized counts, ordered featured → members → slug |
| GET | `/api/network` | user | all public chapters + my partnerships + latest federation row, ordered featured → members → slug |

## Credentials & insights

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/credentials` | user | achievements + share links, tenant-scoped (legacy `tenant_id IS NULL` rows still allowed) |
| POST | `/api/credentials` | user | issue signed link for own achievement (`expiresInDays` 0–730) |
| GET/POST | `/api/admin/badges` | admin | badge definitions (tier 1–3) |
| POST | `/api/admin/achievements` | admin | issue to a chapter student + notify |
| GET | `/api/insights` | user | latest snapshot, 14-trend, peer avgs, rank, heuristic recommendation |

Certificates are rendered as pages rather than JSON. `GET /verify/certificate/[code]`
is public and shows **Verified** only when the stored HMAC signature matches the
immutable certificate fields; tampered, unsigned, or `revoked_at` rows show
**Unverified**/`Revoked` and are `noindex`. `GET /student/certificates/[code]`
is restricted to the holder or an admin of the issuing chapter and returns
`notFound()` for anyone else.

## Community

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/community/threads` | list (q, domain, sort, state=all/unsolved/unanswered) / create (10/min) |
| GET/POST/PATCH | `/api/community/threads/[id]` | detail+replies (read-only, no view bump) / reply (notifies author at `/student/community/forums/[id]`) / solve (author, notifies replier) or pin (admin) |
| POST | `/api/community/votes` | toggle vote thread/reply/snippet (60/min) |
| POST | `/api/community/flags` | flag thread/reply for moderation (reason: spam/abuse/off-topic; repeat flags don&apos;t recount) |
| GET/POST | `/api/community/wiki` | search / create page |
| GET/PATCH | `/api/community/wiki/[slug]` | detail+edits (read-only, no view bump) / suggest (student) · apply/review (admin) |
| GET/POST | `/api/community/snippets` | search (q matches title/description/language — never code bodies) / share (screened for abuse) |
| PATCH/DELETE | `/api/community/snippets/[id]` | author/admin | edit or remove your own snippet (delete soft-hides: `status='hidden'`) |
| GET/PATCH | `/api/admin/community` | admin: flag queues / hide-visible |

## Events & social

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/events` | upcoming/past / admin create (capacity enforced) |
| GET/POST/PATCH | `/api/events/[id]` | detail+materials / register-cancel / feedback |
| POST | `/api/events/[id]/materials` | admin: attach link material |
| POST | `/api/admin/events/[id]/attendance` | admin: check in by door code → attended + certificate (once) + notify |
| GET/PUT | `/api/social/profile` | my card / claim-edit username (unique, validated; static `/student/*` segments reserved); GitHub handle, LinkedIn URL and bio are screened (format + abuse); `endorsementsVisible` toggles the endorsement opt-out |
| GET/POST/DELETE | `/api/social/connections` | follow state+endorsements / follow-toggle or `?mode=endorse` — target must be a public card in the caller's chapter (else `NOT_FOUND`); follow notifies with a link to the follower's profile when visible; `DELETE ?mode=endorsement&id=` lets the recipient remove an endorsement made about them |
| GET/POST | `/api/social/discover` | trending threads, mentors, rising builders (public same-chapter cards only) / mentor review |

## Errors & limits

Common codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `REPO_NOT_TRACKED` 404, `REPOSITORY_NOT_FOUND` 404, `REPO_NAME_TAKEN` 422, `TYPE_MISMATCH` 400, `EVENT_FULL` 409, `USERNAME_TAKEN` 409, `DUPLICATE` 409, `RATE_LIMITED` 429, `GITHUB_SIGNATURE_INVALID` 401, `GITHUB_NOT_LINKED` 409, `GITHUB_RELINK_REQUIRED` 409, `GITHUB_SCOPE_MISSING` 403, `GITHUB_OAUTH_NOT_CONFIGURED` 503.
Rate limits are in-memory per instance (vote 60/min, claims 20/min, thread-create 10/min, webhook 120/min per tenant).

## Org, leads & operations (added after the initial reference)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/departments` | user | active tenant departments + member counts + my level |
| POST | `/api/departments/[id]/join` | user | instant approval-free join as `general` (idempotent) |
| POST | `/api/departments/[id]/request-core` | user | one-click core request (creates `general` + `core_requested` if needed) |
| PATCH | `/api/departments/[id]/members/[userId]` | lead/admin | `{level: core}` by dept Head/Co-Head or admin; `{level: dept_lead}` admin-only; upward-only role sync + audit |
| GET/POST | `/api/announcements` | user | scoped feed (society + my verticals + my departments) / post (`post_announcement`: VL own vertical or society-wide, dept_lead own department feed) + fan-out to notifications |
| GET/POST | `/api/contributions` | user | contribution ledger: self-log, or lead-log for own department (`log_contribution`) |
| GET | `/api/lead/overview` | dept_lead+ | lead console dataset (shared query with `/lead` page; `?vertical=` override) |
| PATCH | `/api/lead/succession` | dept_lead/admin | flag/unflag a core member `succession_ready` (Head/Co-Head of that dept, or admin) |
| GET | `/api/lead/assets` | dept_lead+ (`view_assets`) | creative asset library list (`?category=&kind=&q=`) |
| POST | `/api/lead/assets` | dept_lead+ (`manage_assets`) | create an asset: multipart file upload, or JSON link-out with `externalUrl` |
| GET | `/api/lead/assets/[id]` | dept_lead+ (`view_assets`) | one asset + its version history |
| PATCH | `/api/lead/assets/[id]` | dept_lead+ (`manage_assets`) | edit title/description/category/tags/kind; set or clear `externalUrl`; `isActive` |
| DELETE | `/api/lead/assets/[id]` | dept_lead+ (`manage_assets`) | archive (soft delete `is_active = false`; files and versions are kept) |
| POST | `/api/lead/assets/[id]/versions` | dept_lead+ (`manage_assets`) | upload a new version of a file asset (multipart `file`) |
| GET | `/api/lead/assets/[id]/download` | dept_lead+ (`view_assets`) | `302` to a 5-minute signed URL (or the external link); raw `<a>`, never `<Link>` |
| GET | `/api/lead/asset-categories` | dept_lead+ (`view_assets`) | the tenant's categories (seeded logos/signatures/templates/…) |
| GET | `/api/lead/mous` | dept_lead+ (`view_lead_tools`) | MoU list (`?status=&expiring=1&q=`; `expiring` = active and ending within 30 days); leads see own-domain + society-wide rows |
| POST | `/api/lead/mous` | dept_lead+ (`manage_mou`) | record an agreement; `vertical` must be owned (society-wide is admin-only; a sole-domain lead defaults to their vertical) |
| GET | `/api/lead/mous/[id]` | dept_lead+ (`view_lead_tools`) | one agreement + its versioned documents (non-null vertical must be owned to read) |
| PATCH | `/api/lead/mous/[id]` | dept_lead+ (`manage_mou`) | edit fields / change status; both the current and next vertical must be owned; moving `endsOn` resets the expiry reminder |
| DELETE | `/api/lead/mous/[id]` | dept_lead+ (`manage_mou`) | archive (soft delete; documents kept); owned vertical only |
| GET/POST | `/api/lead/mous/[id]/documents` | dept_lead+ (`view_lead_tools`/`manage_mou`) | list signed copies / upload a new labelled version (multipart `file`, `label`); owned vertical only for writes |
| GET | `/api/lead/mous/[id]/documents/[documentId]/download` | dept_lead+ (`view_lead_tools`) | `302` to a short-lived signed URL (raw `<a>`); non-null vertical must be owned |
| GET | `/api/lead/directory` | dept_lead+ (`view_lead_tools`) | leadership directory (`?department=&vertical=&current=1&q=`); leads see own-domain + society-wide entries |
| POST | `/api/lead/directory` | dept_lead+ (`manage_leads`) | add a person; entry vertical follows its department, otherwise must be owned |
| GET | `/api/lead/directory/[id]` | dept_lead+ (`view_lead_tools`) | one directory entry (non-null vertical must be owned to read) |
| PATCH | `/api/lead/directory/[id]` | dept_lead+ (`manage_leads`) | edit fields / flip current ↔ past / archive; current and next vertical must be owned |
| DELETE | `/api/lead/directory/[id]` | dept_lead+ (`manage_leads`) | remove (soft delete); owned vertical only |
| GET | `/api/lead/event-ops` | dept_lead+ (`view_lead_tools`) | operations tasks (`?event=&status=&owner=&due=soon&q=`); own tasks + own-domain events |
| POST | `/api/lead/event-ops` | dept_lead+ (`manage_event_ops`) | add a task; event must be in an owned vertical, society-wide task is admin-only |
| GET | `/api/lead/event-ops/[id]` | dept_lead+ (`view_lead_tools`) | one task (own, or event in an owned vertical) |
| PATCH | `/api/lead/event-ops/[id]` | dept_lead+ (`manage_event_ops`) | edit / change status (stamps `done_at`/`done_by` on completion); cannot move across domains |
| DELETE | `/api/lead/event-ops/[id]` | dept_lead+ (`manage_event_ops`) | remove (soft delete); own or own-domain only |
| GET | `/api/admin/overview` | admin | command deck: per-department cards + pending approval counts |
| PATCH | `/api/admin/students` | admin | change a role with scope + `termEnd` (YYYY-MM-DD; defaults to one year for dept_lead / vertical_lead / admin). Refuses founder seats, self-changes, and removing the last admin; closes/opens `leadership_terms`, syncs membership terms, audits |
| POST | `/api/admin/students/bulk` | admin | assign role + term to ≤50 users at once (same guards as single; each user gets a `leadership_terms` row and membership term dates) |
| GET | `/api/admin/students` | admin | roster with `role_term_end` for the term column |
| POST | `/api/events` | lead/admin | lead-create: VL/admin go live; dept_lead's department workshop goes live, society-wide post waits as `proposed` |
| POST | `/api/events/[id]/approve` | VL/admin | publish (`upcoming`) or send back (`cancelled`) a proposed event + notify author |
| GET/POST | `/api/volunteers` | user | list slots (`?eventId=`) / open a slot (dept lead of the event's dept, VL, admin) |
| POST/DELETE | `/api/volunteers/[id]/signup` | user | take a seat (live capacity check, idempotent) / release it |
| GET/POST | `/api/reports` | lead+ | list (own departments for heads, own vertical for VLs, all for admins) + auto-compile a monthly draft from live counts |
| GET/PATCH | `/api/reports/[id]` | lead+ | read / edit-submit (`submitted` is terminal; only admin reopens); VL restricted to reports in their vertical |
| GET | `/api/reports/export` | VL/admin | semester/annual JSON export of submitted reports + live counts (`export_reports`; VL scoped to own vertical) |
| GET/POST | `/api/handover` | admin | continuity checklist list / create |
| PATCH | `/api/handover/[id]` | admin | toggle `done` / edit `detail` |
| GET | `/api/finance` | VL/admin | snapshot: budget heads + approved spend + pending expenses + sponsorship pipeline (VL scoped to own vertical + society-wide) |
| POST/PATCH | `/api/finance/expenses` | lead+/admin | propose (leads restricted to their department/vertical) / approve-or-reject `{approved\|rejected}` (admin only; VL `recommend_only`) |
| POST/PUT | `/api/finance/sponsorships` | admin | create / update sponsor pipeline rows |
| GET | `/api/public/departments` | public | active departments + head names + member counts (tenant from host) |
| GET | `/api/public/events` | public | upcoming/live events (tenant from host) |
| GET | `/api/public/projects` | public | latest 24 showcased projects (tenant from host) |
| GET | `/api/public/summary` | public | answer-engine summary: static product facts + aggregate counts only (departments, upcoming events, public builder cards, projects) |
| GET/POST/PATCH | `/api/admin/faq` | admin | FAQ manager backing store (create / edit incl. publish flag) |
| GET/PATCH | `/api/admin/flags` | admin | feature-flag list / toggle (incl. `github_integration` ingestion kill-switch) |

## Peer help (migration 028)

Rate-limited, permission-checked via `help:request` (any authenticated member).
Drives the `/student/help` page. Helper enrollment is opt-in: a member must
explicitly set `available: true` via `PATCH /api/help/profile` before they
can be nominated.

| Method | Route | Rate limit | Notes |
|--------|-------|-----------|-------|
| POST | `/api/help/signals` | 10/min | Raise a struggle signal `{kind, ref_id}`. `kind` ∈ `roadmap_node\|resource\|contest\|topic`. Idempotent per `(tenant, user, kind, ref)` — repeat calls increment `failures_count`. Increments automatically after a repeated `active` roadmap-node POST |
| GET | `/api/help/signals` | — | My signals, newest first |
| POST | `/api/help/match` | 5/min | Nominate helpers for **my own** signal `{signal_id}` (or `{kind, ref_id}`). Notifies each match and flips the signal to `matched`. Returns `helpers: []` with a message when nobody is available — not an error |
| PATCH | `/api/help/profile` | — | My helper profile `{available, topics?}`. This is the opt-in/opt-out switch |
| GET | `/api/help/matches/[id]` | — | One match, tenant-scoped |
| PATCH | `/api/help/matches/[id]` | — | `{status: accepted\|declined\|resolved\|closed}`. Only the signal owner or the nominated helper. `resolved` also resolves the signal. Notifies the other party; on `accepted` the notification links to the accepter's profile (the only channel the two share) |

Matching is deterministic and reads stored aggregates only
(`lib/recommend.js`) — no AI calls on the request path. Candidates are drawn
from `helper_profiles WHERE available` within the same tenant, excluding the
requester.

## Ideas / feature requests

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET/POST | `/api/feature-requests` | user | list (status filter: members see their own + approved/built) / create (abuse-screened, lands `pending`; mirrors to GitHub Issues when configured) |
| PATCH | `/api/feature-requests/[id]` | author/admin | edit title/body or change status (status changes mirror to the linked issue: `built` closes completed, `rejected` closes not-planned, anything else reopens) |
| POST | `/api/feature-requests/[id]/comments` | user | comment on a request |
| POST | `/api/feature-requests/[id]/github` | admin | create the issue if unlinked, otherwise refresh its stored state **and status** (closed+completed → `built`, closed+not-planned → `rejected`). 400 `NOT_CONFIGURED` when `GITHUB_ISSUES_REPO`/`GITHUB_ISSUES_TOKEN` are absent; failures are stored on the row, never fatal to the request |

The bridge is two-way. `POST /api/github/webhook` handles `issues` deliveries in
addition to activity events: closing a linked issue applies the same status
mapping, reopening one moves `built`/`rejected` back to `in_progress`, and the
requester is notified. The repository webhook must be subscribed to **Issues**
events for this to fire; `node load/sync-feature-requests.js --refresh` is the
manual reconciliation path.

## Auth & email verification

Verification is **optional**. There is no college-domain allowlist and no account is blocked
for being unverified; see `lib/email-verification.js` for the reasoning. When
`RESEND_API_KEY` + `EMAIL_FROM` are set, a member can prove control of their address; the link
is single-use, expires in 24h, and only its SHA-256 hash is stored.

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/auth/register` | public, 5/hour/IP | creates the Supabase user; `confirmationRequired` is reported, but no confirmation is enforced |
| POST | `/api/auth/login` | public, 8/10 min/IP | server-proxied so the app limiter sees attempts |
| POST | `/api/auth/verify-email/start` | session | 3/hour/user. Mints a token and sends one email. 400 `NOT_CONFIGURED` when no provider is configured |
| GET | `/api/auth/verify-email/confirm?token=` | public | consumes the token (once), stamps `profiles.email_verified_at/source`, 303-redirects to `/verify-email?status=verified\|expired\|invalid` |

## Health

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/health` | public | Real DB probe. `200` when reachable, `503` when not. Reports `checks.database`, `checks.configuration` (placeholder/missing secrets **by name only**), and `isolation.{flag,connection,effective}` — the authoritative answer to "is Row Level Security actually in force?". Exposes no tenant id, host, port, or error strings |

## Admin boards (backing stores for the admin UI)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/admin/audit` | admin | audit trail, filterable |
| GET/POST/PATCH | `/api/admin/contests` | admin | contest manager |
| GET/POST/PATCH | `/api/admin/mentors` | admin | mentor roster |
| GET/POST/PATCH | `/api/admin/projects` | admin | project curation |
| GET/POST/PATCH | `/api/admin/resources` | admin | resource library manager (optional `nodeId` pins a resource to a roadmap node) |
| GET/POST/PATCH | `/api/admin/roadmaps` | admin | roadmap authoring (nodes + edges) |

### `/api/admin/flags` is partially operator-only

`PATCH` returns `403 OPERATOR_ONLY` for `tenant_rls_enforced`. That flag is
global, not chapter-scoped, and flipping it changes production security posture,
so it is changed deliberately in SQL after `npm run rls:verify` — not from the
UI. See `docs/rls-rollout-runbook.md`.