# 28 — UX, Navigation & Interaction Overhaul: Execution Plan

> **Status:** plan only. No application code is changed by this document.
> **Owner:** whoever runs the next session.
> **Companions:** `AGENTS.md` (rules of engagement), `docs/06-frontend-ux-and-motion.md`
> (existing IA/motion decisions), `docs/18-public-site.md` (public surfaces + SEO contract).
>
> **Definition of success (one sentence):** a person who has never heard of LOOM can
> open the site, understand what it is, find the thing they came for, do it, and know
> where they are and what to do next — without being told, and without hitting a dead
> end, a blank screen, or a silent failure.

---

## 0. Ground truth (verified in this repo, not assumed)

Anything below marked ✅ was read from the code; anything marked ❓ is still unverified
and is Phase 1 work. The brief that prompted this plan contained several claims that
**do not match the code**, which is exactly why Pass 1 has to be evidence-first.

| Claim in the brief | Reality in this commit | Verdict |
| --- | --- | --- |
| Primary nav is About, Domains, Events, FAQ, Sign in, Get started | `lib/nav.js` `publicNav` = Home, About, Domains, Events, FAQ; `PublicNav` adds theme toggle + Sign in / Get started | ✅ accurate |
| Footer contains Roadmap, Practice, Resources, Projects, GitHub, Open Source, Debug, Proof, Challenges, Standings, Mentors, Community, Chapters, Ideas | `components/landing/PublicFooter.jsx` has **8** links: About, Events, FAQ, Domains, Privacy, Terms, Contact, Sign in | ❌ inaccurate — those 15 destinations are the **signed-in** sidebar (`studentNav`), not the footer |
| 11 domains (8 technical + 3 non-technical) | `app/domains/_components/DomainsContent.jsx`: 8 technical + 3 non-technical | ✅ accurate |
| FAQ questions/answers appear duplicated | `app/faq/_components/FaqScroller.jsx` renders each row **twice**: the second group is `aria-hidden` + `inert`, cloned for an infinite marquee | ✅ real, but it is a marquee technique, not duplicated data (`faq-data.js` has 4 unique questions) |
| "Loading About LOOM…", "Loading events…" flashes | `app/{about,domains,events,faq}/loading.jsx` are **empty surfaces** whose only content is `sr-only` text | ⚠️ half-true: sighted users see a blank flash, not the text; screen readers do hear it |
| "outdated skeleton experience" | `app/(app)/loading.jsx` is a generic 3-card `skel` block, identical for every workspace route | ✅ accurate |
| Date/time, registration, back-navigation issues | unverified | ❓ Phase 1 |

### Product shape (from the code)

- **Stack:** Next.js 15.5.28 App Router, **JavaScript/JSX only**, Supabase Postgres via
  `lib/db.js` (pooler rules: `max:10`, sequential page queries), nonce-based CSP in
  `middleware.js`, public pages are `force-dynamic`.
- **Route surface:** 108 `page.jsx` + 146 `route.js`.
  - public/auth: 16 (`/`, `about`, `domains`, `domains/[slug]`, `events`, `events/[id]`,
    `faq`, `contact`, `privacy`, `terms`, `login`, `register`, `consent`, `setup`,
    `verify-email`, `verify/…`, `u/[username]`, `account-status`)
  - `/student`: ~45 routes including detail pages (`projects/[id]`, `events/[id]`,
    `contests/[id]`, `roadmap/[nodeId]`, `community/*`, `network/[slug]`, `[username]`)
  - `/lead`: 15, `/admin`: 30 (incl. `events/[id]`, `students/[id]`)
- **Navigation today:** `lib/nav.js` is the single source.
  - Student: five verbs — Learn / Build / Prove / Connect / Discover — top bar shows one
    link per verb, siblings live in `components/student/SectionRails.jsx` (real URLs).
  - Admin/lead: top-bar **dropdowns** with grouped sections.
  - Mobile: `mobileNav` six-slot bottom bar, `mobileNavForArea()` derives lead/admin.
  - Public: `publicNav` (5 links) + `PublicFooter` (8 links).
  - **Homepage is different:** `app/_components/storyloom/StoryHome.jsx` renders its own
    `HomeNavigation` and `HalftoneFooter`, not `PublicNav`/`PublicFooter`.
