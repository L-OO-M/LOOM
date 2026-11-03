# Deploy & Operations

## 1. Requirements

Node 20+, a Supabase project (Postgres + Auth), `DATABASE_URL` pooler string.

## 2. Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Auth + client |
| `DATABASE_URL` | yes | Migrations, seeds, rollups, server queries. Must be the **owner** (`postgres.<project-ref>`) — the app also uses it for unauthenticated public reads |
| `DATABASE_APP_URL` | yes in production | Request handling as `loom_app` (NOBYPASSRLS, not the table owner). `lib/env.js` falls back to `DATABASE_URL` for local work, but **production startup validation refuses to run without an explicit value** — otherwise the owner connection would silently bypass Row Level Security. `npm run rls:verify` also fails loudly. See `rls-rollout-runbook.md` |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin APIs + storage | Currently empty in dev — admin user management limited until set. Also required server-side by `lib/storage.js` (lead-tool file uploads) |
| `SUPABASE_STORAGE_BUCKET` | no (default `loom-files`) | Private bucket for lead-tool documents/assets. Create it and seed categories with `node load/setup-storage.js` |
| `NEXT_PUBLIC_APP_URL` | yes | metadataBase, share/verify links, calendar links. Unset in production publishes every absolute URL as `localhost` |
| `DEFAULT_TENANT_SLUG` | no (defaults to `DEV_TENANT_SLUG`) | Chapter that owns a server-to-server delivery (webhook) that carries no chapter identity in its `Host` header |
| `DEV_TENANT_SLUG` | local yes | Local/fallback chapter slug; no hardcoded default. Production onboarding resolves the chapter from the request host or `DEFAULT_TENANT_SLUG` |
| `DEV_TENANT_DOMAIN` | no (default `localhost`) | Host treated as the local dev tenant |
| `GITHUB_WEBHOOK_SECRET` | yes | Webhook HMAC only. **Production rejects placeholder values** (`dev-secret`, `hello`, …) and anything under 16 chars |
| `CREDENTIAL_SECRET` | yes in production | Credential share-link + GitHub OAuth-state HMAC. Deliberately has **no fallback** to the webhook secret, so rotating one trust domain does not invalidate the other. Production rejects a missing, placeholder, or sub-16-character value |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | for repo picker | GitHub OAuth App for repository grants; callback `${NEXT_PUBLIC_APP_URL}/api/github/oauth/callback`, scopes `repo` + `read:user`. Unset = the app reports OAuth not configured; repository picking stays unavailable |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | for repo picker | 32 random bytes, base64 (AES-256-GCM key for sealed GitHub tokens). Rotating it invalidates every stored token; members must re-link. See `21-github-oauth-setup.md` |
| `GITHUB_ISSUES_REPO` | no | `owner/repo` that feature requests mirror into. Unset = the GitHub Issues bridge is off and submissions behave exactly as before |
| `GITHUB_ISSUES_TOKEN` | no | Fine-grained token with **issues: write** on that repo (≥20 chars). Server-only — never `NEXT_PUBLIC_`. Missing token = bridge off, not a crash |
| `RESEND_API_KEY` | no | Optional email-verification sender. Unset = verification is unavailable and the UI says so; accounts are never blocked |
| `EMAIL_FROM` | no | Verified sender for `RESEND_API_KEY`, e.g. `LOOM <noreply@yourdomain>` |
| `AEO_BLOCK_TRAINING` | no | `1` blocks training-only crawlers (GPTBot, CCBot, …) in `robots.txt` while keeping search/assistant crawlers allowed. Unset = allow all public crawling |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | no | Search Console ownership meta tag, emitted once in `app/layout.jsx` |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_SECRET` | yes | **Auth0 login front door.** `AUTH0_SECRET` encrypts the session cookie (≥32 chars). Read only by `@auth0/nextjs-auth0` (via `lib/auth0.js`); **never** `NEXT_PUBLIC_`. Production boot rejects a missing or placeholder/short `AUTH0_SECRET` |
| `NEXT_PUBLIC_AUTH0_ONLY` | no (default `0`) | `1` hides the legacy Supabase email/password and GitHub forms on `/login` and `/register`. Enable only after existing accounts can sign in through Auth0 |
| `AUTH0_MANAGEMENT_CLIENT_ID` / `AUTH0_MANAGEMENT_CLIENT_SECRET` | no (password onboarding) | Machine-to-Machine app authorized for the Auth0 Management API with `read:users`, `create:users`, `update:users`, `delete:users`. Used only by `lib/auth0-management.js` to add a database identity/password to social accounts. Unset = the UI reports password setup unavailable and keeps social sign-in usable |
| `AUTH0_DB_CONNECTION` | no (default `Username-Password-Authentication`) | Auth0 database connection used when creating the password identity |
| `AUTH0_DB_CONNECTION_ID` | migration only | `con_...` ID for `load/auth0-migrate.mjs`; avoids needing `read:connections`. See `24-auth0-migration.md` |
| `AUTH0_MIGRATION_SCOPES` | no | Optional token scopes for migration; use `read:users create:users read:connections` only if those scopes are granted to the M2M app |
| `APP_BASE_URL` | no (recommended in prod) | Origin the SDK uses to build `/auth/callback` and logout URLs. Unset locally so the SDK infers it from the `Host` header (dev `localhost:3000` **and** Playwright `127.0.0.1:3000` both work). Set per deploy to the exact registered origin — **no `:443` suffix**. Every origin must be in the Auth0 app's Allowed Callback / Logout / Web Origins lists |

### Auth0 password onboarding (Management API)

Password setup for social accounts is optional. To enable it:

1. Auth0 Dashboard → Applications → **Create Application** → Machine-to-Machine.
2. Authorize it for the **Auth0 Management API** with `read:users`, `create:users`, `update:users`, `delete:users`.
3. Add the app's client ID/secret as `AUTH0_MANAGEMENT_CLIENT_ID` / `AUTH0_MANAGEMENT_CLIENT_SECRET` locally and in Vercel.
4. Redeploy, sign in through Auth0, and open `/student/settings`. The password fields appear only when the signed-in user has a verified email and no database identity yet.

The existing Auth0 application client is not authorized for the Management API; a separate M2M grant is required. If the variables are absent, `/api/auth/security` reports `managementConfigured: false` and the UI keeps social sign-in only.

For moving existing Supabase accounts, including password-hash export and bulk import, see [24-auth0-migration.md](24-auth0-migration.md).

### Search Console verification

Two independent methods are wired. Either one is sufficient — use both if unsure.

1. **HTML file (active).** `public/google98eae5c43ea32d19.html` is served at
   `https://<domain>/google98eae5c43ea32d19.html`. The middleware matcher excludes
   `.html` so an anonymous crawler is never redirected to `/login`, and
   `robots.txt` allows it via `Allow: /`. **Do not delete this file as unused** —
   `tests/search-console-verification.test.js` guards its presence, its exact
   token, and the matcher exclusion.
