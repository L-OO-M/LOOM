# L.O.O.M. — Colleague Handoff

> **Read this first.** Everything a new maintainer needs: what the project is, how to run it, how it is built, what is done, and — in detail — what work remains. Last updated after `e9eecc5` (SEO + co-location pass). Verified state at handoff: `lint` 0 errors · `build` clean · `vitest` 46/46 · Playwright 160/160.

---

## 1. What this project is

**L.O.O.M.** (Learn · Build · Prove · Connect — plus Discover) is a learning operating system for college developer communities. One Next.js app serves:

- A **public site** (landing, About, FAQ, Events, Domains) that recruits students,
- A **student workspace** (`/student`) with roadmaps, resources, projects, GitHub proof, contests, mentorship, community, credentials, and social discovery,
- A **lead console** (`/lead`) for department Heads/Co-Heads and Vertical Leads,
- An **admin workspace** (`/admin`) for chapter operations: roster, content, programs, finance, reports, handover, flags, audit.

The guiding rule, from the society core: an **ecosystem, not an event organizer**. The generational loop is *Students Learn → Students Build → Students Mentor → Students Contribute*. Pillars: Accessibility, Readiness, Excellence, Network.

**Stack (all verified in `package.json`):** Next.js 15 App Router, **JavaScript/JSX only (no TypeScript by decision)**, React 19, Tailwind CSS 4, Supabase (Auth + single shared Postgres via the `:6543` pooler), `postgres` + raw parameterized SQL (no ORM — the old Drizzle mirror was deleted), zod, `motion` + GSAP (landing only), `next/font` (Geist + Fraunces). Runtime deps are exactly 10 — anything else was uninstalled as unused.

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
| Google Search Console | Add site, set `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | ⬜ Placeholder only |

---

## 3. Run it (5 minutes)

```bash
npm install
node load/migrate.js        # tracked migrations, idempotent (needs DATABASE_URL in env or .env.local)
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
  (auth)/ login/ register/        # client pages + _components/LevelGuide.jsx + noindex layout
  (app)/ student/ lead/ admin/    # private workspaces (noindex layouts), each page's
                                  #   one-off components co-located in _components/ or *Bits.jsx
  api/                            # ~80 route handlers; envelopes { ok, data | error }
  setup/ verify/ auth/            # claim-first, credential verify, supabase callbacks
  error.jsx, not-found.jsx, loading.jsx
components/
  landing/ (12 files)             # living-network landing system
  loom/ (primitives, StatTiles, States, Drawer) · motion/ · student/OrgPanels · lead/LeadActions
  seo/JsonLd.jsx                  # Organization/WebSite/FAQPage/ItemList schemas
  AppShell.jsx, BrandMark.jsx, WeaveField.jsx, ui.jsx, actions.jsx, admin-forms.jsx
lib/                              # one concern per file: auth, auth-server, permissions (20-action
                                  # matrix), tenant, db (pooler-safe), nav (single IA source), seo,
                                  # github (pause gate), lead, oss, mentorship, reputation, community,
                                  # credentials, classification notes, api, audit, env, rate-limit, theme
load/                             # migrate.js, seeds, rollups, wipe-dev.js, shoot.js, verify-gate.js,
                                  # env-local.js (shared DATABASE_URL loader — secrets never hardcoded)