- **Loading today:** 21 `loading.jsx` files; public ones blank, workspace one generic
  skeleton; `components/loom/States.jsx` already exports `Skeleton`, `SkeletonHero`,
  `ErrorState`, `OnboardingState`.
- **Error/empty today:** `app/error.jsx`, `app/(app)/error.jsx`, `app/not-found.jsx`,
  `global-error.jsx`, plus per-page empty states.
- **Test surface today:** 12 Playwright specs (466 tests), 175 unit files (1575 tests),
  `load/check-live.mjs` (86 checks), `load/check-authenticated.mjs` (321 checks,
  108/108 pages + 146/146 handlers).

### Already-known defects that the audit must not "rediscover"

1. `components/landing/PublicFooter.jsx` hardcodes `© 2026` — wrong from 1 Jan 2027.
2. Two different public footers and two different public headers (homepage vs inner pages).
3. Intermittent React #418 on hydration (seen on `/admin` and on the homepage under
   parallel load); the deterministic `/admin` date cause is fixed, the rest is open.
4. 31 `toLocale*` calls inside `"use client"` components without a pinned timezone —
   latent day-shift on a UTC deployment.
5. `PLANNER_ENABLED = false`: planner routes exist but are hidden/404 by design.
   **Do not** surface a destination that is code-gated off.

---

## 1. Constraints (non-negotiable, from `AGENTS.md`)

| Constraint | Consequence for this work |
| --- | --- |
| JS/JSX only | No TypeScript, no `.tsx`, not even for "a quick type" |
| Tenant isolation | Any data-touching change keeps `tenant_id` server-side |
| AuthZ on every mutation | No new endpoint without session → membership → `can()` → zod → envelope → audit |
| Roles upward-only | No role pickers, no UI that implies self-promotion |
| Pooler rules | No `Promise.all` page query batches; `<Link prefetch={false}>` stays |
| Migrations append-only | This work needs **no** schema change; if one appears, it stops and asks |
| Zero mock data | Empty states stay honest; no lorem ipsum, no fake counts, no fake progress |
| Public SEO contract | Public pages keep exactly one `<h1>`, real description, absolute canonical; private areas stay `noindex` |
| One concern per change | Audit, IA, loading, a11y = separate commits, each gated |
| No new dependencies | Reuse `components/ui.jsx`, `components/loom/*`, `motion/react`, CSS vars |
| Gates per commit | `lint` → `test` → `build` → full Playwright; paste output, never paraphrase |

**Hard stop conditions** (ask before proceeding): anything that changes auth/tenant
boundaries, deletes user data, adds a paid resource, or needs a schema migration.

---

## 2. Method — three passes, evidence-first

```
PASS 1  DISCOVER   browser + code + route graph → defect ledger with reproducible evidence
PASS 2  IMPROVE    implement in independently verified slices (never one giant diff)
PASS 3  CHALLENGE  act as a brand-new user on the new build; re-run every journey + full gates
```

**Evidence rule.** A defect is only "found" when it has: route, role, viewport, theme,
steps, expected, actual, artifact (screenshot path or console/network capture), severity.
"A button felt wrong" is not a finding. A finding is `P2 · /events · mobile 390 · filter
"past" then open event → Back returns unfiltered list · expected: filter preserved`.

**Browser rule.** Playwright drives the real thing. Source reading explains *why* after
the browser shows *what*. Both happen for every P0/P1 finding.

**No-fabrication rule.** If a destination cannot exist yet (planner gated off, no backend
field), the ledger records "gap — needs backend/decision", and the UI does not pretend.

---

## 3. Phase 0 — Baselines and harness (½ day)

1. **Clean baseline.** `git status` clean, `npm run build`, `npm run start`, run all four
   gates once and save the output as the "before" reference.