2. **Meta tag.** Set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` and redeploy. The tag
   is emitted once in `app/layout.jsx`, not per page.

Verify what the internet would actually see:

```bash
curl -sI https://<your-domain>/google98eae5c43ea32d19.html   # expect 200
curl -s  https://<your-domain>/google98eae5c43ea32d19.html   # expect the token
```

A `307` to `/login` means the middleware matcher regressed.
| `QSTASH_TOKEN`, `UPSTASH_REDIS_REST_*` | reserved (unused) | No queue/cache integration in use — webhook processes inline, rate limits are in-memory |
| `R2_*` | reserved (unused) | Object storage runs on **Supabase Storage** instead (`lib/storage.js`), so these R2 keys are not read |
| `SENTRY_DSN` | reserved (unused) | SDK not installed; errors surface via logs + `app/error.jsx` |

### Optional integrations

`GITHUB_ISSUES_*`, `RESEND_API_KEY`/`EMAIL_FROM`, and `AEO_BLOCK_TRAINING` are
deliberately optional and are **not** listed as required secrets in `lib/env.js`.
The app must boot and behave correctly without them: the feature-request board
simply hides the issue controls, the settings page reports that verification is
unavailable (`NOT_CONFIGURED`), and `robots.txt` allows all public crawling.
Adding one of these to the production boot guard would take the whole site down
for a convenience feature — don't.

Keep **Supabase Auth email confirmation disabled**. Signup reports
`confirmationRequired` but never gates on it, for two reasons: the free-tier
shared SMTP rate limit cannot sustain production signups, and many colleges
issue no student mailbox at all. Address verification is the optional Resend
flow in `lib/email-verification.js`, not an access requirement.

Feature-request issues are mirrored only for **new** submissions. After setting
`GITHUB_ISSUES_REPO` + `GITHUB_ISSUES_TOKEN` and redeploying, backfill the rows
that predate the bridge (idempotent; only unlinked rows are touched):

```
node load/sync-feature-requests.js                 # dry run
node load/sync-feature-requests.js --apply         # create + record links
node load/sync-feature-requests.js --apply --tenant demo-college --limit 50
node load/sync-feature-requests.js --refresh        # pull state/status from GitHub
node load/sync-feature-requests.js --refresh --apply
```

> **Placeholder secrets are rejected by the validation function, not by magic at
> module load.** `lib/env.js` compares by *value*, not just presence, so
> `GITHUB_WEBHOOK_SECRET=dev-secret` (the value shipped in `.env.example`) is
> rejected even though it is set. The check only runs where it is called: today
> that is the GitHub webhook and `GET /api/health` (which reports the problems
> instead of throwing). To make it a true boot gate, wire
> `lib/deploy-env-check.js` into the runtime; see §2c.

## 2b. Health and isolation state

```bash
curl -s https://<your-domain>/api/health
```

Returns `503` when Postgres is unreachable, and reports:

- `checks.database` — a real probe, not a hardcoded string.
- `checks.configuration` — placeholder or missing secrets, by name.
- `isolation.flag` / `.connection` / `.effective` — whether Row Level Security
  is genuinely in force. `effective: false` with `flag: true` means the app
  connection fell back to the owner role and policies are decorative.

The endpoint is unauthenticated, so it deliberately exposes no tenant id, host,
port, or error strings.

## 2c. Deploy-time environment check

`lib/deploy-env-check.js` is the small, dependency-free bridge between the
existing rules in `lib/env.js` and anything that boots the app:

```js
export function validateDeployEnv() // { ok, problems: [] } — non-throwing, for health/deploy scripts
export function assertDeployEnv()   // delegates to assertProductionSecrets(); throws in production
```

**Runtime wiring:** root `instrumentation.js` calls `assertDeployEnv()` when a
Node.js server instance starts. The production build phase is skipped because a
build host may not hold runtime secrets; a serving instance still refuses to
start with missing or placeholder values.

```js
// instrumentation.js
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  assertDeployEnv();
}
```

Local production-build E2E must provide the required test secrets (see
`AGENTS.md`); CI's `next build` runs in the build phase and does not need them.
Validation is production-only (`NODE_ENV === "production"`); local dev and CI
builds do not require secrets. It checks the same variables as
`assertProductionSecrets()`: `DATABASE_URL`, explicit `DATABASE_APP_URL`, the
signing secrets, the GitHub OAuth trio, Auth0 credentials, and
`NEXT_PUBLIC_APP_URL`.

## 3. Scripts

| Command | Does |
|---------|------|
| `npm run dev` | local server `:3000` |
| `npm run lint` / `npm run test` / `npm run test:e2e` | eslint / vitest / playwright |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:migrate` | `node load/migrate.js` — tracked, idempotent, one transaction per file, advisory-locked |
| `node load/setup-storage.js` | **once per env**: create the private `loom-files` bucket + seed asset categories (idempotent) |
| `npm run db:seed` | control-plane + roadmap/resources content |
| `npm run db:seed:roadmaps` | canonical roadmap graph (`seed-roadmaps.js`) + per-node resource shelves (`seed-node-resources.js`) |
| `npm run db:verify` | `node load/verify-roadmap-shelf.js` — READ-ONLY preflight: schema, migration record, mapping count, orphans/duplicates, app-role SELECT |
| `node load/seed-community.js` | curated OSS repos (live GitHub data) + demo chapter card |
| `npm run rollup:federation` | **nightly**: chapter stats + federation row |
| `npm run rollup:analytics` | **nightly**: snapshots, cohorts, funnels, mentor stats |
| `npm run prune:retention` | **daily**: report rows past their retention window. Dry run — add `-- --apply` to delete |
| `node load/remind-deadlines.js` | **hourly**: in-app nudges for MoUs ending within 30 days and ops tasks due within 48h. Dry run — add `--apply` to send |
| `node load/expire-terms.js` | **weekly**: expire ended leadership terms, notify holder + admins, add handover items. Dry run — add `--apply` to write |
| `node load/seed-founder.js --user-id <id>` | deliberate founder seat. Idempotent; founder seats never rotate |
| `npm run flag:verify` | current feature-flag state, including `tenant_rls_enforced` |
| `npm run rls:role` | generate/rotate the `loom_app` password (prints the URL once) |
| `npm run rls:verify` | **gate**: proves RLS actually enforces before/after enabling it |
| `node load/shoot.js [landing\|auth\|all] [--theme=...]` | Playwright screenshots to `.screenshots/` |
| `npm run db:wipe` / `db:wipe:full` | dev data reset (explicit `--confirm`) |

