# LOOM — Colleague Handoff

> **Read this first.** Everything a new maintainer needs: what the project is, how to run it, how it is built, what is done, and — in detail — what work remains. Verified state at this handoff: `lint` 0 errors · `build` clean · `vitest` 1099/1099 (129 files) · Playwright 417 passed, 6 skipped (chromium + mobile, production build).

---

## 1. What this project is

**LOOM** (Learn · Build · Prove · Connect — plus Discover) is a learning operating system for college developer communities. One Next.js app serves:

- A **public site** (landing, About, FAQ, Events, Domains) that recruits students,
- A **student workspace** (`/student`) with roadmaps, resources, projects, GitHub proof, contests, mentorship, community, credentials, and social discovery,
- A **lead console** (`/lead`) for department Heads/Co-Heads and Vertical Leads,
- An **admin workspace** (`/admin`) for chapter operations: roster, content, programs, finance, reports, handover, flags, audit.

The guiding rule, from the society core: an **ecosystem, not an event organizer**. The generational loop is *Students Learn → Students Build → Students Mentor → Students Contribute*. Pillars: Accessibility, Readiness, Excellence, Network.

**Stack (all verified in `package.json`):** Next.js 15 App Router, **JavaScript/JSX only (no TypeScript by decision)**, React 19, Tailwind CSS 4, Auth0 as the login front door (`@auth0/nextjs-auth0`), Supabase Auth as the legacy/E2E fallback, single shared Supabase Postgres via the `:6543` pooler, `postgres` + raw parameterized SQL (no ORM — the old Drizzle mirror was deleted), zod, `motion` + GSAP (landing only), `next/font` (Geist + Fraunces). Runtime deps are exactly 15 — anything else was uninstalled as unused.

---

## 2. Access & credentials you need on day one

| Need | Where / how | Status |
|---|---|---|
| Supabase project | `https://gbkpocjtcnozihvacmtg.supabase.co` | Active, shared DB |
| `.env.local` | Copy `.env.example`; fill `DATABASE_URL` (pooler `:6543` string), Supabase anon key | Each dev makes their own (untracked) |
| DB password | Ask the current owner; see **§9 urgent item — it must be rotated** | ⚠️ Rotate immediately |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → paste into `.env.local` | ⬜ Empty — admin user APIs limited until set |
| GitHub webhook secret | `GITHUB_WEBHOOK_SECRET` in env + repo/org webhook settings | ⬜ Only needed when enabling ingestion (§9) |
| Vercel/hosting + domain | For production; set `NEXT_PUBLIC_APP_URL` to the public origin | ⬜ Not yet deployed |
| Google Search Console | Domain `lets-loom.xyz`; verification token committed both as a meta tag (`app/layout.jsx`) and `public/google<token>.html` | ✅ Configured — no env var needed |

---

## 3. Run it (5 minutes)

```bash
npm install
node load/migrate.js        # tracked migrations, idempotent (needs DATABASE_URL in env or .env.local)
npm run db:status           # read-only: does this DB prove it has every migration? (exit 1 = not ready)
npm run db:seed             # control-plane (MSIT tenant, flags) + roadmap/resources content
node load/seed-departments.js
node load/seed-faq.js
npm run dev                 # http://localhost:3000
```

First admin: register at `/register` → sign in at `/login` → open `/setup` → **Claim admin** (works only while no platform admin exists). Never run `npm run db:seed:dev` against the shared DB — it is local-only dummy data and refuses production.

**Daily commands:** `npm run lint` (must be 0 errors) · `npm test` (vitest) · `npm run build` · `npx playwright test` (needs port 3000 free; first run pays ~2 min cold compile). Kill stray dev servers before judging a failure (`Stop-Process -Name node` on Windows). Never run `build` and `dev` on the same checkout simultaneously (stale `.next` causes unstyled pages — delete `.next` and restart).

---

## 4. How the code is organized

