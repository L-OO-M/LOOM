# AGENTS.md — AI/colleague playbook for L.O.O.M.

> **Who this is for:** any colleague (human or AI-assisted) who will audit, restyle, or extend pages. **Read this whole file before touching code.** Its only job: let you improve any tab/page/button **without breaking the rest of the site**, and prove it before you push.
>
> Project knowledge lives in `HANDOFF.md`. API/table truth lives in `docs/13-api-reference.md` and `docs/14-database-reference.md`. This file is the *rules of engagement*.

---

## 1. Iron rules — break these and the site breaks

1. **JavaScript/JSX only.** No TypeScript, no new file extensions. The toolchain assumes JS.
2. **Tenant isolation is sacred.** Tenant always comes server-side from `profiles.tenant_id` (`lib/auth-server.js`). Never accept `tenant_id` from client input, params, or body. Every new query filters on it.
3. **AuthZ on every mutation:** session → membership → `can()` check from `lib/permissions.js` → zod validation → standard `{ ok, data | error }` envelope → `writeAudit()` (+ `notify()` where a human waits). Copy the pattern from any sibling route; never invent a new one.
4. **Roles are upward-only, granted never self-selected.** `student → core → dept_lead → vertical_lead → admin → platform_admin`. No role picker in UI. No one edits their own role.
5. **Pooler rules:** `lib/db.js` stays `{ max:10, idle_timeout:10, prepare:false }`. Page queries stay **sequential**, never `Promise.all` batches. Every app `<Link>` keeps `prefetch={false}`.
6. **Migrations are append-only.** New tables/changes = new file `load/migrations/0NN_name.sql`, fully idempotent (`IF NOT EXISTS`). Never edit an applied migration, never ALTER by hand. Run `node load/migrate.js` after adding one.
7. **Zero mock data in UI.** Real Supabase rows or honest empty states. Never hardcode stats, people, or activity.
8. **No secrets in code, docs, or logs.** `load/env-local.js` is the only way scripts get `DATABASE_URL`. `.env.local` is untracked — never commit it.
9. **Public SEO contract:** public pages keep exactly one `<h1>`, a real description, and an absolute canonical (`lib/seo.js`). Private areas (`/student`, `/admin`, `/lead`, `(auth)`, `/setup`) keep `noindex, nofollow`. Don't remove `sitemap.js`/`robots.js`/JSON-LD.
10. **One concern per change.** UI restyle, bug fix, and new feature are three separate commits. Unrelated renames, reformats, and dep upgrades are forbidden inside a fix.

---

## 2. Where things live (so you don't scatter files)

- Route UI: `app/(app)/{student,lead,admin}/…`, public: `app/{about,faq,events,domains}/`, auth: `app/(auth)/`.
- A component used by **one route only** lives in that route's `_components/` (or as a co-located `*Bits.jsx` / `*Client.jsx`). Shared primitives only in `components/{loom,landing,motion,seo}/` or the root shared files (`ui.jsx`, `actions.jsx`, `admin-forms.jsx`, `AppShell.jsx`, `BrandMark.jsx`).
- Single source of navigation: `lib/nav.js`. Theming: CSS vars + `lib/theme.js` (`loom-theme` key). Canonical/SEO helpers: `lib/seo.js`.
- If you create a file, its importer list must be ≤ the feature that owns it. New shared component? Justify why it can't live in `_components/`.

---

## 3. Page-by-page audit procedure (the thorough pass)

Work **one route group at a time**, in this order: public pages → `(auth)` → `/student` → `/lead` → `/admin`. For **every page**, check all of:

1. **Render:** loads with no console errors, in dark AND light theme, at 1440px AND 390px widths.
2. **Every button/link/form:** click each one. Confirm it does the real action (network tab shows the right API call), shows loading → success/error feedback, and never dead-ends. File downloads must stay raw `<a href="/api/…">`, never `<Link>`.
3. **Empty states:** with no data, the page must show an honest sentence ("No workshops scheduled yet"), never a blank hole or fake numbers. Test by pointing at a fresh tenant state or reasoning from the query.
4. **Error paths:** force a failure (bad input, unauthenticated fetch) — user sees a clear message, never a stack trace or silent nothing. Global boundaries exist (`error.jsx`, `(app)/error.jsx`, `not-found.jsx`) — don't bypass them.
5. **AuthZ:** logged-out → redirected to `/login` (pages) or machine `401` (APIs). Wrong role → bounced to the right home (`/student` vs `/lead` vs `/admin`). Test each new/changed route both ways.
6. **Headings/SEO (public pages only):** exactly one `<h1>`, no skipped levels, canonical + description present (covered by `e2e/public.spec.js` — extend it when you add a public page).
7. **No collateral:** `git status` shows only files for this page's concern. Run the affected route's E2E plus neighbours before moving on.