2. **Artifact folders:** `.screenshots/ux-audit/{route}/{width}-{theme}.png` (gitignored).
3. **Route graph generator (read-only script, `load/ux-route-graph.mjs`):** walks
   `app/**/page.jsx`, extracts internal `href`/`router.push` targets from `app/`,
   `components/`, `lib/nav.js`, and prints:
   - route → inbound links (entry points) → outbound internal links (exit paths)
   - **orphans** (0 inbound links), **leaf ends** (0 outbound links), **dead hrefs**
     (hrefs with no matching route template)
   Output: `docs/29-route-inventory.md` (generated, reviewed, committed in Pass 1).
4. **Coverage map:** which routes have a Playwright spec today (`admin-audit`,
   `student-audit`, `public`, `app`, `mobile-layout`, `community`, `roles`, …) vs which
   have none. This becomes the "must add a test" list in Phase 10.
5. **Accounts matrix** (see open decision **D1**): admin, student, and a
   `dept_lead`/`vertical_lead`. Reuse `storageState` — the login endpoint is rate limited
   8/10 min per IP, so **one sign-in per role per run**, never per test.

---

## 4. Phase 1 — The route inventory (the "no orphan" contract)

Produce a table that is a deliverable in itself:

| Route | Purpose | Access (public / student / lead / admin / gated) | Entry points | Exit paths | Has loading | Has error state | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |

Rules:
- Every `page.jsx` appears — 108 rows, no sampling, no "representative pages".
- "Entry points" means real links from real surfaces (nav, rail, footer, in-page CTA,
  deep link from a detail page, email). A route reachable **only** by typing the URL is an
  orphan and gets flagged.
- "Exit paths" must include a way *back* (breadcrumb, rail, back control, or home).
- Dynamic segments are marked with the real tenant fixtures used for verification.

Deliverables: `docs/29-route-inventory.md` + the first entries of the defect ledger.

---

## 5. Phase 2 — Journey tests (A–F), each with pass criteria

Run each journey in a **fresh browser context**, in both themes, at 1440 and 390, with
console + failed-request capture. Record time-to-first-meaningful-content and every
"where am I?" moment.

| # | Journey | Steps | Pass criteria |
| --- | --- | --- | --- |
| A | First-time visitor | `/` → understand product → domains → how to join → register (stop before creating a real account unless a disposable one exists) | Hero states what LOOM is in ≤ 5 s of reading; ≥ 2 paths to "join"; no marketing claim without a destination |
| B | Learner | domain page → roadmap → practice → resources → back to domain | Every hop is one click; the return path preserves context; no dead end |
| C | Events | `/events` → filter → open event → understand date/time/eligibility → register/login redirect → "my events" afterwards | Filter survives back; event time unambiguous (timezone shown); return lands on the event or its registered state |
| D | Contributor | open source → projects → contribution requirements → GitHub destination | Requirements readable pre-login or a clear login gate; no fake repo links |
| E | Returning member | login → correct dashboard → roadmap/projects/events/proof → back | Landing role-correct; back returns to the console, not the marketing site; state preserved |
| F | Lead/admin | lead console + admin console discovery → one permitted action each → one denied action | Role-gated destinations invisible or clearly explained; denial is a redirect/403, never a blank page |

Journey F needs **D1** resolved; until then it is marked blocked, not skipped silently.

---

## 6. Phase 3 — Information architecture & navigation

### 6.1 What stays

`lib/nav.js` is the single source of truth and the five-verb model is already a good
answer to "users think in intentions". **Do not** replace it with a mega menu.

### 6.2 What to evaluate and likely change

