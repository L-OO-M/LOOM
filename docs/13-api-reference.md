# API Reference

Base: same origin. Envelope: `{ ok: true, data }` / `{ ok: false, error: { code, message } }`.
Auth: Auth0 session cookie (primary) or Supabase session cookie (legacy/E2E fallback). Pages redirect to `/login`; `/api/*` returns `401 UNAUTHORIZED`.
Tenant: derived server-side from the caller's profile. `adminOnly` routes return `403 FORBIDDEN` for students.
Governance: non-founder leadership is term-bound; an ended term is treated as `core` at request time. Scoped routes require the record's vertical/department to be owned by the caller (see [Governance](23-governance-and-terms.md)).

Public (no session): `GET /api/health`, `GET /api/chapters`, `POST /api/github/webhook` (HMAC `x-hub-signature-256`), `POST /api/admin/claim-first`, `GET /api/admin/check-setup`, `GET /api/auth/providers`, `GET /api/auth/state`.

## Core

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET/PATCH | `/api/profile` | user | own profile. PATCH takes `name`, `enrollmentNumber`, `department`, `rollNumber`, `branch`, `institution`, `location`, `year`, `primaryDomain`, `onboardingCompleted`. `institution` is matched against the chapters (`lib/chapters.js`): while onboarding is unfinished it may move the account to the chapter that serves that college, carrying department memberships by slug; after that, or for anyone holding a position or a platform-admin seat, it records the institution and refuses the move with a reason in `data.chapter` |
| POST | `/api/account/close` | user (own account) | self-service closure. `{confirm:"CLOSE MY ACCOUNT", reason?}`. Deactivates the profile, erases identifying fields (`name` becomes "Former member", enrollment/roll/branch/department/year/institution/location/github cleared), deletes the public `user_profiles` card and `github_connections` row, drops department seats, withdraws open seat requests, and clears notifications — all in one transaction. The ledger id, verified work, contributions, and audit rows stay. Refuses with `ADMIN_HANDOVER_REQUIRED` for admins/platform admins and `LEADERSHIP_HANDOVER_REQUIRED` for a live Head seat; adding `closed_at`/`closed_reason` (migration 104) is the record an admin reviews. Rate limited; audited as `account.closed` |
| GET | `/api/roadmap` | user | nodes + my progress |
| POST | `/api/roadmap/progress` | user | mark node (body: nodeId, status, evidenceUrl?, evidenceNote?). **Prerequisites are checked** against `roadmap_edges`; unmet ones return `409 PREREQUISITES_UNMET` with the outstanding node titles. A completion is stored `provisional` and **scores nothing** until a lead confirms it. Re-claiming or reopening a previously verified node revokes `roadmap_done` and recomputes the score. Rate limited. |
| GET | `/api/resources` | user | curated library |
| GET/POST | `/api/projects` | user | create: title, description, roadmapNodeId?, **`repositoryId` (preferred; a repo row from your linked GitHub account) or `repoUrl` (github.com/owner/repo)**, tags. Ownership is proven by the OAuth `github_repo_grants` row when available; otherwise the legacy owner-handle match is accepted but stays `provisional` — **scores nothing** until a signed delivery proves activity or a lead confirms it. One claim per repo. Rate limited. |
| GET/PATCH | `/api/projects/[id]` | owner/admin | PATCH cannot set `evidence_state`/`verified_by`/`verified_at`. Changing `repoUrl` returns the claim to provisional. Archiving withdraws the standing. |
| GET/POST | `/api/admin/ranking` | admin | the evidence review queue: GET lists provisional node/project claims; POST `{kind, id, decision:"verified"\|"rejected"}`, or `clearAllForStudent:true` to reverse every unverified claim for one student. Requires `verify_evidence` (admin/platform_admin). |
| GET/POST | `/api/contests` | user | list open contests / register (`{contestId}`) or submit (`?action=submit` with `{contestId, url?, note?}`) |
| GET/POST/PATCH | `/api/contests/manage` | lead+ (`manage_contests`) | lead/admin contest manager: list with registration/submission counts, create, change status |
| GET | `/api/contests/export` | lead+ (`manage_contests`) | CSV of registrations for `?contestId=` (tenant-scoped) |
| GET/POST | `/api/mentorship` | user | request/list sessions |
| PATCH | `/api/mentorship/[id]` | participant | accept, decline, complete, or cancel a session; role-specific transition maps, tenant-scoped, audited, notifies the counterpart |
| GET/POST | `/api/mentorship/apply` | user | generational loop: list my applications / apply (evidence-checked eligibility; 422 with reasons when not yet eligible) |
| GET/POST | `/api/admin/mentor-applications` | admin | review queue / approve (promotes to mentor) or reject |
| GET | `/api/leaderboard` | user | Standings board: `?scope=college\|global\|friends` `&period=all\|30d` `&q=` `&limit=` (≤100) `&offset=`; ranks share on ties (`RANK()`), service roles excluded. Returns `verifiedOnly` + `breakdown`; rows carry `verified_score` and `pending`. Counts **only** attested GitHub activity and verified evidence — see [`20-verified-ranking.md`](20-verified-ranking.md) |
| GET | `/api/notifications` | user | |
| POST | `/api/notifications/[id]/read` | user | |
| GET/POST/DELETE | `/api/github` | user | link username (POST), unlink own connection (DELETE), list repos + 120-day activity + `ingestionPaused` + `lastEventAt` (GET) |
| GET | `/api/github/oauth/start` | user | starts the repository-grant flow: signs state, sets the short-lived state cookie, then redirects to GitHub |
| GET | `/api/github/oauth/callback` | user | OAuth callback: verifies state/nonce, exchanges the code, stores the sealed token and repo grants, backfills the contribution calendar (best effort), then redirects back to the student GitHub page |
| GET/POST | `/api/github/repos` | user | OAuth repo picker: `GET ?page=1..5` lists repositories the token can push to (cached in `repositories`, marks `alreadyLinked`); `POST {name, description?, isPrivate?}` creates one on the student's account and audits `created_github_repo` (5/min) |
| POST | `/api/github/sync` | user | refresh cached repository metadata from GitHub (up to 3 pages / 300 repos) **and** backfill the member's GitHub contribution calendar (last 180 days) into `student_daily_activity.github_contributions`; 3/min. Returns `{refreshed, contributions: {ok, days, total, reason?}}` — a calendar failure never fails the repository refresh |
| POST | `/api/github/repos/verify` | user | verify/add repositories: body `{repos: ["owner/repo", ...]}` (max 10). Each repo is checked with the student's stored GitHub token; grants are stored explicitly and provisional projects are activated. 12/min rate limit. Returns `{added, activated, repos: [{repo, ok, canPush, canAdmin, isPrivate, reason}]}` |
| POST | `/api/github/webhook` | service | HMAC-signed GitHub delivery: stores the event, aggregates into `student_daily_activity`, auto-verifies merged OSS PRs and submitted `pull_request_review` claims. Also reachable at the `/api/webhook` alias. |

