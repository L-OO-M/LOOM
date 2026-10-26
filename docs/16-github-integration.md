# GitHub Integration Guide

How GitHub activity becomes proof inside LOOM — what is built, how to
connect it, and how to operate it. (Supersedes the retired
`04-github-pipeline.md` design note; runbook lives in
`15-deploy-and-operations.md`.)

## 1. What the integration does

A student's real GitHub work — commits, pull requests, reviews, merges —
flows into the platform and becomes first-class evidence:

- **Daily activity** (`student_daily_activity`) feeds heatmaps, streaks, and
  consistency scores on the GitHub page and dashboard.
- **Merged PRs in curated repos** auto-verify (`student_oss_contributions`
  → `verified`), award OSS badges, notify the student, and count as public
  proof toward mentor eligibility and credentials.
- Students **claim** PRs first on `/student/opensource`; the webhook upgrades
  the claim to `verified` when the merge lands. Unclaimed merges in tracked
  repos are recorded automatically.

Current scope, stated plainly:

- **Identity** and **repository access** are separate grants. A student can
  type their GitHub username (manual link), and can separately connect GitHub
  through the app's OAuth App to prove repository ownership and use the repo
  picker. The OAuth grant matters for projects; webhook attribution still
  rests on the linked username.
- The webhook writes events, aggregates daily activity, and verifies merges
  and submitted reviews **inline**. There is no queue and no cron:
  aggregation happens on delivery.
- Repositories listed or created through OAuth are cached in `repositories`
  and `github_repo_grants`; stale metadata is refreshed with
  `POST /api/github/sync`.

### Aggregation is inline, not scheduled

The webhook aggregates each delivery into `student_daily_activity` as it arrives.
That table is what the heatmap, the commit/PR/streak tiles, and
`commits × 5 + pull_requests × 20` in the leaderboard score are computed from —
55% of the advertised score formula. If aggregation is not inline, every one of
those numbers reads zero no matter how much real activity there is.

A standalone `POST /api/jobs/github/process` worker used to own this. It had no
callers, no cron, and no `vercel.json`, so it never ran; the route has been
removed rather than left as a second writer with a different payload shape.

Counting rules (`summarizeDelivery`, covered by `tests/github-activity.test.js`):

| Event | Counted |
|---|---|
| `push` | `commits` = length of the commit array (a branch deletion is 0, not 1) |
| `pull_request` | 1 when `action` is `opened` or `reopened` |
| `pull_request_review` | 1 when `action` is `submitted` |
| `ping`, `star`, `fork`, `create`, … | nothing |
| `issues` | mirrors state onto a linked feature request (`closed` → `built`/`rejected`, `reopened` → `in_progress`); never counts as student activity |

Rows are attributed to the member who linked that GitHub username, scoped to
their own tenant, and upserted additively on `(student_id, day)`.

## 2. Prerequisites

- The app deployed over HTTPS with `NEXT_PUBLIC_APP_URL` set to the public
  origin (GitHub only delivers webhooks to public URLs).
- A tenant with a resolvable domain: the webhook resolves the chapter from
  the request's **Host header** (`lib/tenant.js`). Point GitHub at the
  chapter's domain (e.g. `https://loom.yourcollege.edu/api/github/webhook`),
  not a bare IP.
- Env vars for webhooks: `GITHUB_WEBHOOK_SECRET` (required) and
  `CREDENTIAL_SECRET` (recommended; signs OAuth state and credentials).
