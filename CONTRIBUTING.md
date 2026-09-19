# Contributing to L.O.O.M.

Read `AGENTS.md` before touching code — it is the binding playbook.
This file is the short contributor path; `AGENTS.md` wins on conflicts.

## Setup

```bash
npm install
node load/migrate.js   # needs DATABASE_URL in .env.local (see .env.example)
npm run dev            # http://localhost:3000
```

First admin: `/register` → `/login` → `/setup` → **Claim admin**
(works only while no platform admin exists).

## Iron rules (from AGENTS.md)

1. **JavaScript/JSX only.** No TypeScript.
2. **Tenant isolation:** tenant comes server-side from `profiles.tenant_id`. Never accept `tenant_id` from client input.
3. **Mutations:** session → membership → `can()` (`lib/permissions.js`) → zod → `{ ok, data | error }` envelope → `writeAudit()`.
4. **Roles are granted, never self-selected.** No role picker, no self role edits.
5. **Pooler:** `lib/db.js` stays `{ max:10, idle_timeout:10, prepare:false }`. Page queries sequential, never `Promise.all`. Every `<Link>` keeps `prefetch={false}`.
6. **Migrations append-only:** new file `load/migrations/0NN_name.sql`, idempotent, then `node load/migrate.js`.
7. **Zero mock data in UI.** Real rows or honest empty states.
8. **No secrets** in code, docs, or logs. `.env.local` is untracked.
9. **One concern per commit.** No drive-by reformats or dep upgrades inside a fix.

## Where things live

- Routes: `app/(app)/{student,lead,admin}/…`, public: `app/{about,faq,events,domains}/`, auth: `app/(auth)/`.
- One-route components stay in that route's `_components/`. Shared primitives only in `components/{loom,landing,motion,seo}/` or root shared files.
- Navigation: `lib/nav.js`. Theme: `lib/theme.js`. SEO: `lib/seo.js`.

## Mandatory gates (run all, in order)

```bash
git status --porcelain
npm run lint
npm test
npm run build
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
npx playwright test
```

Lint must be 0 errors. If a gate fails, fix the cause and re-run that gate
and every gate after it. Never edit tests to match broken code.

## Pull requests

- Message style: `Area: what changed`.
- Keep `git status` clean of strays; never stage `.env.local`, `*.log`, screenshots.
- Paste gate outputs in the PR (see template).
- UI changes: spot-check desktop + mobile, dark + light theme.
