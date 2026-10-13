# GitHub Integration Guide

How GitHub activity becomes proof inside L.O.O.M. â€” what is built, how to
connect it, and how to operate it. (Supersedes the retired
`04-github-pipeline.md` design note; runbook lives in
`15-deploy-and-operations.md`.)

## 1. What the integration does

A student's real GitHub work â€” commits, pull requests, reviews, merges â€”
flows into the platform and becomes first-class evidence:

- **Daily activity** (`student_daily_activity`) feeds heatmaps, streaks, and
  consistency scores on the GitHub page and dashboard.
- **Merged PRs in curated repos** auto-verify (`student_oss_contributions`
  â†’ `verified`), award OSS badges, notify the student, and count as public
  proof toward mentor eligibility and credentials.
- Students **claim** PRs first on `/student/opensource`; the webhook upgrades
  the claim to `verified` when the merge lands. Unclaimed merges in tracked
  repos are recorded automatically.

Current scope, stated plainly:

- Username linking is **manual** (students type their GitHub username;
  `GET /api/github` reports `oauthConfigured: false`). There is no GitHub
  App OAuth login yet, so attribution rests on the link the member claims.
- The webhook writes events, aggregates daily activity, and verifies merges
  **inline**. There is no queue and no cron: aggregation happens on delivery.

### Aggregation is inline, not scheduled

The webhook aggregates each delivery into `student_daily_activity` as it arrives.
That table is what the heatmap, the commit/PR/streak tiles, and
`commits Ã— 5 + pull_requests Ã— 20` in the leaderboard score are computed from â€”
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
| `ping`, `issues`, `star`, `fork`, `create`, â€¦ | nothing |

Rows are attributed to the member who linked that GitHub username, scoped to
their own tenant, and upserted additively on `(student_id, day)`.

## 2. Prerequisites

- The app deployed over HTTPS with `NEXT_PUBLIC_APP_URL` set to the public
  origin (GitHub only delivers webhooks to public URLs).
- A tenant with a resolvable domain: the webhook resolves the chapter from
  the request's **Host header** (`lib/tenant.js`). Point GitHub at the
  chapter's domain (e.g. `https://loom.yourcollege.edu/api/github/webhook`),
  not a bare IP.
- Env vars: `GITHUB_WEBHOOK_SECRET` (required), `QSTASH_TOKEN` +
  `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (for scheduled
  aggregation, section 5).

## 3. Step A â€” students link their username

1. Student opens `/student/github`.
2. Enters their GitHub username in **Link GitHub** â†’ `POST /api/github`
   (`{ "githubUsername": "..." }`, validated: 1â€“39 chars, `[a-zA-Z0-9-]`).
3. The link is stored in `github_connections` and mirrored to
   `profiles.github_username`, and audited as `linked_github`.
4. Matching everywhere is **case-insensitive** on this username.

No OAuth scopes are requested today â€” linking is a claim of identity, and
proof comes from merged work, not from login.

## 4. Step B â€” receive webhooks from GitHub

1. In the society's GitHub organization (or per repository):
   **Settings â†’ Webhooks â†’ Add webhook**.
2. **Payload URL**: `https://<chapter-domain>/api/github/webhook`
3. **Content type**: `application/json`.
4. **Secret**: the same value as `GITHUB_WEBHOOK_SECRET`. Every delivery is
   HMAC-verified (`x-hub-signature-256`); bad signatures get `401`, missing
   headers get `400`.
5. **Events**: at minimum **Pushes** and **Pull requests**. Reviews and
   issues are accepted and stored but only pushes/PRs/reviews aggregate.
6. Use **Recent Deliveries â†’ Redeliver** to replay after outages â€” inserts
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
  contribution, awards badges (`awardOssBadges`), and notifies
  (`oss_verified` â†’ `/student/opensource`). Best-effort â€” verification
  never breaks webhook acknowledgement.

## 5. Step C â€” curate repositories (admin)

Proof only counts in repos the chapter trusts:

1. Open `/admin/opensource` and add each repo as `owner / repo_name` with
   its `github_repo_url`, difficulty tag, and `is_curated = true`.
2. Tag issues upstream with `good-first-issue` so beginners can find them.
3. Students claim PRs on `/student/opensource` (`claimed`); merges flip
   them to `verified` automatically. Nothing manual to judge.

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

1. Link a test username on `/student/github` â†’ expect `connected: true`.
2. Push a commit to any watched repo â†’ `github_events` gains a row;
   heatmap updates after the next aggregation run.
3. Open a PR in a curated repo, claim it on `/student/opensource`,
   merge it â†’ status becomes `verified`, badge (if earned) + notification
   appear. Check `/student/credentials` and the mentor-bar proof count.
4. Redeliver the merge event from GitHub â†’ no duplicate rows, no double
   badge (idempotency).

## 8. Troubleshooting

| Symptom | Cause â†’ fix |
|---|---|
| Webhook `404 TENANT_NOT_FOUND` | Host header doesn't match a tenant domain/slug â†’ point GitHub at the chapter domain |
| `failed to connect to host` | Payload URL isn't reachable from the internet (localhost, `127.x`, `169.254.x`, LAN IP) â†’ use the deployed HTTPS origin or a tunnel URL, and map that domain in `tenant_domains` |
| Webhook `401` | Secret mismatch â†’ compare `GITHUB_WEBHOOK_SECRET` with the webhook secret byte-for-byte |
| Merge not auto-verified | Repo not curated, author's GitHub username not linked, or PR target outside tracked `owner/repo` |
| Heatmaps frozen | Aggregation not scheduled â†’ run the processor + nightly rollup, then schedule them |
| `429` on bursts | Per-tenant 120/min guard â†’ spread deliveries or raise the limit in code |

## 9. Pause switch (ingestion is opt-in)

Webhooks fire automatically once configured â€” but the app only acts on them
when the chapter enables ingestion. The `github_integration` feature flag
(default **off**, migration `020`) gates everything:

- Webhook with a valid signature while paused â†’ `200 { accepted: false,
  reason: "GITHUB_INGESTION_PAUSED" }`. Nothing stored, verified, or
  aggregated. GitHub stays green.
- `ping` deliveries are always acked (proves the URL works, stores nothing).
- When paused, the webhook returns `200 { accepted: false, reason:
  "GITHUB_INGESTION_PAUSED" }` before touching `github_events` or
  `student_daily_activity`, so nothing is stored, verified, or aggregated and
  GitHub stays green. Deliveries made while paused are skipped, not queued
  (replay from GitHub's Recent Deliveries after re-enabling).
- Enable in **Admin â†’ Flags â†’ github integration**. Disable any time to
  freeze ingestion instantly â€” deliveries made while paused are skipped, not
  queued (replay from GitHub's Recent Deliveries after re-enabling).

## 10. Limits & next steps

- No OAuth yet: usernames are self-asserted; verification rests on merged
  work, which is the correct trust order anyway.
- Rate limits are in-memory per instance â€” use a gateway limiter for
  multi-instance production.
- Reconciliation (polling GitHub REST/GraphQL for missed events) is
  designed (`04`) but not scheduled â€” add it once the chapter is live.
- Raw `github_events` retention is unbounded today; set a pruning policy
  before the table grows (aggregates are what dashboards read).
- `student_daily_activity` is upserted additively on `(student_id, day)`, so a
  redelivered event counts twice. GitHub delivery ids are unique so this only
  happens on an explicit "Redeliver", not in normal operation.
