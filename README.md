# L.O.O.M.

L.O.O.M. is a multi-tenant developer-growth platform for colleges. It helps students see their learning path, connect GitHub activity to progress, find resources, join contests, and receive mentorship while admins manage roadmaps, analytics, and institutional settings.

The project follows a documentation-first rule: product and architecture docs define the contracts before implementation expands them.

## Current Status

This repository contains:

- A complete documentation spine in `docs/`
- A JavaScript Next.js App Router app with Supabase Auth (single `/login` for students and admins, role-based)
- URL-addressable student workspace: dashboard, onboarding, roadmap list/detail, resources list/detail, projects (list/new/detail), GitHub, contests (list/detail + register/submit), mentorship, leaderboard, notifications, settings
- URL-addressable admin workspace: overview, students (+detail/role), roadmaps, resources, projects, contests, mentors, feature flags, audit, settings
- Tracked SQL migrations in `load/migrations/` applied via `node load/migrate.js`
- Server-side auth library (`lib/auth-server.js`): session → profile → tenant → role, audit + notification helpers
- Tenant resolution, API envelopes, RBAC helpers, Drizzle schemas, classification, recommendation, and GitHub webhook processing contracts
- Vitest (8 tests) and Playwright (84 specs: route protection + API authorization) coverage

## Prerequisites

- Node.js 20+
- A Supabase project (already configured)
- The `.env.local` file with your Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL` pooler string)

## Local Setup

```bash
npm install
node load/migrate.js   # Apply tracked migrations (needs DATABASE_URL in env)
npm run dev            # Start the Next.js dev server
```

Then open `http://localhost:3000`.

### First-time setup

1. Visit `/register` to create your Supabase Auth account
2. Sign in at `/login`, then visit `/setup` and click **Claim admin** (works only while no platform admin exists)
3. Admins manage students/content at `/admin/*`; students work at `/student/*`

## Database

All tables live in a single Supabase Postgres instance. Schema changes are **tracked migrations**, not manual ALTERs:

```bash
node load/migrate.js   # Applies load/migrations/*.sql in order, records in schema_migrations
```

Drizzle schemas in `db/` are the source of truth for new tables; add a migration file alongside every schema change.

Seed scripts in `load/` (all dev-only, refuse production):
- `load/seed-control-plane.js` — tenant, feature flags
- `load/seed-content.js` — roadmap nodes, resources
- `load/seed-dev.js` — dummy students, mentor, progress, GitHub activity, projects, contests, sessions, notifications (`npm run db:seed:dev`, idempotent via `seed-*` cleanup)
- `node load/wipe-dev.js --confirm` — removes seed rows only, preserves tenants/flags/real users (`npm run db:wipe`)
- `node load/wipe-dev.js --confirm --full` — truncates all data tables, keeps schema + `schema_migrations` (`npm run db:wipe:full`, then re-run `db:seed`)
- `load/seed-profiles.js` — legacy helper (prefer `/setup` + `/student/onboarding` flows)
- `load/shoot.js` — Playwright screenshot loop (`landing|auth|all`) into `.screenshots/` (gitignored)

## Auth model

- Middleware (`middleware.js`) enforces sessions: pages redirect to `/login?redirect=…`, `/api/*` returns machine-readable `401 { ok:false }` (GitHub webhook stays public, HMAC-verified).
- `app/(app)/student/layout.jsx` requires a session + profile (auto-created on first visit, tenant backfilled).
- `app/(app)/admin/layout.jsx` requires `profiles.role = 'admin'` (or `platform_admins` membership); students are redirected to `/student`.
- Tenant is always derived server-side from `profiles.tenant_id` — never from client input.

## Useful Commands

```bash
npm run lint          # ESLint
npm run test          # Vitest unit tests
npm run build         # Production build
npx playwright test   # Playwright E2E (needs `npx playwright install chromium` once)
npm run dev           # Development server
```

## Architecture

```
Student → Supabase Auth → middleware → student layout → Next.js App → Supabase Postgres
Admin   → Supabase Auth → middleware → admin layout (role check) → Next.js App → Supabase Postgres
GitHub  → Webhook (HMAC) → Route Handler → github_events → student_daily_activity
```

## Documentation

Start here:
- `docs/00-product-brief.md`
- `docs/01-system-architecture.md`
- `docs/02-tenant-and-security-model.md`
- `docs/08-build-phases.md`

## Design Principle

L.O.O.M. should feel computationally simple even when the product is sophisticated. Students see progress, next step, action, and feedback. Admins see data, pattern, decision, and action. Infrastructure sees event, queue, aggregate, and cache.