```
app/
  page.jsx, layout.jsx            # landing (client) + root metadata/OG/JSON-LD
  sitemap.js, robots.js           # SEO crawl surfaces
  about/ faq/ events/ domains/    # public server pages, each with metadata + canonical
  (auth)/ login/ register/        # client pages + _components/AuthShell.jsx + noindex layout
  (app)/ student/ lead/ admin/    # private workspaces (noindex layouts), each page's
                                  #   one-off components co-located in _components/ or *Bits.jsx
  api/                            # ~80 route handlers; envelopes { ok, data | error }
  setup/ verify/ auth/            # claim-first, credential verify, supabase + Auth0 callbacks
  error.jsx, not-found.jsx, loading.jsx
components/
  landing/ (12 files)             # living-network landing system
  loom/ (primitives, StatTiles, States, Drawer) · motion/ · student/OrgPanels · lead/LeadActions
  seo/JsonLd.jsx                  # Organization/WebSite/FAQPage/ItemList schemas
  AppShell.jsx, BrandMark.jsx, WeaveField.jsx, ui.jsx, actions.jsx, admin-forms.jsx
lib/                              # one concern per file: auth, auth-server, auth0 (client), user-identities
                                  # (Auth0 sub → canonical uid), permissions (29-action
                                  # matrix), tenant, db (pooler-safe), nav (single IA source), seo,
                                  # github (pause gate), lead, oss, mentorship, reputation, community,
                                  # credentials, classification notes, api, audit, env, rate-limit, theme
load/                             # migrate.js, seeds, rollups, wipe-dev.js, shoot.js, verify-gate.js,
                                  # env-local.js (shared DATABASE_URL loader — secrets never hardcoded)
load/migrations/ 001–056         # THE schema source of truth; idempotent, never edit applied ones
docs/ 00,05,06,09,11–19 + README  # current set (7 superseded docs deleted; redirect map in docs/README)
tests/ (80 files) · e2e/ (10 spec files, including the public/SEO specs)
```

**Conventions (non-negotiable):** JS only · every `<Link>` gets `prefetch={false}` (pooler cost) · sequential awaits on pages, never parallel batches · every mutation: zod → server tenant → `can()` check → `writeAudit()` (+ `notify()`) · migrations idempotent (`IF NOT EXISTS`) · honest empty states, zero mock data in UI · one concern per commit.

**Auth model:** single `/login`; tenant always from `profiles.tenant_id` server-side; `/api/*` returns machine `401`, pages redirect. **Login runs through Auth0** (`@auth0/nextjs-auth0`, front door + `user_identities` map in migration 047) while the canonical user id stays the Supabase uid — the Auth0 `sub` → uid link is resolved in `lib/user-identities.js`, so no profile/owner ids are rewritten. Supabase auth is retained as a fallback path (legacy sessions + the E2E programmatic login). **Roles (6, upward-only):** `student` → `core` → `dept_lead` (Head = Co-Head, one tier) → `vertical_lead` → `admin` → `platform_admin`. The `mentor` *role* is retired (→`core`); mentorship is a capability. Roles are granted (request/appoint/claim), never self-selected. Post-login landing is role-aware (`/student`, `/lead`, `/admin`).

---

## 5. What is done (so you don't redo it)