Log every found issue as: *page → element → expected vs actual → fix → test that proves it*. Fix root causes (wrong query, missing check, bad state), not symptoms (hiding the button).

---

## 4. Safe UI/UX upgrade workflow

1. Reuse first: `components/ui.jsx` (`PageHeader, Card, Stat, EmptyState, Field, inputStyle`), `components/loom/*` (primitives, `StatTile/TileGrid`, `States`), theme vars (`--bg, --text, --accent, --line, …`). New visual language must work in **both themes** — hardcode no colors.
2. Motion: `motion/react` for app UI, GSAP only for public storytelling. Respect `prefers-reduced-motion` (see `components/motion/`).
3. No new npm dependency to save trivial code. If you must add one: it must be imported somewhere real, `package-lock.json` updates in the same commit, and `npm run build` still passes.
4. Keep server components server. Only add `"use client"` to the smallest leaf that needs interactivity. Never convert a page to client just for styling.
5. Mobile is not optional: every changed page gets checked at 390px (Playwright `mobile` project covers regressions; eyeball the rest).

---

## 5. MANDATORY pre-commit gates — run all, in order, no skipping

> A commit that hasn't passed every gate does not exist. "It worked on my machine" is not evidence — pasted command output is.

```bash
# 0. Clean stage: only intended files. Secrets never staged.
git status --porcelain

# 1. Lint — must show 0 errors (2 pre-existing warnings are the ceiling; add none).
npm run lint

# 2. Unit — all must pass (currently 46 across 10 files).
npm test

# 3. Build — must compile clean (catches bad imports, bad metadata, bad JSX).
npm run build

# 4. E2E — FULL suite, currently 160 passed (80 specs × chromium + mobile).
#    Free port 3000 first; first run pays ~2 min cold compile — wait, don't assume failure.
Stop-Process -Name node -Force -ErrorAction SilentlyContinue
npx playwright test
```

**Targeted runs while iterating** (then still run the FULL suite once before committing):

```bash
npx vitest run tests/<name>.test.js
npx playwright test e2e/public.spec.js        # public + SEO surfaces
npx playwright test e2e/app.spec.js           # route protection + API authZ
node load/verify-gate.js status               # only when touching GitHub ingestion
```

**If a gate fails:** fix the cause, re-run that gate AND every gate after it (a lint fix can break the build; a code fix can break E2E). If the failure is environmental (port busy, stale `.next`, cold-compile timeout): resolve it (kill node / delete `.next` / rerun), never edit tests to match broken code. If you must change a test, the test was wrong — say so in the commit message.

**Manual spot-checks for UI changes** (screenshot or it didn't happen): changed page at desktop + mobile, both themes; `.screenshots/` is gitignored scratch space — use `node load/shoot.js` if handy.

---

## 6. Commit & push rules

- Message style: `Area: what changed` (e.g. `Student roadmap: fix …`, `SEO: …`, `Docs: …`). One concern per commit.
- Pre-push checklist: `git status` clean of strays · all 4 gates green in THIS session (not "earlier today") · no `.env.local`, `*.log`, or screenshots staged · migrations (if any) applied via `node load/migrate.js` and docs `13/14/17` updated to match.
- Push to `main` only when the checklist is fully ticked. If blocked (env, credentials, prod risk): stop, commit nothing half-done, and write the exact blocker + the exact command the next person should run.
- After push: report objective, files changed, gates with output, and anything deliberately left undone.

---

## 7. Emergency brake

If the site breaks after your change: `git log --oneline -5` → `git revert <your-commit>` → push the revert → then debug on a clean tree. Reverting is always preferable to hot-patching forward. Production-impacting, destructive, auth/security-boundary, or paid-resource actions: stop and ask a human first.