| Area | Candidate change | Why (user problem) |
| --- | --- | --- |
| Public header consistency | One header component used by homepage **and** inner pages (or document a deliberate difference) | A visitor who navigates from `/` to `/events` currently gets a different chrome; trust and orientation drop |
| Public footer | Real link groups + honest "signed-in only" affordances; fix the hardcoded year | Footer is the only place a visitor can see the platform's shape, and today it shows 8 links and a stale year |
| Marketing → product bridge | Decide **D2**: a "Platform" disclosure (dropdown or a `/platform` page) that names Learn/Build/Prove/Connect/Discover and what each holds | A first-time visitor cannot discover the product's actual scope; today only 3 product links appear in the hero copy |
| Breadcrumbs | Add to all depth ≥ 2 routes (`domains/[slug]`, `events/[id]`, `projects/[id]`, `contests/[id]`, `roadmap/[nodeId]`, `community/*`, `network/[slug]`, admin/lead detail) | "How did I get here / how do I go back" is currently answered by browser back only |
| Back behaviour | Preserve list state: filters, sort, page, scroll (events, projects, students) | Returning from a detail page must not reset the list |
| Active states | Verify `aria-current` + visual state on every nav surface, including rails and detail pages | Users cannot tell which section they are in on detail routes |
| Mobile | Bottom bar consistency across roles; sheet focus trap + restore; 44 px targets | The student/lead/admin bars differ in behaviour, not just items |
| Keyboard | Tab order, Escape, focus return on every menu/drawer/modal; visible focus rings in both themes | Existing `drawer-focus` spec covers one drawer; the rest is unverified |

### 6.3 What must **not** happen

- No dead nav items, no "coming soon" pretending to be a destination.
- No link that silently redirects to `/login` without saying so (a lock affordance or an
  explanatory line is required when a public visitor clicks a member-only destination).
- No second navigation system on the same screen (this repo already fixed one such case —
  lead console pills vs real routes; do not reintroduce it).

---

## 7. Phase 4 — Loading experience (explicit requirement)

### 7.1 Inventory first (do not design before measuring)

For each of the 21 `loading.jsx` files and every client fetch, record: what paints today,
how long it paints (Fast 3G + local), whether it causes layout shift, and whether it is
even *seen* (a 40 ms flash is worse than nothing).

### 7.2 Rules for the replacement

| Context | Rule |
| --- | --- |
| Route transition, public | Keep the page's own frame (header/footer/hero band) and reserve the content box height; never a blank white/dark page |
| Route transition, workspace | Replace the generic 3-card skeleton with the destination's own structural placeholder (masthead line + rail + content rows) so the layout does not jump when data arrives |
| Sub-200 ms responses | Do not show a spinner at all — delay the indicator (~150–200 ms) via CSS `animation-delay` or a mount timer |
| Data regions | Contextual placeholder matching real line lengths; one placeholder per region, no 8-row drumbeat for a 2-row list |
| Buttons / actions | Immediate inline pending label ("Publishing…"), disabled during flight, duplicate submit impossible, original label restored on error |
| Images | Reserved aspect ratio, blur/dim placeholder, fade-in on load, never a layout shift |
| Long jobs | Only real progress; if there is none, say "working" with an elapsed hint, never a fake percentage |
| Failure | Every loading state has a matching recovery state (`ErrorState` with retry + back) |
| Motion | Respect `prefers-reduced-motion`; no looping shimmer that reads as "slow" |

### 7.3 Identity

One consistent "thread" motif (a thin animated line, the existing accent) may be used as
the page-level signature; it must be a single implementation in `components/loom/`, used
everywhere, and disabled under reduced motion. **No** per-page bespoke loaders.

---

## 8. Phase 5 — Interaction & usability checklist (per element)

For **every** button, link, dropdown, tab, accordion, modal, carousel, form, filter,
pagination control, toggle and async action:

1. Works (real request, real destination — verified in the network tab).
2. Purpose legible from the label alone.
3. Feedback within 100 ms (pressed/loading/disabled).
4. Pending state exists and is contextual.
5. Error path exists and is recoverable.
6. Keyboard operable (Enter/Space/Escape/arrows where expected).
7. Touch target ≥ 44×44 px, no hover-only affordance.
8. User input preserved when it should be (forms, filters, drafts).
9. Duplicate submissions impossible.
10. Destination matches the promise.

Forms specifically: visible labels (not placeholder-only), inline validation on blur +
submit, specific error copy, required markers, password visibility toggle, correct
`autocomplete`, mobile keyboard types, and an honest post-submit state.