- Full product loop: onboarding → roadmap → resources → projects → GitHub link → contests → mentorship ladder → credentials/certificates → leaderboard → social/discover.
- Org model: **13 departments** (6 technical + 7 non-technical, all active), memberships with join/request-core/grant flow, scoped Head posting, VL approval queue, succession flags. `lib/department-catalog.js` is the single source for slugs, names, aliases, cover art and retired-slug redirects (`backend`/`devops` → `web`, `pr_outreach` → `public_relations`, `sponsorship_evm` → `sponsorship`); migrations 088/089 apply that shape to the database. Two co-equal heads per department hold identical department-scoped authority and neither becomes a society admin.
- **Department workspaces**: `/lead/departments` lists every department the caller may open (admin: all, vertical lead: own vertical, head: own departments) and `/lead/departments/[slug]` aggregates heads, the work board, roster controls, events, event ops, reports, contributions, assets, budget, agreements and leadership history. Data comes from `lib/department-workspace.js`; each module renders only when `can()` allows it, and empty modules say so rather than showing zeroes.
- **Department work with proof (091)**: each department's own heads assign work with a deadline, the assignee submits an evidence URL + note, and the other head approves or returns it. A submission cannot be reviewed by the person who submitted it; every transition is audited and notifies the waiting human. Heads/co-heads can add, promote, demote and remove members inside their own department (never a Head's seat, which stays an admin appointment); removal keeps all historical work. Members see their own assignments at `/student/work`. Routes: `/api/departments/[id]/tasks*`, `POST/DELETE /api/departments/[id]/members*`; policy in `lib/department-tasks.js`; five new `can()` actions.
- LeetCode practice uses the **public GraphQL profile by username** only — LeetCode has no OAuth or public API, and LOOM never asks for `LEETCODE_SESSION`/`csrftoken`. The stored snapshot includes the submission calendar, which the practice page and public profile draw as a heatmap (recent 400 days).
- **Practice title repair (093)**: seven scheduled questions had genuine LeetCode slugs but placeholder titles ("hjgvghg", …). Migration 093 rests titles on the stored slugs, fixes their difficulty, and renames the week "Something" → "Greedy and scheduling" without touching the three recorded solves; matching on both slug and placeholder means a deliberate human title is never overwritten. `validateQuestions` now derives a title from the slug when the box is blank, and the editor fills it on URL paste, so the case cannot recur.
- Operations: announcements with notification fan-out, contribution ledger, volunteers, monthly dept reports, handover board, full finance (budget heads/expenses/sponsorships), FAQ manager, department CRUD.
- Public site in landing language with pulse sections; SEO pass (title templates, canonicals, OG/Twitter, sitemap+robots, JSON-LD, single-h1 verified by E2E, private areas noindexed).
- **Lead console Chapter tools** (committed locally, P0–P5): creative/media asset library (Supabase Storage, private bucket, versioned uploads, signed-URL downloads), MoU database with versioned documents, internal leadership directory, and an event operations task board — each mirrored in `/lead` and `/admin`, gated by six new `can()` actions (Head/VL/admin edit, `core` reads), plus a scheduled deadline reminder job (`load/remind-deadlines.js`). Docs live in `docs/13` (API) and `docs/14` (schema, migrations 040–044).
- GitHub pipeline built but **paused by default** (kill-switch `020`, HMAC verified live, OSS auto-verify on merge). `POST /api/github/sync` also backfills the member's GitHub contribution calendar (migration 092) so the heatmap shows real days even where no webhook is installed; webhook and calendar counts are merged per day with `max()`, never summed.
- **First-party usage telemetry and the student product tour (108).** `page_views` (which existed since 022 and was never written to) now records `session_key`, `area` and `role`; `ui_events` holds the five tour events; `profiles.tour_state` and `profiles.analytics_opt_out` store per-account state. `POST /api/telemetry` is the only writer: allowlisted events, route-shaped paths (no query string, no ids), flat metadata, bot and cross-site requests dropped, tenant from the host or session only, 120 events/min, max 10 per call. Anonymous visitors are a daily-rotating salted hash, never an IP. `components/telemetry/Tracker.jsx` sends one page view per route; `components/tour/ProductTour.jsx` is an in-house spotlight tour (one box-shadow cutout, measured target, focus trap, Escape/arrow keys, reduced-motion aware) whose six steps live in `lib/tour.js` and target `data-tour` attributes in the shell. Analytics can be switched off in Settings; the tour replays from Settings or `?tour=1`. Policy in `lib/telemetry.js`, tests in `tests/telemetry*.test.js` and `tests/tour.test.js`.
- **Usage reporting (109-110).** `lib/usage-rollup.js` writes `usage_daily` (chapter/day/workspace/route), `tour_daily` (chapter/day/tour/version plus per-step reach) and `usage_daily_totals` (chapter/day distinct visitors) from the raw tables, one complete day per transaction, so a rerun cannot double a count. `npm run rollup:usage` is the operator form and `usage-rollup` is in `/api/jobs/run`. `lib/usage.js` is the reporting math (route shares, newest-version tour funnels, the 5%-of-busiest "hard to reach" rule, the average daily audience with its peak day, insight cards with printed denominators). The report renders on `/admin/analytics` (sections 05-07) and `/lead/analytics` behind `view_usage` (Head+, Core read-only). Raw rows age out after 180 days via `load/prune-retention.js`, so the aggregates are the contract.
- **Page guides for every private page.** `lib/page-guides.js` holds one entry per route (plus `/*` detail families, a `:member` handle pattern and a per-workspace fallback), and each entry explains the page in three parts: what it is for, the order work moves through it, and what each real control does. `components/tour/Onboarding.jsx` - mounted once by `AppShell` - renders it as an in-flow `<details>` panel above the page, open on a first visit, collapsed to one "How this page works" line afterwards, with a "Show me around the workspace" button for the spotlight tour. Student Home keeps its automatic student tour; lead and admin tours are opt-in so nobody is interrupted mid-task. Seen-state is `profiles.tour_state` (read once per tab from `GET /api/telemetry`) with a localStorage mirror. `tests/page-guides.test.js` walks `app/(app)`, fails when a page ships without an entry or loses its flow/controls, and fails when a documented control label no longer exists in `app/` or `components/`.
- Data hygiene: shared DB holds only real rows (2 users, MSIT tenant); all seed/dummy data purged; hardcoded DB secrets purged from source; 14 unused deps removed; 7 stale docs deleted with redirect map.