All `load/*.js` scripts read `DATABASE_URL` from the environment with a `.env.local` fallback (`load/env-local.js`); secrets are never hardcoded. Export `DATABASE_URL` explicitly in production shells.

### Retention

`github_events` (full raw webhook payloads), `audit_logs` and read `notifications`
previously grew without bound — nothing deleted them. `npm run prune:retention`
now handles all three with per-table windows: 90 days for raw payloads, 2 years
for the audit trail, 180 days for read notifications. **Unread notifications are
never pruned.**

It is a dry run unless `--apply` is passed. Schedule it daily alongside the
rollups:

```
0 3 * * *  cd /app && npm run prune:retention -- --apply
```

The same jobs are callable over the authenticated scheduler endpoint:

```
GET  /api/jobs/run                 # all jobs
GET  /api/jobs/run?job=analytics-rollup
Authorization: Bearer <CRON_SECRET>
```

Job names live in `lib/scheduler.js`: `deadline-reminders`,
`analytics-rollup`, `federation-rollup`, `retention-prune`, `term-expiry`.
With `CRON_SECRET` unset the endpoint returns 503; a wrong/missing secret
returns 401. There is still **no committed `vercel.json`**, so wire the calls
to your platform's scheduler (Vercel Cron, GitHub Actions, or an external
cron). The load scripts remain supported for manual/rehearsal runs.

