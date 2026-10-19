# Deploy & Operations

## 1. Requirements

Node 20+, a Supabase project (Postgres + Auth), `DATABASE_URL` pooler string.

## 2. Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Auth + client |
| `DATABASE_URL` | yes | Migrations, seeds, rollups, server queries |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin APIs | Currently empty in dev — admin user management limited until set |
| `NEXT_PUBLIC_APP_URL` | yes | metadataBase, share/verify links, calendar links |
| `DEV_TENANT_SLUG` | no (default `demo-college`) | Fallback tenant for first-visit profiles |
| `GITHUB_WEBHOOK_SECRET` | yes | Webhook HMAC; also fallback signing secret |
| `CREDENTIAL_SECRET` | no | Credential HMAC (falls back to webhook secret) |
| `QSTASH_TOKEN`, `UPSTASH_REDIS_REST_*` | reserved (unused) | No queue/cache integration in use — webhook processes inline, rate limits are in-memory |
| `R2_*` | reserved (unused) | No object-storage integration in use |
| `SENTRY_DSN` | reserved (unused) | SDK not installed; errors surface via logs + `app/error.jsx` |

## 3. Scripts

| Command | Does |
|---------|------|
| `npm run dev` | local server `:3000` |
| `npm run lint` / `npm run test` / `npm run test:e2e` | eslint / vitest / playwright |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:migrate` | `node load/migrate.js` — tracked, idempotent, one transaction per file, advisory-locked |
| `npm run db:seed` | control-plane + roadmap/resources content |
| `npm run db:seed:roadmaps` | canonical roadmap graph (`seed-roadmaps.js`) + per-node resource shelves (`seed-node-resources.js`) |
| `npm run db:verify` | `node load/verify-roadmap-shelf.js` — READ-ONLY preflight: schema, migration record, mapping count, orphans/duplicates, app-role SELECT |
| `node load/seed-community.js` | curated OSS repos (live GitHub data) + demo chapter card |
| `node load/rollup-federation.js` | **nightly**: chapter stats + federation row |
| `node load/rollup-analytics.js` | **nightly**: snapshots, cohorts, funnels, mentor stats |
| `node load/shoot.js [landing\|auth\|all] [--theme=...]` | Playwright screenshots to `.screenshots/` |
| `npm run db:wipe` / `db:wipe:full` | dev data reset (explicit `--confirm`) |

All `load/*.js` scripts read `DATABASE_URL` from the environment with a `.env.local` fallback (`load/env-local.js`); secrets are never hardcoded. Export `DATABASE_URL` explicitly in production shells.

## 4. Deploy checklist

**Schema before code.** `/student/roadmap` and `/student/roadmap/[nodeId]` query
`public.roadmap_node_resources` (migration `036`). Deploying code before that
migration has been applied fails those routes with
`relation "roadmap_node_resources" does not exist` — it is not caught by the
build, because both routes are server-rendered on request. Apply and verify the
schema first, then promote the build.

1. Set env, run `db:migrate`, then `db:seed`, then `db:seed:roadmaps`.
2. **Verify before deploying** (read-only, safe against production):
   `DATABASE_URL=... node load/verify-roadmap-shelf.js` — exits non-zero with
   the exact remedy if the table, the migration record, the mappings, or the
   application role's `SELECT` grant is missing.
3. Open `/setup`, claim first admin.
4. Configure GitHub webhook → `/api/github/webhook` with the secret.
5. Schedule the two rollups nightly (cron/Vercel Cron/GitHub Actions).
6. `npm run build && npm start` behind HTTPS; set `NEXT_PUBLIC_APP_URL` to the public origin.

### 4b. Zen Mode is off by default

Zen Learning Mode (the distraction-free overlay for study resources) ships
**disabled**. It is a per-chapter `feature_flags` row, key `zen_mode`, read on
the server by `isZenModeEnabled()` (`lib/feature-flags.js`) and passed to the
client as a prop, so the server HTML and the hydrated tree always agree. With
no row — or any error reading it — it stays off.

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
- `SUPABASE_SERVICE_ROLE_KEY` — admin user APIs
- `DATABASE_URL_TARGET` / `DATABASE_URL_MUMBAI` — only if you use `db:migrate --target`

The build itself needs **no database access**: no route queries a database at
build time (the roadmap routes are `ƒ` dynamic), and no `load/*.js` script is
imported by application code.

**Deliberately not automated:** migrations are not run by `postinstall`,
`prebuild`, or any CI workflow (this repository has no `.github/workflows`).
Every preview deployment targets the same shared database, so a build-time
migration would apply production DDL from every branch and every preview. Run
migrations as an explicit, human-invoked step against the intended database
before promoting a build, and confirm with `db:verify`.

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
- Never run builds and dev on the same checkout simultaneously (see CSS row above).

- Serve production only over HTTPS with forced SSL/HSTS at the host (Vercel/AWS/Netlify project setting) � the app builds absolute canonical/OG URLs from NEXT_PUBLIC_APP_URL.