---

## 6. REMAINING WORK — do these in order

### 🔴 A. Urgent / blocking (do first)

1. **Rotate the Supabase DB password.** The old password was once committed in `load/*.js` (purged from the tree in `6b3fbbb`, but it lives on in git history). Rotate in Supabase dashboard → update every `.env.local` + deploy env. Optional follow-up: rewrite history (BFG) — disruptive for all clones, decide as a team.
2. **Set `SUPABASE_SERVICE_ROLE_KEY`.** Empty in dev; admin user-management APIs are limited until set. Paste from Supabase dashboard → restart dev.
3. **Decide production hosting + set `NEXT_PUBLIC_APP_URL`** to the public HTTPS origin (canonicals, OG, sitemap, share links all derive from it). Enforce HTTPS/HSTS at the host.

### 🟡 B. Feature wiring (biggest functional gaps)

4. **Enable GitHub ingestion for real** (currently paused, flag off). Steps: public HTTPS origin (webhook must reach it — `localhost`/LAN IPs fail) → add row in `tenant_domains` → set `GITHUB_WEBHOOK_SECRET` on both sides → subscribe only to Push/PR/reviews/issues → flip `github_integration` at `/admin/flags` → test with `node load/verify-gate.js [enable|disable|status|clean]` → have every member link their username at `/student/github`. Full contract: `docs/16-github-integration.md`.
5. **Schedule the two nightly rollups** (`load/rollup-federation.js`, `load/rollup-analytics.js`) via cron / Vercel Cron / GitHub Actions. Until scheduled, Insights/Data/federation totals go stale (runbook row exists in `docs/15`). Also schedule the deadline reminder job (`node load/remind-deadlines.js --apply`, hourly) so MoU expiry / overdue task nudges actually fire.
6. **Wire email (SMTP).** Notifications/invites are in-app only. When adding a provider: keep in-app rows as the record, send mail as a side effect, never fail the mutation on mail failure.
7. **Recommendation surface - SHIPPED.** `lib/recommend.js` (`findHelpers`, `upsertSignal`) is live and permission-checked, backed by migration 028 (`help_signals`, `helper_profiles`, `help_matches`), four `/api/help/*` routes, and a `/student/help` UI. It stays deterministic and reads stored aggregates only - no live AI calls on the request path. `docs/05-classification-and-recommendations.md` still calls this unwired; that note is now corrected too.
8. **File uploads / object storage - SHIPPED for lead tools.** Supabase Storage (private `loom-files` bucket, created by `node load/setup-storage.js` with 8 seeded categories) backs the creative asset library and MoU documents: uploads are MIME/size-validated (`lib/media.js`, 25 MB), stored under tenant-scoped paths (`lib/storage.js`), served via short-lived signed URLs. Still not wired for student avatars/resources — those keep `resources.storage_key` unwired.
9. **Non-technical departments - SHIPPED active.** Design, Documentation, SMM & Content, Publicity, Sponsorship, Management and PR now seed active for existing tenants and appear on `/domains`, the homepage grid, `/admin/departments` and the lead workspaces. Assign Heads when those verticals are staffed. Backend and DevOps are **shared skills inside Web**, not departments.

### 🟢 C. Production hardening

10. **Rate limiting is in-memory per instance** — put a gateway limiter in front for multi-instance prod (`lib/rate-limit.js` stays as second layer).
11. **Observability.** No Sentry/error tracker (SDK removed as unused); errors surface via logs + `app/error.jsx`. Add a tracker or a log pipeline before launch, and keep the boundary.
12. **Load testing beyond smoke.** `load/k6-smoke.js` is one 30s ramp to 100 VUs. Extend scenarios before claiming capacity; dashboards intentionally stay sequential for pooler safety — re-verify under load.
13. **Search Console + analytics.** Set the verification env var, submit the sitemap, confirm canonicals resolve to the public origin.
14. **Multi-college onboarding (partially automated).** New chapter = `tenants` row (set `institution` + `city`) + at least one `tenant_institutions` alias + `tenant_domains` + `feature_flags` + seeds (`db:seed`, departments, FAQ) + first-admin claim at `/setup`. Claim a college without hand-written SQL: `node load/add-chapter-institution.js <chapter-slug> "College Name" [--city City] [--institution "Primary Name"]`; `--list` shows who claims what. Signup itself now places a member: onboarding captures the college and, while onboarding is unfinished, moves the account to the chapter that serves it (carrying department picks by slug). Adding more spellings is another claim command; after onboarding, moving a member is an admin decision. Consider scripting chapter creation into one command — today it is manual.