### Deadline reminders

`mous.ends_on` and `event_ops_tasks.due_at` are only useful if someone is
warned. `node load/remind-deadlines.js` sweeps every tenant (owner connection)
and writes **in-app** notifications — there is no email provider wired up — to
the MoU owner (agreement ending within 30 days) and the task owner (due within
48 hours). It is idempotent: `mous.expiry_notified_at` and
`event_ops_tasks.reminded_at` mark each row after its one nudge, and both are
cleared when the date moves. Dry run by default; schedule it hourly:

```
0 * * * *  cd /app && node load/remind-deadlines.js --apply
```

### Leadership term expiry

Non-founder leadership is term-bound. Authority expires **at request time** the
moment `role_term_end` passes, so a missed job never leaves someone in power.
The job exists to notify people and put the handover on the checklist:

```
0 4 * * 1  cd /app && node load/expire-terms.js --apply
```

It is idempotent: `leadership_terms.status` moves `active → expired`, the
holder and admins get one notification, and the handover item is deduplicated
by title. Dry-run first after any bulk role change. `/admin/handover` also
lists every term ending in the next 45 days.

### Verified ranking

The leaderboard only ranks evidence a lead has verified. Until that is turned on
for a chapter, the board is honestly empty rather than showing provisional
points. The switch and the recompute are one idempotent script:

```
node load/enable-verified-ranking.js                  # dry run: show flag + current rows
node load/enable-verified-ranking.js --apply --tenant demo-college
```

It upserts `feature_flags(ranking_verified)`, calls
`public.recompute_ranking_scores(tenant)`, and writes an `audit_logs` row with
`actor_id = 'system'`. Re-running is safe. A zero-row recompute means the
chapter has no verified `ranking_events` yet — the board is live but empty, not
broken. Staff and admin accounts are never ranked (`isStaffExcluded`).

## 4. Deploy checklist