- Env vars for OAuth repository grants: `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, and `GITHUB_TOKEN_ENCRYPTION_KEY` (32 random bytes,
  base64). The OAuth App's callback URL is
  `NEXT_PUBLIC_APP_URL/api/github/oauth/callback`. Full operator setup:
  [`21-github-oauth-setup.md`](21-github-oauth-setup.md).
- `NEXT_PUBLIC_APP_URL` must be the real HTTPS origin — it builds both the
  callback and the webhook URL.

## 3. Step A — link identity and grant repository access

1. Student opens `/student/github`.
2. **Manual identity link**: enters their GitHub username in **Link GitHub** →
   `POST /api/github` (`{ "githubUsername": "..." }`, validated: 1–39 chars,
   `[a-zA-Z0-9-]`). Stored in `github_connections`, mirrored to
   `profiles.github_username`, audited as `linked_github`. Matching everywhere
   is case-insensitive.
3. **Repository grant**: `GET /api/github/oauth/start` redirects to GitHub with
   scopes `repo` and `read:user`. The callback verifies the signed state and
   single-use nonce, exchanges the code, seals the token, then stores
   `github_connections`, `repositories`, and `github_repo_grants` for the
   repositories the student selected. A successful grant can verify a project
   without waiting for a webhook; an identity link alone cannot.
4. The repo picker at `/student/projects/new` reads the cached list
   (`GET /api/github/repos`) and can create a new repository on the student's
   account (`POST /api/github/repos`). `POST /api/github/sync` refreshes
   metadata. Project creation accepts `{repositoryId}` (preferred) or
   `{repoUrl}`; the server re-checks ownership before saving.

## 4. Step B — receive webhooks from GitHub

1. In the society's GitHub organization (or per repository):
   **Settings → Webhooks → Add webhook**.
2. **Payload URL**: `https://<chapter-domain>/api/github/webhook`
3. **Content type**: `application/json`.
4. **Secret**: the same value as `GITHUB_WEBHOOK_SECRET`. Every delivery is
   HMAC-verified (`x-hub-signature-256`); bad signatures get `401`, missing
   headers get `400`.
5. **Events**: at minimum **Pushes** and **Pull requests**. Reviews and
   issues are accepted and stored but only pushes/PRs/reviews aggregate.
6. Use **Recent Deliveries → Redeliver** to replay after outages — inserts
   are idempotent on `(deliveryId, eventName)`, so replays do not duplicate raw
   events. The `student_daily_activity` upsert is additive, so a redelivered
   event does add to that day's totals again — prefer letting GitHub retry over
   manual redelivery.

Behavior per event (`app/api/github/webhook/route.js`):

- Stores the normalized event in `github_events` (120 req/min per tenant).
- Aggregates the delivery into `student_daily_activity` for the linked member
  (section 1), and audits both into `audit_logs` as `github_event_received`.
- On `pull_request` + `action: closed` + `merged: true`: looks up the repo
  in `open_source_projects` (owner/repo, case-insensitive, global or
  tenant-scoped), finds the student by linked username, upserts a `verified`
  contribution, awards badges (`awardOssBadges`), records `oss_verified`
  evidence, and notifies (`oss_verified` → `/student/opensource`).
- On `pull_request_review` + `action: submitted` by the linked student: finds
  the same tracked repo, upserts a `verified` `review` contribution keyed on
  the canonical pull URL, awards badges, and notifies. A review is signed
  evidence, so it does not wait for an admin to take the student's word for it.
  Dismissed/pending reviews are ignored.
- On pushes or opened PRs authored by the student in a repo they claimed, a
  provisional project is promoted to `verified` with `github:<login>` as the
  verifier.
- All of the above are best-effort — verification never breaks webhook
  acknowledgement.

## 5. Step C — curate repositories (admin)

Proof only counts in repos the chapter trusts:

1. Open `/admin/opensource` and add each repo as `owner / repo_name` with
   its `github_repo_url`, difficulty tag, and `is_curated = true`. The API
   fetches GitHub metadata live (description, language, stars, topics,
   homepage, last push) and stores `metadata_synced_at`.
2. Tag issues upstream with `good-first-issue` so beginners can find them.
3. Students claim PRs and issues on `/student/opensource` (`claimed`); merges
   and submitted reviews flip them to `verified` automatically. Admin review
   remains the fallback for anything the webhook did not see.
4. The catalogue is keyed case-insensitively on `owner/repo` (migration 052),
   so `FreeCodeCamp/FreeCodeCamp` and `freecodecamp/freecodecamp` cannot both
   appear.

## 6. Step D — nightly rollups (still scheduled)

Daily activity is aggregated inline by the webhook (section 1), so nothing extra
is needed to keep the heatmap, streak, and leaderboard current. What still needs
a schedule are the *derived* tables that cannot be maintained incrementally:

- **Nightly**: `node load/rollup-analytics.js` — per-student snapshots, streaks,
  cohort metrics. Without it, admin analytics and `/api/insights` show
  yesterday forever.