## Practice room

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/practice/connection` | user | link or correct the caller's own public LeetCode handle (`{username}`). One handle per member per chapter; the handle is fixed once a solve is recorded so a member cannot switch accounts mid-chapter. Linking captures the account's real counters (solved total, Easy/Medium/Hard, ranking, streak, active days) into `practice_connections.leetcode_stats`, so the page never has to guess. The same snapshot carries the public submission calendar; the practice page and public profile draw its recent 400 days as a heatmap. No session cookie or password is ever requested. Rate limited. |
| POST | `/api/practice/refresh` | user | manually check the caller's recent public accepted submissions **and** refresh the LeetCode counters. Returns `{received, matched, credited, solved, stats}`. 15-minute cooldown; the next automatic check also waits an hour. Recorded progress and the last stats snapshot are preserved on LeetCode errors. Rate limited. |
| POST | `/api/practice/session` | user | practice session lifecycle for the caller. `{action:"start"}` returns `{session, resumed}` and reuses any open session; `{action:"attempt", questionId, outcome:"attempted"\|"solved", sessionId?}` appends a self-reported `practice_attempts` row (auto-opens a session when none is given) and returns `{session, attempt}`; `{action:"complete", sessionId}` closes the caller's open session idempotently and returns `{session, scorecard}`. Tenant and user always come from the session; scores count unique attempted problems and only treat `practice_solves` accepted inside the session window as verified. 120/min. |
| GET | `/api/proof` | user | the caller's own proof read model from `lib/proof.js`: `{counts:{verifiedProjects,mergedPrs,solvedProblems,certificates,activeDays}, items:[{kind,label,detail,href,verified,source,at}]}`. Pure read — identity and chapter come from the session. |
| GET/POST | `/api/admin/proof` | `verify_evidence` (admin) | GET returns the chapter's undecided proof signals (`?status=pending`); POST `{userId, signal:"project:<uuid>"\|"oss:<uuid>", decision:"approve"\|"reject", note?}` records a durable `proof_reviews` row, notifies the member and audits. The signal must point at a row owned by that member in the caller's chapter. |
| POST | `/api/admin/practice/weeks` | admin or DSA department lead | create/update a Monday–Sunday IST week (`{id?, title, date, status: draft\|scheduled, questions[]}`). A scheduled week needs exactly seven distinct LeetCode problems; a released week is locked and corrections take over. Audited. |
| POST | `/api/admin/practice/corrections` | admin | grant/remove credit for one member and one assigned question (`{userId, questionId, credited, acceptedAt, evidence, reason}`). Overrides automatic checks, writes/revokes `dsa_solved` evidence, recomputes the score, audits and notifies the member. |

Practice reads are server-rendered: `/student/practice` and `/student/practice/leaderboard` are tenant-scoped and `noindex`; `/admin/practice` and `/lead/practice` expose authoring and sync health. Practice points are a weekly habit board, separate from chapter standing.

## Open source

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/opensource/projects` | user | global curated + own tenant; includes my counts; metadata carries `topics`, `contributing_url`, `homepage`, `pushed_at`, `metadata_synced_at`, `is_active` |
| POST | `/api/opensource/projects` | admin | curate `{owner, repo, difficulty, primaryDomain}` — live GitHub fetch; 404 if repo missing; upserts by canonical GitHub URL and refreshes metadata (`metadata_synced_at`) |
| GET | `/api/opensource/contributions` | user | my claims + badges |
| POST | `/api/opensource/contributions` | user | claim PR/issue URL in a tracked repo → `claimed` (20/min; body `contributionType` pr\|issue\|review, audited). The server derives the type from the URL, stores a canonical URL, and rejects mismatches (`TYPE_MISMATCH`) or repo/issue combinations that cannot be verified. Duplicate canonical URLs upsert instead of inflating badges. |
| PATCH | `/api/opensource/contributions/[id]` | admin | `{status: verified\|rejected}` — verify awards ledger evidence, badges, achievements and notification. Reject revokes `oss_verified` (canonical and legacy raw URL), recomputes the score, removes badges/achievements no longer earned, and returns `{granted, revoked}` |

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
| GET/POST | `/api/admin/credential-keys` | admin | list public key metadata / `{action:"rotate"}` creates a new encrypted-at-rest Ed25519 signer and keeps old public keys for verification; `{action:"revoke", keyId, reason}` revokes one key with audit history |
| POST | `/api/admin/certificates/[id]/revoke` | admin | revoke an active tenant certificate with a mandatory reason; public verification changes to **Revoked** |
| GET | `/api/insights` | user | latest snapshot, 14-trend, peer avgs, rank, heuristic recommendation |