**Schema before code.** `/student/roadmap` and `/student/roadmap/[nodeId]` query
`public.roadmap_node_resources` (migration `036`). Deploying code before that
migration has been applied fails those routes with
`relation "roadmap_node_resources" does not exist` — it is not caught by the
build, because both routes are server-rendered on request. Apply and verify the
schema first, then promote the build.

1. Set env, run `db:migrate`, then `db:seed`, then `db:seed:roadmaps`. Set
   `SUPABASE_SERVICE_ROLE_KEY` and run `node load/setup-storage.js` (lead-tool
   file uploads need the private bucket); optionally `node load/seed-community.js`
   for curated OSS repos.
2. **Verify before deploying** (read-only, safe against production):
   `DATABASE_URL=... node load/verify-roadmap-shelf.js` — exits non-zero with
   the exact remedy if the table, the migration record, the mappings, or the
   application role's `SELECT` grant is missing.
3. Open `/setup`, claim first admin.
4. Configure GitHub webhook → `/api/github/webhook` with the secret.
5. Schedule the two rollups nightly, the deadline reminders hourly, and
   `node load/expire-terms.js --apply` weekly (cron/Vercel Cron/GitHub Actions).
6. `npm run build && npm start` behind HTTPS; set `NEXT_PUBLIC_APP_URL` to the public origin.

### 4b. Zen Mode is off by default

Zen Learning Mode (the distraction-free overlay for study resources) ships
**disabled**. It is a per-chapter `feature_flags` row, key `zen_mode`, read on
the server by `isZenModeEnabled()` (`lib/feature-flags.js`) and passed to the
client as a prop, so the server HTML and the hydrated tree always agree. With
no row — or any error reading it — it stays off.

**Development is the one exception:** under `next dev`,
`isZenModeEnabled()` returns true so the overlay is available locally without
writing the shared `zen_mode` row. Production is **hard-off** for now — the
persisted row is ignored there until the feature is cleared for real chapters.

Enable it per chapter at `/admin/flags`. While it is off, study resources are
ordinary links: external resources open natively in a new tab, and the overlay
never mounts by any path (the flag defaults to false in `ZenMode`,
`ZenResourceLink`, and `NodeStudyList`, so an unmounted or mis-wired call site
is inert).

**Turning Zen Mode off does not remove the need for migration 036.** Both
`/student/roadmap` and `/student/roadmap/[nodeId]` read
`roadmap_node_resources` to build each node's study shelf — that shelf is the
resource experience itself and is independent of the overlay. Apply
`db:migrate` and `db:seed:roadmaps` before deploying regardless of the flag.

### 4a. Vercel (no `vercel.json` in repo — framework auto-detection)

| Setting | Value | Notes |
|---------|-------|-------|
| Framework preset | Next.js (auto-detected) | builds `npm run build`, serves `next start` |
| Build command | `npm run build` | **must not** run migrations — see below |
| Install command | `npm install` | no `postinstall` hook exists, and none should be added |
| Node version | 20+ | matches local toolchain |

Environment variables come from the Vercel project's **Production / Preview /
Development** environment settings — never from `.env.local`, which is
gitignored and never uploaded. Required at runtime (and therefore must be set
before the first production deploy):

- `DATABASE_URL` — runtime server queries
- `DATABASE_APP_URL` — request-time connection as `loom_app` (`NOBYPASSRLS`).
  Strongly recommended; it falls back to `DATABASE_URL`, which runs as the
  table owner and therefore bypasses RLS entirely.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — auth