---

## 9. Phase 6 — Cross-page continuity map

Wire only flows that exist; mark the rest as gaps.

| Flow | Exists today? | Work |
| --- | --- | --- |
| Domain → its roadmap nodes → practice → resources → back to domain | partial | add explicit "next step" links; verify the domain slug ↔ roadmap mapping |
| Event list → event detail → register → my events | partial | return path + registered state + timezone clarity |
| Project → contribution requirements → GitHub → proof | partial | one "what to do next" block on project detail |
| Challenge → submission → proof/standings | partial | link submission result to proof and standings |
| Mentor directory → mentor profile → request/contact | unverified | verify and connect |
| Public page → member destination | missing by design | lock affordance + explanation (D2) |

---

## 10. Phase 7 — Responsive, accessibility, performance matrix

**Viewports:** 320, 390, 768, 1024, 1440, 1920 — every changed route, both themes.
**Checks:** overflow (`scrollWidth ≤ viewport`), tap targets, nav collapse, drawer/modal
positioning, table overflow strategy, sticky header overlap, focus visibility.

**WCAG 2.2 AA pass:** landmarks, one `h1` + ordered headings, names for every control,
focus order, focus return after dialogs, `aria-live` for async results, contrast in both
themes, reduced motion, and **2.2.2 Pause/Stop/Hide for the FAQ marquee** (currently
auto-scrolling with no pause control — a real defect).

**Performance pass (measured, not guessed):** route TTFB, LCP element per public page,
CLS on route transitions, duplicate API calls per page (network log), JS transferred per
route, and image weight. Only then optimise; keep behaviour identical.

---

## 11. Phase 8 — Visual polish guardrails

Keep the existing identity (Storyloom public, workspace console). Allowed: type scale,
spacing rhythm, alignment, density, hierarchy, state styling. Forbidden: new gradients,
glassmorphism, card-on-card nesting, shadow stacks, new accent hues, or a second button
system. Every change must render correctly in **both** themes; no hardcoded colours.

---

## 12. Phase 9 — Implementation slices (each one commit, each one gated)

Ordered by user impact ÷ risk. Each slice lists its likely files; **confirm the real
importer list before touching a shared component.**

| # | Slice | Scope | Likely files | Gate |
| --- | --- | --- | --- | --- |
| S1 | Public chrome unification | one header + one footer for all public routes; fix `©` year; add breadcrumbs to public detail pages | `components/landing/{PublicNav,PublicFooter,SiteFrame}.jsx`, `app/_components/storyloom/HomeNavigation.jsx`, `halftone-wordmark-footer.jsx` | public.spec + home-redesign.spec + screenshots |
| S2 | Public discovery bridge (**D2**) | "Platform" disclosure listing the five verbs with honest lock states | `lib/nav.js`, `components/landing/PublicNav.jsx`, `app/about/*` or new `/platform` | public.spec, SEO test (`tests/seo-lib.test.js`, `e2e/public.spec.js`) |
| S3 | Loading system | shared loader primitives; replace 5 blank public loaders + `(app)/loading.jsx`; delayed reveal; no CLS | `components/loom/States.jsx`, 21 `loading.jsx`, `globals` CSS | visual diff at 6 widths, 2 themes, throttled |
| S4 | Workspace rails & back-state | rail parity, breadcrumbs, preserved list filters/scroll | `components/student/SectionRails.jsx`, list pages, `components/loom/*` | student-audit.spec + new back-state spec |
| S5 | Interaction defects (Pass 1 list) | every P1/P2 defect from the ledger, one commit per cluster | per defect | affected spec + neighbour specs |
| S6 | Forms & validation | labels, inline errors, pending, duplicate-submit guard | auth forms, project/event/report forms | `e2e/login.spec.js` + new form specs |
| S7 | A11y | FAQ pause, focus management, targets, contrast, live regions | `FaqScroller.jsx`, dialogs, nav | new `e2e/a11y-*.spec.js`, axe if already available (no new dep) |
| S8 | Continuity links | the Phase 6 flows that already have backing data | detail pages + rails | student-audit + admin-audit |
| S9 | Perf | measured fixes only | TBD by measurement | budgets recorded before/after |
| S10 | Docs + ledger close-out | update `docs/06`, `docs/18`, publish `docs/29`, close ledger | docs only | `npm test` (docs-drift) |