Certificates are rendered as pages rather than JSON. `GET /verify/certificate/[code]`
is public and shows **Verified** only when the stored signature and immutable
payload validate. New certificates use a tenant Ed25519 key when one is active;
legacy version-1 HMAC certificates remain verifiable during migration. A
tampered, expired, unsigned, certificate-revoked, or signing-key-revoked row
shows **Unverified**/**Revoked** and is `noindex`. `GET /student/certificates/[code]`
is restricted to the holder or an admin of the issuing chapter and returns
`notFound()` for anyone else.

## Community

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/community/threads` | list (q, domain, sort, state=all/unsolved/unanswered) / create (10/min) |
| GET/POST/PATCH | `/api/community/threads/[id]` | detail+replies (read-only, no view bump) / reply (notifies author at `/student/community/forums/[id]`) / solve (author, notifies replier) or pin (admin) |
| POST | `/api/community/votes` | toggle vote thread/reply/snippet (60/min) |
| POST | `/api/community/flags` | flag a thread or reply in the caller&apos;s tenant (reason: spam/abuse/off-topic; repeat flags don&apos;t recount; foreign or missing targets return 404 before any flag is written) |
| GET/POST | `/api/community/wiki` | search / create page |
| GET/PATCH | `/api/community/wiki/[slug]` | detail+edits (read-only, no view bump) / suggest (student) · apply/review (admin) |
| GET/POST | `/api/community/snippets` | search (q matches title/description/language — never code bodies) / share (screened for abuse) |
| PATCH/DELETE | `/api/community/snippets/[id]` | author/admin | edit or remove your own snippet (delete soft-hides: `status='hidden'`) |
| GET/PATCH | `/api/admin/community` | admin: flag queues / hide-visible |

## Events & social

| Method | Route | Notes |
|--------|-------|-------|
| GET/POST | `/api/events` | visible upcoming/past events / scoped lead creation. POST accepts planner metadata (`plannerWeek`, `plannerKind`, `plannerRef`) and enforces the **server-owned tenant relaxation policy** (`RELAXATION_WINDOW`, 409); clients cannot claim an exemption. Department-lead society events start `submitted`; authorized VL/admin events and owned department workshops may start `published`. |
| GET/POST/PATCH | `/api/events/[id]` | detail+materials / register-cancel (event-row lock + in-transaction seat recount, explicit registration open/close timestamps, status and capacity) / attended-member feedback |
| PATCH | `/api/admin/events/[id]` | authorized event operator | edit event fields or request an FSM transition with optional `lockVersion`; legacy inputs `proposed`, `upcoming`, `past` map to `submitted`, `published`, `completed`. Invalid transitions fail and every successful status change appends `event_status_history` |
| POST | `/api/events/[id]/approve` | independent scoped VL/admin | approve+publish or reject a `submitted`/`under_review` event; self-approval blocked and `lockVersion` conflicts return 409 |
| POST | `/api/events/[id]/materials` | admin: attach link material |
| GET/POST | `/api/planner` | user-readable planner. GET returns the 28 weeks, sessions and planner-linked events (`?track=dsa\|ai_ml\|…\|all`, `?week=1..28`); POST schedules a society event (admin/`vertical_lead` only) at `{week, title, startsAt, eventType, kind, …}`, enforces the relaxation window, audits and returns 23505 as `DUPLICATE`. **Currently disabled:** `PLANNER_ENABLED = false` (`lib/feature-flags.js`) makes every planner API return 404 and hides its nav entry; the three HTML planner routes render a "not switched on" page inside `AppShell` rather than the generic 404. |
| GET | `/api/planner/ics` | user: download the selected track's dated sessions + society events as an RFC 5545 calendar (`.ics`, `Asia/Kolkata`); deferred and in-window sessions are omitted. **Currently 404** while `PLANNER_ENABLED` is false. |
| PATCH | `/api/planner` | admin/`vertical_lead`: `{action:"reassign", fromUserId\|null, toUserId}` moves every session owned by `fromUserId` (or the unassigned bucket when null) to `toUserId` in the caller's chapter, audits, notifies the successor, and returns `{reassigned, toUserId}` |
| POST | `/api/events/[id]/attendance` | exact event door grant, owning department operator, scoped VL, or admin | canonical check-in route by QR/door code or student ID; duplicate-safe attendance + evidence + ranking outbox + certificate issuance in one transaction. `/api/admin/events/[id]/attendance` remains a compatibility alias |
| GET | `/api/admin/events/[id]/attendees/export` | dept_lead+ (`manage_event_ops`): attendee ledger as a UTF-8 CSV download (name, email, domain, status, door code, registered-at, feedback) |
| GET/POST | `/api/volunteers` | authenticated: slots (optionally `?eventId=`) with live counts / open a slot (event dept lead, VL, or admin); capacity enforced on signup |
| POST/DELETE | `/api/volunteers/[id]/signup` | authenticated: take or release one volunteer seat (idempotent; `EVENT_FULL` 409) |
| GET/PUT | `/api/social/profile` | my card / claim-edit username (unique, validated; static `/student/*` segments reserved); `links: {github, leetcode, linkedin, x, website, discord, kaggle, unstop, devfolio, huggingface}` is merged into `user_profiles.social_links` (handles normalised from a bare login or a pasted profile URL, URL fields screened), with the top-level `github`/`linkedin` fields kept for older clients; bio is screened (format + abuse); `endorsementsVisible` toggles the endorsement opt-out; `avatarUrl` is accepted for `dept_lead`+ only (a photo is for leads and heads) and forced to null below that |
| GET | `/api/identity` | session | the member's linked developer accounts (10 providers) with the `claimed → linked → verified → rejected` state, method, proof URL, and the owner-only one-time code. Legacy handles still in `social_links` surface as `claimed` |
| POST/DELETE | `/api/identity` | session, 20/min/user: save or clear one provider `{provider, value}`. Saving records a claim; it becomes `verified` only on an OAuth match (GitHub) and `linked` when LeetCode's API confirms the account exists. Also mirrors the handle into `social_links` |
| POST | `/api/identity/verify` | session, 6/min/user: `{provider, proofUrl}` fetches a public page the member controls and looks for their `loom-verify-…` code. Host-allowlisted per provider, rejects private/loopback addresses, no redirects, 8s timeout, 512KB cap. A hit sets `verified`; a miss records `rejected` |
| GET/POST/DELETE | `/api/tracks` | session, 30/min/user: roadmaps the member follows. POST `{domain}` follows, `DELETE ?domain=` unfollows; both return the current list. `profiles.primary_domain` is always treated as followed on read, so the table stores only the extra tracks |
| GET/POST/DELETE | `/api/social/connections` | follow state+endorsements / follow-toggle or `?mode=endorse` — target must be a public card in the caller's chapter (else `NOT_FOUND`); follow notifies with a link to the follower's profile when visible; `DELETE ?mode=endorsement&id=` lets the recipient remove an endorsement made about them |
| GET/POST | `/api/social/discover` | trending threads, mentors, rising builders (public same-chapter cards only) / mentor review |

## Debug & build (migration 078)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| POST | `/api/admin/debug/challenges` | admin | Author a debug challenge against `DEBUG_CHALLENGE_REPO` (default `L-OO-M/buggy`). Domain must be a LOOM primary domain. Publishing stamps `published_at`, which is the fork-created-after boundary |
| POST | `/api/debug/submissions` | user with linked GitHub | Submit a fork URL (optional PR URL). GitHub verifies account ownership, fork parent, creation time and an authored commit; failures stay `error/pending`, never auto-rejected |
| POST | `/api/lead/debug` | matching `dept_lead` or admin | Approve or return a verified submission with mandatory feedback. `approved` writes `debug_fixed` evidence; returning revokes it. Self-review is refused |

Approved debug fixes enter chapter standing as `debug_fixed` (weight 15, cap 10) through the verified-evidence ledger.

## Society challenges (migration 085)

The chapter also runs one shared open-source challenge: the `L-OO-M/buggy` repository (or `DEBUG_CHALLENGE_REPO` when configured), where each primary domain has a folder of intentionally broken projects. It is not a `debug_challenges` row — the challenge is the repository folder itself — so submissions are stored separately.

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/challenges/oss?domain=` | user | the caller's own society/curated submissions for one track (newest first, max 50) |
| POST | `/api/challenges/oss` | user with linked GitHub | `{domain, repoFullName, forkUrl, note?}`. The upstream must be the society repo or a repository curated **for that domain** (`REPO_NOT_ALLOWED` otherwise). GitHub verifies fork ownership, fork parent and an authored commit. Rate limited 10/min. One fork per member per repository. |
| PATCH | `/api/challenges/oss/[id]` | matching `dept_lead` or admin | `{decision: approved\|rejected, feedback}`. Approval requires `verification_status = verified`, writes `oss_challenge` evidence, recomputes the score, audits and notifies. Returning revokes any evidence and keeps the submission history. Self-review is refused. |

The rules shown on `/student/challenges` are `SOCIETY_RULES` in `lib/society.js`; folder links come from `SOCIETY_FOLDERS`, so the roadmap panel and the hub cannot disagree. Approved fixes are worth 20 points, capped at 10 per chapter, and are deliberately **not** `oss_verified` — that kind still means a merged upstream pull request.

## Errors & limits

Common codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `SELF_APPROVAL_BLOCKED` 403, `NOT_FOUND` 404, `REPO_NOT_TRACKED` 404, `REPOSITORY_NOT_FOUND` 404, `REPO_NAME_TAKEN` 422, `TYPE_MISMATCH` 400, `EVENT_FULL` 409, `REGISTRATION_CLOSED` 409, `INVALID_TRANSITION` 409/422, `CONCURRENCY_CONFLICT` 409, `CONFLICT` 409, `LEADERSHIP_APPOINTMENT_REQUIRED` 409, `REPORT_LOCKED` 409, `USERNAME_TAKEN` 409, `DUPLICATE` 409, `RATE_LIMITED` 429, `GITHUB_SIGNATURE_INVALID` 401, `GITHUB_NOT_LINKED` 409, `GITHUB_RELINK_REQUIRED` 409, `GITHUB_SCOPE_MISSING` 403, `GITHUB_OAUTH_NOT_CONFIGURED` 503, `RELAXATION_WINDOW` 409.
Rate limits are in-memory per instance (vote 60/min, claims 20/min, thread-create 10/min, webhook 120/min per tenant).

## Org, leads & operations (added after the initial reference)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/departments` | user | active tenant departments + member counts + my level |
| POST | `/api/departments/[id]/join` | user | instant approval-free join as `general` (idempotent) |
| POST | `/api/departments/[id]/request-core` | user | Core request (creates `general` + `core_requested` if needed). **Gated**: refused unless the verified record clears `REQUIREMENTS.core` in `lib/role-requests.js` (3 verified pieces + rank above Beginner), one open request per seat, 14-day cooldown after a decision. Records a `role_requests` row with a snapshot of rank/proof. `409` = state conflict (already asked / cooldown / already Core), `403` = record below the bar |
| PATCH | `/api/departments/[id]/members/[userId]` | lead/admin | roster-only `{level: core\|general}` (upward role sync; demotion to `general` lowers `profiles.role` to `student` only when no Core seat remains elsewhere); also `{declineCore:true, reason}` to decline that member's open Core request in this department, clearing `core_requested` and closing the matching `role_requests` row with the member's reason. A `dept_lead` membership returns `LEADERSHIP_APPOINTMENT_REQUIRED`; Head appointment/demotion is only `/api/admin/students`, where term, membership, slot, scoped grant, history, audit, and notification share one transaction |
| DELETE | `/api/departments/[id]/members/[userId]` | lead/admin | remove a General/Core member; Head seats return `LEADERSHIP_APPOINTMENT_REQUIRED`. Work and contributions stay attributed; same role-downgrade rule + audit + notification |
| POST | `/api/departments/[id]/members` | lead/admin | `{userId, level?: general|core}` add an existing chapter member to this department; refuses to touch an existing Head; audit + notification |
| GET | `/api/departments/[id]/tasks` | dept member, assignee, VL own vertical, admin | the department's work board (`?mine=1` narrows to the caller's assignments); each row carries assignee, due date, evidence, completion note and reviewer |
| POST | `/api/departments/[id]/tasks` | dept Head/Co-Head (`manage_department_tasks`), VL own vertical, admin | assign work (`title`, `detail`, `kind`, `priority`, `assigneeId`, `dueAt`); the assignee must already be on the roster; notifies them |
| GET | `/api/departments/[id]/tasks/[taskId]` | as the board | one task, tenant- and department-scoped |
| PATCH | `/api/departments/[id]/tasks/[taskId]` | assignee / Head / Co-Head / admin | one transition: `update`, `start`, `block` (reason required, optional category from the closed list), `submit` (evidence URL required), `approve`, `return` (reason required), `reopen`, `cancel` (soft delete). A submission cannot be approved or returned by the person who submitted it; every transition is audited. The expected prior status is part of the `WHERE`, so a task moved by someone else returns `409 CONFLICT` instead of being overwritten. Moving `dueAt` clears both reminder stamps so the new deadline re-arms them |
| GET/POST | `/api/announcements` | user | scoped feed (published + unexpired; society + my verticals + my departments) / post (`status=draft|published`, optional `expiresAt`; `post_announcement`: VL own vertical or society-wide, dept_lead own department feed) + fan-out only when published. `?manage=1` returns drafts to leads/admins |
| PATCH | `/api/announcements/[id]` | author/admin | publish a draft (`{status:"published"}`), stamp `published_at`, audit the transition, fan out once |
| GET/POST | `/api/contributions` | user | contribution ledger: self-log, or lead-log for own department (`log_contribution`) |
| GET/POST | `/api/workflows` | authenticated scoped lead/admin | list only workflows visible through ownership, membership, receiving department, or active vertical grant / create the implemented `society_workshop` pipeline. Initiator and linked event/project/owner are tenant-validated; unsupported reserved workflow types fail validation |
| PATCH | `/api/workflows/[id]/handoffs/[handoffId]` | receiving-team lead or assigned owner | explicit `start\|submit\|approve\|return\|block` FSM; validates department deliverables and dependencies, blocks self-review, advances the next step, completes the workflow, and returns 409 on a stale status write |
| GET/POST | `/api/approvals/[id]` | requester/admin read; independent admin decide | read an approval and its decisions / add `approved\|rejected\|exception_approved`. Duplicate/self decisions fail; exception approval requires an overdue request and reason; final decision and audit are transactional |
| GET | `/api/people/[id]` | user (same chapter) | the small card behind a name: role, domain, departments, tier, verified proof, chapter position, public-profile link when their card is public, and the admin record link for admin viewers. Target is looked up inside the caller's tenant, so a foreign id answers `404` |
| GET/POST | `/api/role-requests` | user | `?target=core\|dept_lead&departmentId=` returns the caller's live eligibility, blocking reasons, requirement and history. `POST {target_role, department_id, statement(40-2000)}` creates one request — refused unless the verified record clears the bar, while another request for that seat is open, or during the 14-day cooldown. Raises `core_requested` for a Core request. Audit + notify |
| POST | `/api/admin/role-requests/[id]` | admin | `{decision: approved\|rejected, reason?}`. Approving applies role + membership level (+ Head seat, term end in a year) in one transaction; refuses `SEAT_OCCUPIED` and `SELF_DECISION`. Declining requires the reason the member will read. Audit + notify |
| GET | `/api/lead/overview` | dept_lead+ | lead console dataset (shared query with `/lead` page; `?vertical=` override). Roster rows carry the same `progress` object the member sees - tier, chapter position, verified proof and last recorded activity - batched in one pass. Also returns `queue`, the read-only operational queue defined in `lib/queue.js` || PATCH | `/api/lead/succession` | dept_lead/admin | flag/unflag a core member `succession_ready` (Head/Co-Head of that dept, or admin) |
| GET/POST | `/api/lead/handover` | dept_lead+ (`manage_handover`) | own handovers + eligible successors / nominate a successor and file the brief (`?all=1` = admin review queue, each row carrying `work.ownOpen` and `work.unassigned` so the approver sees the size of the move first) |
| PATCH | `/api/lead/handover/[id]` | outgoing lead | save a draft, submit for approval, or cancel (scope re-checked server-side); the four `transfer*` flags are editable while it is a draft |
| POST | `/api/lead/handover/[id]/transfer` | admin (not the outgoing or incoming account) | approve and atomically move role, head slot, planner sessions, open event-ops, and — for a department head — only their own unfinished `department_tasks` in the department being handed over |
| GET | `/api/lead/assets` | dept_lead+ (`view_assets`) | creative asset library list (`?category=&kind=&q=`) |
| POST | `/api/lead/assets` | dept_lead+ (`manage_assets`) | create an asset: multipart file upload, or JSON link-out with `externalUrl`. Optional `departmentId` must be a department the caller leads (admins may pick any); with no `departmentId`, a head of exactly one department files into it, everyone else into the shared library |
| GET | `/api/lead/assets/[id]` | dept_lead+ (`view_assets`) | one asset + its version history |
| PATCH | `/api/lead/assets/[id]` | dept_lead+ (`manage_assets`) | edit title/description/category/tags/kind; set or clear `externalUrl`; `isActive` |
| DELETE | `/api/lead/assets/[id]` | dept_lead+ (`manage_assets`) | archive (soft delete `is_active = false`; files and versions are kept) |
| POST | `/api/lead/assets/[id]/versions` | dept_lead+ (`manage_assets`) | upload a new version of a file asset (multipart `file`) |
| GET | `/api/lead/assets/[id]/download` | dept_lead+ (`view_assets`) | `302` to a 5-minute signed URL (or the external link); raw `<a>`, never `<Link>` |
| GET | `/api/lead/asset-categories` | dept_lead+ (`view_assets`) | the tenant's categories (seeded logos/signatures/templates/…) |
| GET | `/api/lead/mous` | dept_lead+ (`view_lead_tools`) | MoU list (`?status=&expiring=1&q=`; `expiring` = active and ending within the renewal window, default 30 days via `MOU_RENEWAL_WINDOW_DAYS`); leads see own-domain + society-wide rows; each row carries its open renewal task |
| POST | `/api/lead/mous` | dept_lead+ (`manage_mou`) | record an agreement; `vertical` must be owned (society-wide is admin-only; a sole-domain lead defaults to their vertical); optional `sponsorshipId` must belong to the same tenant and domain |
| GET | `/api/lead/mous/[id]` | dept_lead+ (`view_lead_tools`) | one agreement + versioned documents + renewal task history (non-null vertical must be owned to read) |
| PATCH | `/api/lead/mous/[id]` | dept_lead+ (`manage_mou`) | edit fields / change status / link `sponsorshipId`; both the current and next vertical must be owned; moving `endsOn` resets the expiry reminder |
| DELETE | `/api/lead/mous/[id]` | dept_lead+ (`manage_mou`) | archive (soft delete; documents kept); owned vertical only |
| POST | `/api/lead/mous/[id]/renewal` | dept_lead+ (`manage_mou`) | open one owned renewal task (`ownerId`, `nextAction`, `dueOn`); `409` if an open task already exists; notifies the owner |
| PATCH | `/api/lead/mous/[id]/renewal` | dept_lead+ (`manage_mou`) | close an open task (`{ action: "close", taskId }`), stamping `closed_by`/`closed_at` and auditing it |
| GET/POST | `/api/lead/mous/[id]/documents` | dept_lead+ (`view_lead_tools`/`manage_mou`) | list signed copies / upload a new labelled version (multipart `file`, `label`); owned vertical only for writes |
| GET | `/api/lead/mous/[id]/documents/[documentId]/download` | dept_lead+ (`view_lead_tools`) | `302` to a short-lived signed URL (raw `<a>`); non-null vertical must be owned |
| GET | `/api/lead/directory` | dept_lead+ (`view_lead_tools`) | leadership directory (`?department=&vertical=&current=1&q=`); leads see own-domain + society-wide entries |
| POST | `/api/lead/directory` | dept_lead+ (`manage_handover`) | add a person; entry vertical follows its department, otherwise must be owned; `photoUrl` is the required public portrait for current leads |
| GET | `/api/lead/directory/[id]` | dept_lead+ (`view_lead_tools`) | one directory entry (non-null vertical must be owned to read) |
| PATCH | `/api/lead/directory/[id]` | dept_lead+ (`manage_handover`) | edit fields (incl. `photoUrl`) / flip current ↔ past / archive; current and next vertical must be owned |
| DELETE | `/api/lead/directory/[id]` | dept_lead+ (`manage_handover`) | remove (soft delete); owned vertical only |
| GET | `/api/lead/event-ops` | dept_lead+ (`view_lead_tools`) | operations tasks (`?event=&status=&owner=&due=soon&q=`); own tasks + own-domain events |
| POST | `/api/lead/event-ops` | dept_lead+ (`manage_event_ops`) | add a task; event must be in an owned vertical, society-wide task is admin-only |
| GET | `/api/lead/event-ops/[id]` | dept_lead+ (`view_lead_tools`) | one task (own, or event in an owned vertical) |
| PATCH | `/api/lead/event-ops/[id]` | dept_lead+ (`manage_event_ops`) | edit / change status (stamps `done_at`/`done_by` on completion); cannot move across domains |
| DELETE | `/api/lead/event-ops/[id]` | dept_lead+ (`manage_event_ops`) | remove (soft delete); own or own-domain only |
| GET | `/api/admin/overview` | admin | command deck: per-department cards + pending approval counts |
| PATCH | `/api/admin/students` | admin | authoritative role/leadership change with scope + `termEnd` (YYYY-MM-DD; defaults to one year for dept_lead / vertical_lead / admin). Refuses founder seats, self-changes, and removing the last admin; atomically closes/opens `leadership_terms`, syncs membership/slot and scoped grants, audits |
| POST | `/api/admin/students/bulk` | admin | assign role + term to at most **500** users per request (larger or empty arrays are rejected with `VALIDATION_ERROR` before any write; same guards as single; terms/memberships/scoped grants are one transaction). `mode:"department"` instead adds General/Core memberships without touching `profiles.role`; role grants above the actor's rank are refused |
| GET/PATCH | `/api/admin/tenant-settings` | admin | read normalized chapter policy / patch validated `relaxation_window`, `dual_head_approval`, or `public_passport_defaults`; rejects unknown or malformed settings and audits changes |
| GET/POST | `/api/admin/outbox` | admin | tenant queue health + latest dead letters / retry one tenant-owned dead row from attempt zero; retry is audited |
| GET | `/api/admin/governance/analytics` | admin | pending/approved/rejected/overdue approval metrics, workflow/handoff status counts, and outbox health |
| PATCH | `/api/admin/students/[id]/status` | admin | `{status:"suspended"\|"deactivated"\|"active", reason, confirm}`. Suspension/deactivation bites on the next request; closing requires every offboarding item; reactivation requires `confirm:true`; founder/self/last-active-admin guards; audited |
| PATCH | `/api/admin/students/[id]/checklist` | admin | toggle one per-role onboarding/offboarding item (`{kind, itemKey, done}`), upsert completion, audit |
| GET | `/api/admin/students` | admin | roster with `role_term_end` for the term column; paged with `?page` and `?pageSize` (default 50, max 100) and returns `pagination` metadata |
| POST | `/api/events` | lead/admin | lead-create: VL/admin go live; dept_lead's department workshop goes live, society-wide post waits as `proposed` |
| POST | `/api/events/[id]/approve` | VL/admin | publish (`upcoming`) or send back (`cancelled`) a proposed event + notify author |
| GET/POST | `/api/volunteers` | user | list slots (`?eventId=`) / open a slot (dept lead of the event's dept, VL, admin) |
| POST/DELETE | `/api/volunteers/[id]/signup` | user | take a seat (live capacity check, idempotent) / release it |
| GET/POST | `/api/reports` | lead+ | list (own departments for heads, own vertical for VLs, all for admins) + auto-compile a monthly draft from live counts (submitted rows return `REPORT_LOCKED`) |
| GET/PATCH | `/api/reports/[id]` | lead+ | read / edit narrative, edit-submit (`submitted` is terminal; only admin reopens); VL restricted to reports in their vertical |
| GET | `/api/reports/export?scope=semester\|annual&format=json\|csv\|pdf` | VL/admin | one query rendered as JSON, CSV or PDF: submitted reports (including narrative), live counts, and the department x month coverage grid (`export_reports`; VL scoped to own vertical) |
| GET/POST | `/api/handover` | admin | continuity checklist list / create; each new item requires a named `ownerId` (tenant-validated), plus `owner_name` and `department_name` on read |
| PATCH | `/api/handover/[id]` | admin | toggle `done` / edit `detail` / reassign `ownerId` (`null` clears) |
| GET | `/api/admin/succession` | admin | unified succession read model: checklist, handover briefs, transfer flags and leadership terms, outstanding first (`lib/succession.js`; same function feeds `/admin/handover`) |
| GET | `/api/finance` | VL/admin | snapshot: budget heads + approved/paid spend + pending expenses + sponsorship pipeline (VL scoped to own vertical + society-wide) |
| POST/PATCH | `/api/finance/expenses` | scoped lead/admin | propose against an owned budget head with receipt evidence / decide through the shared approval request (including configured independent dual approval at the aggregate threshold) / mark an approved expense paid through the independent finance boundary. A proposer cannot approve their own spend |
| POST/PUT | `/api/finance/sponsorships` | admin / vertical lead | create / update sponsor pipeline rows; a VL is restricted to their own `vertical` |
| GET | `/api/public/departments` | public | active departments + head/co-head names and `head_avatar`/`co_head_avatar` (directory photo, else account avatar) + member counts (tenant from host) |
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
| GET | `/api/help/matches/[id]` | — | One match, tenant-scoped and participant-only (signal owner or nominated helper) |
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

## Auth (Auth0 is the only front door)

Sign-in, sign-up, email verification, and password policy are owned by Auth0's
Universal Login. `/login` and `/register` render two paths — **Continue with
GitHub** (`/auth/login?connection=github`) and **email or username + password**
(`/auth/login`, Auth0's database connection) — and no credential form of their
own. The app holds no Supabase credential path: the login/register forms, the
client helper, and the server session fallback were removed, not flagged off.

GitHub must be enabled for the Auth0 application (Authentication → Social →
GitHub → Applications). When it is not, clicking the GitHub path returns
Auth0's `connection is not enabled` error; email/username keeps working.

The retired Supabase endpoints are kept as **unconditional 410 Gone**
tombstones so cached bundles, bookmarks, and old clients get an explanation
instead of a bare 404, and so the paths keep their middleware body-size and
rate-limit plumbing. No environment variable can re-enable them.

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/auth/state` | public | lightweight session probe for client components: `{signedIn, email}` from the Auth0 session, never a profile or tenant |
| GET | `/api/auth/providers` | public | static capability probe: `{auth0:true, email:false, github:false}`. Supabase provider flags are gone; Auth0's Universal Login decides which social connections appear |
| GET | `/api/auth/security` | session | Auth0 sign-in methods and whether a database password is linked. `managementConfigured:false` means the deployment cannot add a password yet |
| POST | `/api/auth/password` | session, 5/hour/user | adds or updates an Auth0 database password for the signed-in account. Body `{password}` (8–200 chars); 400 `EMAIL_UNVERIFIED` / `PASSWORD_REJECTED`, 409 `PASSWORD_IDENTITY_CONFLICT`, 503 `PASSWORD_SETUP_UNAVAILABLE` |
| GET | `/api/auth/verify-email/confirm?token=` | public | legacy only: consumes a token mailed before the cutover (single-use, 24h), stamps `profiles.email_verified_at/source`, 303-redirects to `/verify-email?status=verified\|expired\|invalid`. No new tokens are minted |
| POST | `/api/auth/register` | — | **retired**, always `410 AUTH0_ONLY`. Accounts are created at Auth0 Universal Login |
| POST | `/api/auth/login` | — | **retired**, always `410 AUTH0_ONLY`. Use `/auth/login` (Auth0 SDK) |
| POST | `/api/auth/verify-email/start` | — | **retired**, always `410 AUTH0_ONLY`. Auth0 sends the verification email |
| GET | `/auth/supabase-callback` | — | **retired**, 307 to `/login?error=auth0_only`. Auth0's callback is `/auth/callback` |

### Callback failures are ours, not Auth0's text

`/auth/callback` uses a custom `onCallback` (`lib/auth0.js`). On failure it
302s to `/login?error=<code>` with a code from `lib/auth.js`
(`provider_disabled`, `access_denied`, `redirect_not_allowed`, `auth_callback_failed`),
which the page renders as a sentence. Auth0's `error_description` is never
shown. On success it 302s to `returnTo` (validated) or `/auth/continue`, never
the site root.

### First-admin bootstrap

`POST /api/admin/claim-first` is public in middleware (no admin exists yet) but
is **not** an open land grab: it requires `FIRST_ADMIN_CODE` in the body, matched
in constant time against the server secret. Unset or sub-16-character
configuration fails closed with `503 SETUP_DISABLED`; a wrong or missing code is
`403 INVALID_CODE`; losing the first-claim race is `403 ALREADY_SETUP`. The code
is handed out by the operator, not advertised in the UI, and can be removed from
the environment after the claim.

## Health

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/health` | public | Real DB probe. `200` when reachable, `503` when not. Reports `checks.database`, `checks.configuration` (placeholder/missing secrets **by name only**), and `isolation.{flag,connection,effective}` — the authoritative answer to "is Row Level Security actually in force?". Exposes no tenant id, host, port, or error strings |

## Admin boards (backing stores for the admin UI)

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/admin/audit` | admin | audit trail, filterable |
| GET/POST/PATCH | `/api/admin/contests` | admin | contest manager; PATCH closes/reopens a contest; GET is paged with `?page` and `?pageSize` (default 50, max 100) and returns `pagination` metadata |
| POST | `/api/admin/contests/judge` | admin | judge a submission `{submissionId, status:"submitted"\|"shortlisted"\|"winner"\|"rejected", score?, feedback?}`: writes `contest_top` evidence for winners, revokes it when a winner is displaced, skips self-verification, audits and notifies; an identical repeat returns `{unchanged:true}` with no second audit/notification |
| GET/POST/PATCH | `/api/admin/mentors` | admin | mentor roster; GET is paged with `?page` and `?pageSize` (default 50, max 100) and returns `pagination` metadata |
| GET/POST/PATCH | `/api/admin/projects` | admin | project curation; GET is paged with `?page` and `?pageSize` (default 50, max 100) and returns `pagination` metadata |
| GET/POST/PATCH | `/api/admin/resources` | admin | resource library manager (optional `nodeId` pins a resource to a roadmap node); GET is paged with `?page` and `?pageSize` (default 50, max 100) and returns `pagination` metadata |
| GET/POST/PATCH | `/api/admin/roadmaps` | admin | roadmap authoring (nodes + edges) |

### `/api/admin/flags` is partially operator-only

`PATCH` returns `403 OPERATOR_ONLY` for `tenant_rls_enforced`. That flag is
global, not chapter-scoped, and flipping it changes production security posture,
so it is changed deliberately in SQL after `npm run rls:verify` — not from the
UI. See `docs/rls-rollout-runbook.md`.