load/migrations/ 001–020         # THE schema source of truth; idempotent, never edit applied ones
docs/ 00,05,06,09,11–19 + README  # current set (7 superseded docs deleted; redirect map in docs/README)
tests/ (10 files) · e2e/ (app + public incl. SEO specs)
```

**Conventions (non-negotiable):** JS only · every `<Link>` gets `prefetch={false}` (pooler cost) · sequential awaits on pages, never parallel batches · every mutation: zod → server tenant → `can()` check → `writeAudit()` (+ `notify()`) · migrations idempotent (`IF NOT EXISTS`) · honest empty states, zero mock data in UI · one concern per commit.

**Auth model:** single `/login`; tenant always from `profiles.tenant_id` server-side; `/api/*` returns machine `401`, pages redirect. **Roles (6, upward-only):** `student` → `core` → `dept_lead` (Head = Co-Head, one tier) → `vertical_lead` → `admin` → `platform_admin`. The `mentor` *role* is retired (→`core`); mentorship is a capability. Roles are granted (request/appoint/claim), never self-selected. Post-login landing is role-aware (`/student`, `/lead`, `/admin`).

---

## 5. What is done (so you don't redo it)

- Full product loop: onboarding → roadmap → resources → projects → GitHub link → contests → mentorship ladder → credentials/certificates → leaderboard → social/discover.
- Org model: 8 departments (5 technical active; 3 non-technical ship **inactive**), memberships with join/request-core/grant flow, scoped Head posting, VL approval queue, succession flags.
- Operations: announcements with notification fan-out, contribution ledger, volunteers, monthly dept reports, handover board, full finance (budget heads/expenses/sponsorships), FAQ manager, department CRUD.
- Public site in landing language with pulse sections; SEO pass (title templates, canonicals, OG/Twitter, sitemap+robots, JSON-LD, single-h1 verified by E2E, private areas noindexed).
- GitHub pipeline built but **paused by default** (kill-switch `020`, HMAC verified live, OSS auto-verify on merge).
- Data hygiene: shared DB holds only real rows (2 users, MSIT tenant); all seed/dummy data purged; hardcoded DB secrets purged from source; 14 unused deps removed; 7 stale docs deleted with redirect map.

---

## 6. REMAINING WORK — do these in order

### 🔴 A. Urgent / blocking (do first)

1. **Rotate the Supabase DB password.** The old password was once committed in `load/*.js` (purged from the tree in `6b3fbbb`, but it lives on in git history). Rotate in Supabase dashboard → update every `.env.local` + deploy env. Optional follow-up: rewrite history (BFG) — disruptive for all clones, decide as a team.
2. **Set `SUPABASE_SERVICE_ROLE_KEY`.** Empty in dev; admin user-management APIs are limited until set. Paste from Supabase dashboard → restart dev.
3. **Decide production hosting + set `NEXT_PUBLIC_APP_URL`** to the public HTTPS origin (canonicals, OG, sitemap, share links all derive from it). Enforce HTTPS/HSTS at the host.

### 🟡 B. Feature wiring (biggest functional gaps)

4. **Enable GitHub ingestion for real** (currently paused, flag off). Steps: public HTTPS origin (webhook must reach it — `localhost`/LAN IPs fail) → add row in `tenant_domains` → set `GITHUB_WEBHOOK_SECRET` on both sides → subscribe only to Push/PR/reviews/issues → flip `github_integration` at `/admin/flags` → test with `node load/verify-gate.js [enable|disable|status|clean]` → have every member link their username at `/student/github`. Full contract: `docs/16-github-integration.md`.
5. **Schedule the two nightly rollups** (`load/rollup-federation.js`, `load/rollup-analytics.js`) via cron / Vercel Cron / GitHub Actions. Until scheduled, Insights/Data/federation totals go stale (runbook row exists in `docs/15`).
6. **Wire email (SMTP).** Notifications/invites are in-app only. When adding a provider: keep in-app rows as the record, send mail as a side effect, never fail the mutation on mail failure.
7. **Recommendation surface (`docs/05`).** The design is sound but unwired (helpers were removed as dead code). When shipping it: reintroduce small tested pure functions, keep them deterministic, read stored aggregates — no live AI calls on the request path.
8. **File uploads / object storage.** `resources.storage_key` exists but no R2/S3 integration; avatars, PDFs, screenshots have nowhere to live. Pick a provider, store metadata in Postgres, files in the bucket.
9. **Activate the 3 non-technical departments** when the chapter staffs those verticals (they seed as `is_active=false`; toggle in `/admin/departments`).

### 🟢 C. Production hardening

10. **Rate limiting is in-memory per instance** — put a gateway limiter in front for multi-instance prod (`lib/rate-limit.js` stays as second layer).
11. **Observability.** No Sentry/error tracker (SDK removed as unused); errors surface via logs + `app/error.jsx`. Add a tracker or a log pipeline before launch, and keep the boundary.
12. **Load testing beyond smoke.** `load/k6-smoke.js` is one 30s ramp to 100 VUs. Extend scenarios before claiming capacity; dashboards intentionally stay sequential for pooler safety — re-verify under load.
13. **Search Console + analytics.** Set the verification env var, submit the sitemap, confirm canonicals resolve to the public origin.
14. **Multi-college onboarding (when needed).** New chapter = `tenants` row + `tenant_domains` + `feature_flags` + seeds (`db:seed`, departments, FAQ) + first-admin claim at `/setup`. Consider scripting this into one command — today it is manual.

### 🔵 D. Steady-state hygiene (ongoing)

15. Keep the gates green before every handoff: `lint` 0 errors, `build` clean, `vitest`, full Playwright (160 = 80 specs × chromium + mobile). Add E2E for every new route (pattern in `e2e/app.spec.js`).
16. New tables = new migration file (`load/migrations/0NN_name.sql`, idempotent) + append `docs/13/14/17`. Never edit an applied migration; never ALTER by hand.
17. Keep docs honest: the repo deletes superseded docs rather than letting them rot — follow the redirect-map convention in `docs/README.md`.
18. Shared-DB discipline: real data only. `db:seed:dev`/`db:wipe` are local tools; `wipe-dev --confirm` removes seed rows, `--full` truncates data tables (keeps schema).

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
