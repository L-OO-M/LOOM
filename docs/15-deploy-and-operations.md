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
| `QSTASH_TOKEN`, `UPSTASH_REDIS_REST_*` | for job queue | GitHub aggregation worker |
| `R2_*` | for uploads | S3-compatible storage |
| `SENTRY_DSN` | no | Error tracking |

## 3. Scripts

| Command | Does |
|---------|------|
| `npm run dev` | local server `:3000` |
| `npm run lint` / `npm run test` / `npm run test:e2e` | eslint / vitest / playwright |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:migrate` | `node load/migrate.js` — tracked, idempotent |
| `npm run db:seed` | control-plane + roadmap/resources content |
| `node load/seed-community.js` | curated OSS repos (live GitHub data) + demo chapter card |
| `node load/rollup-federation.js` | **nightly**: chapter stats + federation row |
| `node load/rollup-analytics.js` | **nightly**: snapshots, cohorts, funnels, mentor stats |
| `node load/shoot.js [landing\|auth\|all] [--theme=...]` | Playwright screenshots to `.screenshots/` |
| `npm run db:wipe` / `db:wipe:full` | dev data reset (explicit `--confirm`) |

Seed scripts embed the dev `DATABASE_URL` fallback; prefer exporting `DATABASE_URL` explicitly.

## 4. Deploy checklist

1. Set env, run `db:migrate`, then `db:seed` (+ `seed-community.js`).
2. Open `/setup`, claim first admin.
3. Configure GitHub webhook → `/api/github/webhook` with the secret.
4. Schedule the two rollups nightly (cron/Vercel Cron/GitHub Actions).
5. `npm run build && npm start` behind HTTPS; set `NEXT_PUBLIC_APP_URL` to the public origin.

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

## 6. Known limits

- Rate limits are in-memory per instance — use a gateway limiter for multi-instance prod.
- Reputation, federation totals, and analytics are eventually consistent (nightly).
- Email sending is not wired — invites/notifications are in-app only until an SMTP provider is added.
- Never run builds and dev on the same checkout simultaneously (see CSS row above).