Rules: no slice touches auth/tenant/DB. If a slice needs one, it stops and asks. Never
mix "restyle" with "fix" in one commit. Every slice re-runs every gate after it, not just
its own spec.

---

## 13. Phase 10 — Verification protocol (per slice, then once at the end)

1. `git status --porcelain` — only that slice's files.
2. `npm run lint` — 0 errors, no new warnings.
3. `npm test` — all pass (currently 175 files / 1575 tests).
4. `npm run build` — clean.
5. `npx playwright test` — full suite (currently 466 tests). Targeted runs while
   iterating, full run before the commit.
6. `CHECK_EMAIL=… CHECK_PASSWORD=… npm run check:auth` — 321 passed, 0 failed, 12
   documented skips, no table changed.
7. Manual/browser: the changed journey, both themes, 3 widths, keyboard only, and a
   screenshot per state (default, loading, empty, error, success).

Never edit a test to match broken behaviour; if a test must change, say so in the commit
message and explain why the test was wrong.

---

## 14. Phase 11 — Final quality gate

| Area | Standard | How it is proven |
| --- | --- | --- |
| Discoverability | Every important destination has a named entry point | `docs/29` shows 0 orphans |
| Navigation | Any two sections within 2 clicks; back always works | route-graph + journey recordings |
| Task completion | Journeys A–F pass end to end | Playwright specs committed |
| Loading | No blank screens, no CLS, no fake progress | throttled screenshots + CLS measurement |
| Feedback | Every action reports state | per-element table signed off |
| Consistency | One header, one footer, one button system, one loader | code + screenshots |
| Responsiveness | 320→1920 clean, both themes | screenshot matrix |
| Accessibility | WCAG 2.2 AA practical pass | checklist + keyboard run |
| Reliability | No dead buttons, no silent failures | ledger P0/P1 = 0 |
| Performance | No regression vs baseline | before/after numbers |

**Final deliverables** (the report, not the plan): routes audited, top problems found,
changes shipped, IA changes, loading changes, components created/refactored, journeys
tested, build/test output, remaining issues, and everything that needs backend or
external configuration.

---

## 15. Defect ledger format (created in Pass 1, lives in `docs/29-…` or its own file)

```
ID: UX-014
Severity: P2  (P0 blocked task · P1 major friction · P2 minor friction · P3 polish)
Route: /events  · Role: public · Viewport: 390 · Theme: light
Steps: open /events → choose "Past" → open first event → Back
Expected: list returns with "Past" still selected and scroll restored
Actual: list returns unfiltered at the top; user must re-filter
Evidence: .screenshots/ux-audit/events/390-light-after-back.png, console clean
Root cause: filter lives in component state, not the URL
Fix: move filter to searchParams (Slice S4) · Test: e2e/events-filters.spec.js
Status: open
```

Every ledger row closes with a **test** or an explicit "gap — needs decision D*".

---

## 16. Open decisions (needed before Pass 2; defaults proposed)

| ID | Question | Default if unanswered |
| --- | --- | --- |
| D1 | Which credentials cover `dept_lead` / `vertical_lead`? Without them Journey F is blocked | Mark Journey F blocked; do not claim it passed |
| D2 | Public IA: add a "Platform" disclosure/page, or keep 5 links and strengthen `/about`? | Recommend the disclosure in the existing nav (no new route, no SEO risk) |
| D3 | Is a subtle brand "thread" loader acceptable, or placeholders only? | Placeholders only, thread used as a 2 px progress hairline |
| D4 | Label vocabulary: keep "Prove/Proof", "Challenges/Contests" split as-is? | Keep; only fix mismatches between label and destination |
| D5 | May Pass 2 add a public route (e.g. `/platform`)? It touches the SEO contract | No new routes; restructure existing pages |
| D6 | Verification depth: local production build only, or deploy a preview to check Vercel-specific behaviour (CSP nonce, image optimisation)? | Local build + live read-only checks; no deploy |
| D7 | Copy changes allowed in public marketing text? | Only where the current text is factually wrong or confusing; flagged per change |