- Optionally `node load/rollup-federation.js` for the chapter-network figures.

Both are idempotent, so a missed night can simply be re-run.

## 7. Verify end-to-end

1. Link a test username on `/student/github` → expect `connected: true`.
2. Complete the repository OAuth grant → `/student/projects/new` lists the
   account's repositories; creating a project from a picked repo succeeds and
   `POST /api/github/sync` refreshes metadata.
3. Push a commit to any watched repo → `github_events` gains a row; the
   heatmap updates on the same delivery (aggregation is inline).
4. Open a PR in a curated repo, claim it on `/student/opensource`,
   merge it → status becomes `verified`, badge (if earned) + notification
   appear. Check `/student/credentials` and the mentor-bar proof count.
5. Submit a review on a tracked PR → a `review` contribution becomes
   `verified` without admin action.
6. Redeliver the merge event from GitHub → no duplicate rows, no double
   badge (idempotency).

## 8. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Webhook `404 TENANT_NOT_FOUND` | Host header doesn't match a tenant domain/slug → point GitHub at the chapter domain |
| `failed to connect to host` | Payload URL isn't reachable from the internet (localhost, `127.x`, `169.254.x`, LAN IP) → use the deployed HTTPS origin or a tunnel URL, and map that domain in `tenant_domains` |
| Webhook `401` | Secret mismatch → compare `GITHUB_WEBHOOK_SECRET` with the webhook secret byte-for-byte |
| Merge not auto-verified | Repo not curated, author's GitHub username not linked, or PR target outside tracked `owner/repo` |
| Review not verified | Review dismissed/pending, reviewer not linked, or repo not curated |
| Repo picker empty / `GITHUB_SCOPE_MISSING` | Token predates the `repo` scope or was revoked → re-link GitHub and approve repository access |
| Repo picker empty / `GITHUB_NOT_LINKED` | OAuth grant never completed → use **Connect GitHub**, not just the manual username link |
| Heatmaps frozen | Ingestion paused (`github_integration` flag) or webhook not delivering → check Recent Deliveries and the flag |
| `429` on bursts | Per-tenant 120/min guard → spread deliveries or raise the limit in code |

## 9. Pause switch (ingestion is opt-in)

Webhooks fire automatically once configured — but the app only acts on them
when the chapter enables ingestion. The `github_integration` feature flag
(default **off**, migration `020`) gates everything:

- Webhook with a valid signature while paused → `200 { accepted: false,
  reason: "GITHUB_INGESTION_PAUSED" }`. Nothing stored, verified, or
  aggregated. GitHub stays green.
- `ping` deliveries are always acked (proves the URL works, stores nothing).
- When paused, the webhook returns `200 { accepted: false, reason:
  "GITHUB_INGESTION_PAUSED" }` before touching `github_events` or
  `student_daily_activity`, so nothing is stored, verified, or aggregated and
  GitHub stays green. Deliveries made while paused are skipped, not queued
  (replay from GitHub's Recent Deliveries after re-enabling).
- Enable in **Admin → Flags → github integration**. Disable any time to
  freeze ingestion instantly — deliveries made while paused are skipped, not
  queued (replay from GitHub's Recent Deliveries after re-enabling).

## 10. Limits & next steps

- The **identity link** remains self-asserted; the **repository grant** is what
  proves ownership. Merged work and submitted reviews remain the strongest
  evidence because GitHub itself attests them in signed deliveries.
- OAuth access tokens are sealed with `GITHUB_TOKEN_ENCRYPTION_KEY`; rotating
  that key makes every stored token unreadable and requires members to re-link
  (see [`21-github-oauth-setup.md`](21-github-oauth-setup.md)).
- Rate limits are in-memory per instance — use a gateway limiter for
  multi-instance production.
- Reconciliation (polling GitHub REST/GraphQL for missed events) is
  designed (`04`) but not scheduled — add it once the chapter is live.
- Raw `github_events` retention is unbounded today; set a pruning policy
  before the table grows (aggregates are what dashboards read).
- `student_daily_activity` is upserted additively on `(student_id, day)`, so a
  redelivered event counts twice. GitHub delivery ids are unique so this only
  happens on an explicit "Redeliver", not in normal operation.