- `NEXT_PUBLIC_APP_URL` — metadata base, share/verify links
- `GITHUB_WEBHOOK_SECRET` (+ `CREDENTIAL_SECRET`) — ingestion HMAC
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_TOKEN_ENCRYPTION_KEY`
  — repository OAuth grant and repo picker (see `21-github-oauth-setup.md`)
- `SUPABASE_SERVICE_ROLE_KEY` — admin user APIs
- `DATABASE_URL_TARGET` / `DATABASE_URL_MUMBAI` — only if you use `db:migrate --target`

The build itself needs **no database access**: no route queries a database at
build time (the roadmap routes are `ƒ` dynamic), and no `load/*.js` script is
imported by application code.

**CI never points at a shared database.** `.github/workflows/ci.yml` runs a
read-only gitleaks secret scan, lint + encoding, unit tests, build, and a
**migration apply-twice** job against a disposable `postgres:16` service
container. That job creates the Supabase-compatible `anon`/`authenticated` roles
the base schema revokes from, applies every migration, applies them again, and
fails unless the second pass reports `0 applied`. It uses no app secrets and
never touches production.

E2E is deliberately **not** in per-PR CI: it needs real Auth0/Supabase
credentials and a seeded database. A nightly staging workflow is **not present
yet**; adding one requires a dedicated staging project first (see §4d). Do not
point a nightly workflow at production secrets.

Deliberately not automated: production migrations are not run by `postinstall`,
`prebuild`, or CI. Every preview deployment currently targets the same shared
database, so a build-time migration would apply production DDL from every
branch and preview. Run migrations as an explicit, human-invoked step against
the intended database before promoting a build, and confirm with `db:verify`.

## 4c. Migration rehearsal and rollback

Every migration is append-only, idempotent, and applied in one transaction by
`load/migrate.js`; a failed file rolls back completely and leaves no
`schema_migrations` row. Rehearse the same shape locally before merging:

```bash
# 1. Disposable Postgres (never a shared/production database).
docker run --rm -d --name loom-ci-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=loom_ci -p 55432:5432 postgres:16

# 2. The base schema revokes from Supabase's anon/authenticated roles, so create
#    them first (CI does the same in .github/workflows/ci.yml).
node -e "const p=require('postgres');const s=p('postgresql://postgres:postgres@localhost:55432/loom_ci',{max:1});(async()=>{await s`CREATE ROLE anon NOLOGIN`;await s`CREATE ROLE authenticated NOLOGIN`;await s.end()})()"

# 3. Apply twice. The second pass MUST print "0 applied".
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/loom_ci node load/migrate.js
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/loom_ci node load/migrate.js

# 4. Prove the ledger advanced exactly once.
node -e "const p=require('postgres');const s=p('postgresql://postgres:postgres@localhost:55432/loom_ci',{max:1});s`SELECT count(*)::int AS n FROM schema_migrations`.then(r=>{console.log(r[0].n);return s.end()})"
```

**Rollback is not `down.sql`.** This repo has no down migrations by design.
If a migration is wrong after it has been applied to a shared environment:

1. Do not edit the applied file and do not `DROP`/`ALTER` by hand.
2. Write a new, forward-only compensating migration (new number, idempotent)
   that restores the previous shape or data.
3. Rehearse it the same way, merge and apply it, then verify with `db:verify`
   and `/api/health`.
4. If the damage is application-level, revert the code commit
   (`git revert <sha>`) before forward-fixing.

A database restore is the emergency path, not the normal path: see the restore
drill in §4d.

## 4d. External / human-only actions (not performed here)

These need production credentials, paid resources, or a human decision. They are
**not done**; the exact steps are recorded so the next operator can execute
them.

**Branch protection** (requires repo admin; `gh` is already authenticated):

```bash
cat > /tmp/loom-protection.json <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["Lint + encoding", "Unit tests", "Build", "Migrations (apply twice)"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "require_code_owner_reviews": true },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
gh api -X PUT repos/L-OO-M/LOOM/branches/main/protection --input /tmp/loom-protection.json
```

There is **no** `.github/CODEOWNERS` in this repository. Creating one requires a
verified owner/team handle; a guessed handle would silently fail to request the
right review. Add it only after confirming the organisation handle, then enable
**Require review from Code Owners**.

**Nightly E2E staging.** Create a separate Supabase project (do not reuse the
production project). Set repository **variables** `E2E_STAGING_ENABLED=true` and
**secrets** `E2E_STAGING_DATABASE_URL`, `E2E_STAGING_DATABASE_APP_URL`,
`E2E_STAGING_NEXT_PUBLIC_SUPABASE_URL`,
`E2E_STAGING_NEXT_PUBLIC_SUPABASE_ANON_KEY`, `E2E_STAGING_AUTH0_DOMAIN`,
`E2E_STAGING_AUTH0_CLIENT_ID`, `E2E_STAGING_AUTH0_CLIENT_SECRET`,
`E2E_STAGING_AUTH0_SECRET`, `E2E_LOGIN_EMAIL`, `E2E_LOGIN_PASSWORD`. The workflow
must be added in the same change that enables the variables.

**Preview database sharing.** Today every Vercel preview targets the shared
database. To stop that: create a second Supabase project, set its pooler strings
as **Preview**-scope `DATABASE_URL` / `DATABASE_APP_URL` (leave Production
untouched), apply migrations once, then confirm `/api/health` on a preview
deployment points at the preview project. This is a human decision because it
creates a paid resource.

**Secret rotation** (requires dashboard access; do not paste values into logs):

1. Supabase → Project Settings → Database → Reset database password. Update both
   `DATABASE_URL` and `DATABASE_APP_URL` in Vercel (migrations/seeds use
   `DATABASE_URL`; request handling uses `DATABASE_APP_URL`), redeploy.
2. Auth0 → Applications → the M2M app → Rotate secret. Update
   `AUTH0_MANAGEMENT_CLIENT_SECRET`, redeploy.
3. Rotating `GITHUB_TOKEN_ENCRYPTION_KEY` **orphans every sealed GitHub token**;
   plan a re-link window and a user-facing message before doing it.
4. Rotating `CREDENTIAL_SECRET` invalidates existing credential share links and
   in-flight OAuth state; announce before rotating.
5. Record the rotation date and operator in the ops log (not in this repo).

**Restore drill** (Supabase PITR/backups must be enabled):

1. Create a scratch Supabase project.
2. Restore the production backup into it (Supabase Dashboard → Database →
   Backups, or `pg_restore` from the downloaded dump).
3. Point a local shell at the scratch project and run
   `node load/verify-roadmap-shelf.js`, `node load/verify-rls.js`, and a read of
   `/api/health`.
4. Record restore duration and any missing grants (the `loom_app` role and its
   default privileges are part of the schema; a partial restore can drop them).
5. Delete the scratch project after the drill.

**Legal decisions.** The public legal pages no longer contain bracketed
placeholders; they read operator/contact/retention/governing-law values from
`lib/legal.js`. Set `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_NAME`,
`LEGAL_CONTACT_EMAIL`, `LEGAL_RETENTION_PERIOD`, `LEGAL_GOVERNING_LAW`,
`LEGAL_LIABILITY_CAP`, and `LEGAL_PUBLISHED_DATE` at deploy time. The defaults
are honest but generic; the chapter still needs to confirm the legal details.

## 5. Runbook

| Symptom | Cause → fix |
|---------|-------------|
| Unstyled page / CSS 404 in dev | Stale `.next` (often after a build with dev running) → stop dev, `Remove-Item .next`, restart |
| Port 3000 in use | Stale `next dev` → kill owner PID, restart |
| Webhook 401 | Wrong/missing secret or headers → check `x-hub-signature-256`, event, delivery id |
| OSS merge not auto-verified | Repo not curated, or author's GitHub username not linked, or PR target outside tracked `owner/repo` |
| Insights/Data stale | Rollups not scheduled → run scripts manually, then schedule |
| E2E `webServer` timeout | Port busy → free 3000 first |
| `SUPABASE_SERVICE_ROLE_KEY` empty | Admin user APIs limited — set the key, restart |
| `relation "roadmap_node_resources" does not exist` | Deployed before migration 036 → `node load/migrate.js` against that database, then `node load/seed-node-resources.js`, then `npm run db:verify` |
| `permission denied for table roadmap_node_resources` | App role lacks the grant (database predates migration 030 defaults) → as owner: `GRANT SELECT ON public.roadmap_node_resources TO loom_app;` |

## 6. Known limits

- Rate limits are in-memory per instance — use a gateway limiter for multi-instance prod.
- Reputation, federation totals, and analytics are eventually consistent (nightly).
- Email sending is not wired — invites/notifications are in-app only until an SMTP provider is added.
- **Uploads have no antivirus scan.** File type is limited to a PDF/OFFICE/image/text/CSV/ZIP allowlist and capped at 25 MB (`lib/media.js`), and buckets are private with short-lived signed URLs, but a malicious file inside an allowed type is not detected. Add scanning before accepting untrusted public uploads.
- Never run builds and dev on the same checkout simultaneously (see CSS row above).

- Serve production only over HTTPS with forced SSL/HSTS at the host (Vercel/AWS/Netlify project setting) — the app builds absolute canonical/OG URLs from NEXT_PUBLIC_APP_URL.