---

## 17. Risks and how they are contained

| Risk | Containment |
| --- | --- |
| Shared component breaks many routes | Importer list first; change behind existing props; run every affected spec; screenshot diff |
| CSP nonce: new inline scripts/styles blocked | No inline `<script>`/`<style>`; use existing nonce pipeline only |
| Hydration #418 resurfacing under parallel load | Keep server-computed labels; never compute dates/random ids in client render; the admin audit watches console/page errors |
| Rate-limited login (8/10 min) | One `storageState` per role per run; never sign in per test |
| Pooler/connection pressure during audit | Sequential queries only; the sweep already guards row counts |
| Scope creep into features | Ledger P0/P1 only in Pass 2; everything else gets a ticket, not code |
| Test flakiness read as product failure | Reproduce in isolation 3× before calling it a defect; record both results |
| SEO regression on public pages | `e2e/public.spec.js` + `tests/seo-lib.test.js` must stay green in every S1/S2 commit |

---

## 18. Out of scope / needs external input

- Real email delivery, OAuth provider configuration, GitHub webhook secrets (environment).
- Any schema or API contract change; any new backend capability.
- Content authoring for the 11 domains beyond what exists (no invented resources).
- Sales/sponsorship copy, legal review of terms/privacy.
- Deploying to production (separate decision, D6).

---

## 19. Definition of done

- [ ] `docs/29-route-inventory.md` lists all 108 routes; 0 unexplained orphans; every
      dynamic route verified with real fixtures.
- [ ] Journeys A–F pass as committed Playwright specs (F only if D1 resolved).
- [ ] Header, footer, breadcrumbs and back behaviour consistent across public and app.
- [ ] Loading: no blank screens, no layout shift, no fake progress, reduced-motion honoured.
- [ ] Every P0/P1 ledger row closed with a test; P2 rows either fixed or explicitly deferred.
- [ ] Keyboard-only run of every journey; focus never lost; all dialogs trap and restore.
- [ ] WCAG 2.2 AA practical checklist signed, including the FAQ pause requirement.
- [ ] Lint 0 errors, unit suite green, build clean, full Playwright green, `check:auth`
      green with unchanged row counts.
- [ ] `docs/06` and `docs/18` updated to match the shipped IA and loading model.
- [ ] Final report written against the Phase 11 table — with numbers, not adjectives.

---

## 20. Implementation log (this pass)

Slices **S1-S10** were approved and applied in one working tree. The
per-finding record — what changed, what was confirmed as intentional, and the
measured verification — is section 8 of `docs/29-ux-audit-findings.md`.

Deliberately not done in this pass, and why:

- **Full chrome unification (preamble to UX-17).** The homepage keeps its
  cinematic halftone footer and inner pages keep the compact footer. Both now
  read their link list from `publicFooterLinks` and the year from `SITE_YEAR`,
  so the reported drift (27 vs 10 links, two `c 2026` literals) cannot recur.
  Deleting either treatment is a design decision that needs a human.
- **Server-side `/setup` short-circuit (UX-26 tail).** The splash was the
  reported defect and is fixed; moving the setup probe into the server
  component would change the Auth0/Supabase handoff path and is not needed to
  remove the blank wait.
- **`toLocale*` pinning outside events.** 31 client-side calls still format
  other dates in the viewer's locale. They are listed as a known leak and are
  outside the 39 findings.

The four mandatory pre-commit gates were run in this session: lint (0 errors),
`vitest` (1587 passed / 176 files), `next build` (clean), and a browser sweep of
the production build. The full Playwright suite and `check:auth` are the last
gate before the push.
