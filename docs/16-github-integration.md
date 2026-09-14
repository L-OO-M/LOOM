# GitHub Integration Guide

How GitHub activity becomes proof inside L.O.O.M. — what is built, how to
connect it, and how to operate it. Companion to `04-github-pipeline.md`
(design) and `15-deploy-and-operations.md` (runbook).

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

- Username linking is **manual** (students type their GitHub username;
  `GET /api/github` reports `oauthConfigured: false`). There is no GitHub
  App OAuth login yet.
- The webhook writes events and verifies merges **inline**. The standalone
  processor `POST /api/jobs/github/process` exists for scheduler/queue-driven
  aggregation — wire it (section 5) so heatmaps keep moving under load.

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

## 3. Step A — students link their username

1. Student opens `/student/github`.
2. Enters their GitHub username in **Link GitHub** → `POST /api/github`
   (`{ "githubUsername": "..." }`, validated: 1–39 chars, `[a-zA-Z0-9-]`).
3. The link is stored in `github_connections` and mirrored to
   `profiles.github_username`, and audited as `linked_github`.
4. Matching everywhere is **case-insensitive** on this username.

No OAuth scopes are requested today — linking is a claim of identity, and
proof comes from merged work, not from login.

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
   are idempotent on `(deliveryId, eventName)`, so replays are safe.

Behavior per event (`app/api/github/webhook/route.js`):

- Stores the normalized event in `github_events` (120 req/min per tenant).
- On `pull_request` + `action: closed` + `merged: true`: looks up the repo
  in `open_source_projects` (owner/repo, case-insensitive, global or
  tenant-scoped), finds the student by linked username, upserts a `verified`
  contribution, awards badges (`awardOssBadges`), and notifies
  (`oss_verified` → `/student/opensource`). Best-effort — verification
  never breaks webhook acknowledgement.

## 5. Step C — curate repositories (admin)

Proof only counts in repos the chapter trusts:

1. Open `/admin/opensource` and add each repo as `owner / repo_name` with
   its `github_repo_url`, difficulty tag, and `is_curated = true`.
2. Tag issues upstream with `good-first-issue` so beginners can find them.
3. Students claim PRs on `/student/opensource` (`claimed`); merges flip
   them to `verified` automatically. Nothing manual to judge.

## 6. Step D — scheduled aggregation (recommended)

The webhook answers fast by design. For steady heatmaps under event bursts,
drive the processor on a schedule:

- **Every 15 minutes**: `POST /api/jobs/github/process` per recent
  undigested delivery (QStash cron, Vercel Cron, or GitHub Actions).
  Body: `{ idempotencyKey, eventName, deliveryId, actorLogin?, summary? }`.
  Push summaries may carry `{ commits: n }`; PRs and reviews count 1 each.
- **Nightly**: run `node load/rollup-analytics.js` (snapshots, streaks,
  cohorts) — without this, dashboards show yesterday forever.

Processor writes are idempotent (`ON CONFLICT DO NOTHING` / additive
upserts), so overlapping schedules are harmless.

## 7. Verify end-to-end

1. Link a test username on `/student/github` → expect `connected: true`.
2. Push a commit to any watched repo → `github_events` gains a row;
   heatmap updates after the next aggregation run.
3. Open a PR in a curated repo, claim it on `/student/opensource`,
   merge it → status becomes `verified`, badge (if earned) + notification
   appear. Check `/student/credentials` and the mentor-bar proof count.
4. Redeliver the merge event from GitHub → no duplicate rows, no double
   badge (idempotency).

## 8. Troubleshooting

| Symptom | Cause → fix |
|---|---|
| Webhook `404 TENANT_NOT_FOUND` | Host header doesn't match a tenant domain/slug → point GitHub at the chapter domain |
| `failed to connect to host` | Payload URL isn't reachable from the internet (localhost, `127.x`, `169.254.x`, LAN IP) → use the deployed HTTPS origin or a tunnel URL, and map that domain in `tenant_domains` |
| Webhook `401` | Secret mismatch → compare `GITHUB_WEBHOOK_SECRET` with the webhook secret byte-for-byte |
| Merge not auto-verified | Repo not curated, author's GitHub username not linked, or PR target outside tracked `owner/repo` |
| Heatmaps frozen | Aggregation not scheduled → run the processor + nightly rollup, then schedule them |
| `429` on bursts | Per-tenant 120/min guard → spread deliveries or raise the limit in code |

## 9. Pause switch (ingestion is opt-in)

Webhooks fire automatically once configured — but the app only acts on them
when the chapter enables ingestion. The `github_integration` feature flag
(default **off**, migration `020`) gates everything:

- Webhook with a valid signature while paused → `200 { accepted: false,
  reason: "GITHUB_INGESTION_PAUSED" }`. Nothing stored, verified, or
  aggregated. GitHub stays green.
- `ping` deliveries are always acked (proves the URL works, stores nothing).
- The processor job (`/api/jobs/github/process`) refuses work the same way.
- Enable in **Admin → Flags → github integration**. Disable any time to
  freeze ingestion instantly — deliveries made while paused are skipped, not
  queued (replay from GitHub's Recent Deliveries after re-enabling).

## 10. Limits & next steps

- No OAuth yet: usernames are self-asserted; verification rests on merged
  work, which is the correct trust order anyway.
- Rate limits are in-memory per instance — use a gateway limiter for
  multi-instance production.
- Reconciliation (polling GitHub REST/GraphQL for missed events) is
  designed (`04`) but not scheduled — add it once the chapter is live.
- Raw `github_events` retention is unbounded today; set a pruning policy
  before the table grows (aggregates are what dashboards read).
