# Deploy & Operations

## 1. Requirements

Node 20+, a Supabase project (Postgres + Auth), `DATABASE_URL` pooler string.

## 2. Environment

| Var | Required | Purpose |
|-----|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Auth + client |
| `DATABASE_URL` | yes | Migrations, seeds, rollups, server queries. Must be the **owner** (`postgres.<project-ref>`) — the app also uses it for unauthenticated public reads |
| `DATABASE_APP_URL` | yes | Request handling as `loom_app` (NOBYPASSRLS, not the table owner). **Falls back to `DATABASE_URL` if unset**, which silently disables Row Level Security — `npm run rls:verify` will fail loudly. See `rls-rollout-runbook.md` |
| `SUPABASE_SERVICE_ROLE_KEY` | for admin APIs + storage | Currently empty in dev — admin user management limited until set. Also required server-side by `lib/storage.js` (lead-tool file uploads) |
| `SUPABASE_STORAGE_BUCKET` | no (default `loom-files`) | Private bucket for lead-tool documents/assets. Create it and seed categories with `node load/setup-storage.js` |
| `NEXT_PUBLIC_APP_URL` | yes | metadataBase, share/verify links, calendar links. Unset in production publishes every absolute URL as `localhost` |
| `DEFAULT_TENANT_SLUG` | no (defaults to `DEV_TENANT_SLUG`) | Chapter that owns a server-to-server delivery (webhook) that carries no chapter identity in its `Host` header |
| `DEV_TENANT_SLUG` | no (default `demo-college`) | Fallback tenant for first-visit profiles |
| `DEV_TENANT_DOMAIN` | no (default `localhost`) | Host treated as the local dev tenant |
| `GITHUB_WEBHOOK_SECRET` | yes | Webhook HMAC; also fallback signing secret. **Production rejects placeholder values** (`dev-secret`, `hello`, …) and anything under 16 chars |
| `CREDENTIAL_SECRET` | no | Credential HMAC (falls back to webhook secret) |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | no | Search Console ownership meta tag, emitted once in `app/layout.jsx` |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` / `AUTH0_SECRET` | yes | **Auth0 login front door.** `AUTH0_SECRET` encrypts the session cookie (≥32 chars). Read only by `@auth0/nextjs-auth0` (via `lib/auth0.js`); **never** `NEXT_PUBLIC_`. Production boot rejects a missing or placeholder/short `AUTH0_SECRET` |
| `APP_BASE_URL` | no (recommended in prod) | Origin the SDK uses to build `/auth/callback` and logout URLs. Unset locally so the SDK infers it from the `Host` header (dev `localhost:3000` **and** Playwright `127.0.0.1:3000` both work). Set per deploy to the exact registered origin — **no `:443` suffix**. Every origin must be in the Auth0 app's Allowed Callback / Logout / Web Origins lists |

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

> **Placeholder secrets are rejected at boot.** `lib/env.js` compares by *value*,
> not just presence. A deploy carrying `GITHUB_WEBHOOK_SECRET=dev-secret` — the value
> shipped in `.env.example` — used to pass validation while accepting a publicly
> known HMAC key. It now throws.

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

## 3. Scripts

| Command | Does |
|---------|------|
| `npm run dev` | local server `:3000` |
| `npm run lint` / `npm run test` / `npm run test:e2e` | eslint / vitest / playwright |
| `npm run build` / `npm start` | production build / serve |
| `npm run db:migrate` | `node load/migrate.js` — tracked, idempotent |
| `node load/setup-storage.js` | **once per env**: create the private `loom-files` bucket + seed asset categories (idempotent) |
| `npm run db:seed` | control-plane + roadmap/resources content |
| `node load/seed-community.js` | curated OSS repos (live GitHub data) + demo chapter card |
| `npm run rollup:federation` | **nightly**: chapter stats + federation row |
| `npm run rollup:analytics` | **nightly**: snapshots, cohorts, funnels, mentor stats |
| `npm run prune:retention` | **daily**: report rows past their retention window. Dry run — add `-- --apply` to delete |
| `node load/remind-deadlines.js` | **hourly**: in-app nudges for MoUs ending within 30 days and ops tasks due within 48h. Dry run — add `--apply` to send |
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

> The rollups and the prune are still **manual or externally scheduled** — there
> is no in-repo scheduler and no `vercel.json`. Wire them to whatever your
> platform provides.

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

## 4. Deploy checklist

1. Set env, run `db:migrate`, then `db:seed` (+ `seed-community.js`). Set `SUPABASE_SERVICE_ROLE_KEY` and run `node load/setup-storage.js` (lead-tool file uploads need the bucket).
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
- **Uploads have no antivirus scan.** File type is limited to a PDF/OFFICE/image/text/CSV/ZIP allowlist and capped at 25 MB (`lib/media.js`), and buckets are private with short-lived signed URLs, but a malicious file inside an allowed type is not detected. Add scanning before accepting untrusted public uploads.
- Never run builds and dev on the same checkout simultaneously (see CSS row above).

- Serve production only over HTTPS with forced SSL/HSTS at the host (Vercel/AWS/Netlify project setting) — the app builds absolute canonical/OG URLs from NEXT_PUBLIC_APP_URL.