### 🔵 D. Steady-state hygiene (ongoing)

15. Keep the gates green before every handoff: `lint` 0 errors, `build` clean, `vitest`, full Playwright (10 spec files, run against chromium + mobile). Add E2E for every new route (pattern in `e2e/app.spec.js`).
16. New tables = new migration file (`load/migrations/0NN_name.sql`, idempotent) + append `docs/13/14/17`. Never edit an applied migration; never ALTER by hand.
17. Keep docs honest: the repo deletes superseded docs rather than letting them rot — follow the redirect-map convention in `docs/README.md`.
18. Shared-DB discipline: real data only. `db:seed:dev`/`db:wipe` are local tools; `wipe-dev --confirm` removes seed rows, `--full` truncates data tables (keeps schema).

### 🔵 E. Deferred security work (from the Cybersec Dept report)

19. **Two vulnerabilities are documented and deliberately not fixed:** V1 (account takeover via unlimited username changes) and V2 (spam accounts via temp-email providers). Exact locations and proposed fixes are in **`docs/22-security-findings-todo.md`** — read it before claiming the app is hardened against them. Everything else from that report was fixed in the 2026-10 pass (see the same file's closing table).

### 🔵 F. Usage analytics follow-ups (phase 3 shipped)

20. **The usage dashboard shipped (109).** `lib/usage-rollup.js` replaces one complete day at a time in `usage_daily` / `tour_daily` (idempotent, transactional), exposed as `npm run rollup:usage` and `/api/jobs/run?job=usage-rollup`. `lib/usage.js` holds the reporting math and `lib/usage-report.js` loads it; `/admin/analytics` renders Journey, Tour funnel and Hard to reach after the cohort sections, and `/lead/analytics` renders the same report behind the new `view_usage` action. What follows is the list of deliberate limits, not unfinished plumbing.

    What is deliberately still missing:
    - **No department attribution.** The aggregates carry a workspace and a route, never a department, so a per-vertical split would be invented. Both pages say so. Adding real attribution would mean changing what telemetry stores, which is a privacy decision, not a chart.
    - **No roadmap funnel here.** `roadmap_node_analytics` already owns start/complete per node; duplicating it in this report would give the chapter two numbers for one question.

    Chapter-wide audience is **done** (migration 110): `usage_daily_totals` counts distinct visitors once per day at rollup time, and `lib/usage.js` reports the average daily audience plus the peak day - never a sum of days, which would describe visitor-days rather than people. The Usage slot is on the lead mobile bar too, because `mobileNavForArea("lead")` derives from `leadNav`.

    Deliberate limits worth knowing before changing this: the tour auto-starts only on `/student` (a deep link never interrupts a task); anonymous traffic is counted without a cookie or banner because the key rotates daily; opted-out accounts write no rows at all, so their page views are absent rather than flagged; and there is no session-replay or search-text capture by design.

---

## 7. Quick reference

| Thing | Location |
|---|---|
| Roles & what each can do | `lib/permissions.js`, `lib/auth.js`, `docs/17-architecture.md` §2 |
| Every endpoint | `docs/13-api-reference.md` |
| Every table + migration order | `docs/14-database-reference.md` |
| Deploy env, scripts, runbook, known limits | `docs/15-deploy-and-operations.md` |
| GitHub contract + verification | `docs/16-github-integration.md` + `load/verify-gate.js` |
| Student / admin manuals | `docs/11-student-guide.md`, `docs/12-admin-guide.md` |
| Request lifecycle, workflows | `docs/17-architecture.md` |
| Public site + SEO surfaces | `docs/18-public-site.md` |
| Departments/volunteers/reports/handover/finance | `docs/19-operations.md` |
| Audit stub/dummy-data policy | Zero mocks — honest empty states, never fabricated metrics |
| Agent rules: how to change pages without breaking the site + mandatory gates | `AGENTS.md` (read before touching code) |

Good luck — the foundation is solid, the gates are green, and §6 is the whole roadmap. Start at A1.
