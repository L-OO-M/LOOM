# 29 — UX & Accessibility Audit: Findings Ledger

> **Status:** findings only. **No code has been changed.** Execution waits for explicit approval
> (see §7 "Approval sheet").
>
> **What this is:** every defect found by driving the *running production build* in a real
> Chromium browser — not by reading source. Each entry has the route, the role, the viewport/theme,
> the steps, what was expected, what actually happened, and the evidence file or measured number.
>
> Companion documents: `docs/28-ux-overhaul-plan.md` (execution plan, slices S1–S10),
> `docs/13-api-reference.md`, `docs/14-database-reference.md`.

---

## 1. How this was measured

| Dimension | Method |
|---|---|
| Routes | 108 page routes walked from `app/**/page.jsx`, dynamic segments filled with **real tenant rows** (not random UUIDs) |
| Browser | Playwright + real Chromium against `next start` (production build) on `http://localhost:3000` |
| Passes | anonymous 1440 · authenticated (role `admin`) 1440 · authenticated 390 · axe-core 4.13.0 on 28 pages · targeted interaction probes |
| Captured per route | HTTP status, final URL, error-boundary text, `console.*` errors, `pageerror`, failed requests, `<h1>` count/text, `<main>`/`<nav>`/`<footer>` landmarks, horizontal overflow, document height, unlabelled inputs, `img` alt coverage, full-page screenshot |
| Timing | `PerformanceNavigationTiming` over 3 runs per route; DB round-trip measured separately (median **49 ms**, `aws-0-ap-south-1.pooler.supabase.com`) |
| Artifacts | `.screenshots/ux-audit/` (gitignored): `results-{anon,auth}-{1440,390}.json`, `axe.json`, `loading/`, `probes/`, `full/`, `axe/` |
| Harness | `%TEMP%\opencode\ux-audit\*.mjs` (outside the repo) |

**Coverage caveats, stated plainly:**

- The audit account (`admin`) is the highest-privilege role. `student`-only and `dept_lead`-only
  authorisation *denials* were not re-tested for every route; the existing `e2e/app.spec.js` covers
  the boundary cases that were.
- Two dynamic routes had **no fixture row** in the database (`/student/contests/[id]`,
  `/student/debug/[slug]`) and were excluded rather than judged.
- Light theme was sampled on 4 surfaces, not all 108 routes.
- Timezone-sensitive behaviour cannot be reproduced locally: this machine and the browser both run
  `Asia/Kolkata`, so a UTC-vs-local off-by-a-day defect would be invisible here.

---

## 2. Scoreboard

| Severity | Count | Meaning |
|---|---|---|
| **P0** | 2 | Broken feature or session control. A real user hits a dead end. |
| **P1** | 7 | Serious: costs the user seconds, hides content, or fails WCAG AA outright. |
| **P2** | 17 | Moderate: confusing, inconsistent, or inaccessible in a specific mode. |
| **P3** | 13 | Polish / consistency / latent risk. |

Clean results worth stating: **zero** error boundaries triggered across 125 page renders,
**zero** `pageerror`, **zero** horizontal overflow at 390 px or 1440 px, **zero** images missing
`alt`, and every one of the 72 unique internal `href`s reachable from the six hub pages resolves
for a signed-in admin.

---

## 3. P0 — blocking

### UX-01 · Every resource "Details" link is a 404
- **Route:** `/student/resources` → card → "Details"
- **Role / viewport:** admin 1440 (any member; the page is member-only)
- **Steps:** open `/student/resources`, click "Details" on any card.
- **Expected:** a detail page for that resource.
- **Actual:** URL `/student/resources/res_big_o` returns **HTTP 200** but renders
  **"NO SUCH THREAD — 404 / This page was never woven."** All 264 resources behave the same way.
- **Evidence:** `probes/resource-detail-404.png`; hrefs found on the list page:
  `/student/resources/res_big_o`, `/res_git_branching`, `/res_deploy_railway`.
- **Root cause:** `app/(app)/student/resources/[resourceId]/page.jsx:13` gates on
  `if (!isUuid(resourceId)) notFound();` — but `resources.id` is `text` (`res_*` slugs), not UUID.
  Measured in the database: `resources.id` type = `text`; **264 rows, 0 UUID-shaped**.
  The link is produced by `lib/resource-link.js:56` `detailHrefFor()` → `/student/resources/${resource.id}`,
  used at `app/(app)/student/resources/_components/resources-ui.jsx` (card footer).
- **Fix:** delete the `isUuid` gate; validate the id as a non-empty slug (or drop validation and rely
  on the `SELECT … WHERE id = $1` + `if (!r) notFound()` that already exists on line 15–16).
  Add a unit test asserting `detailHrefFor({id:"res_big_o"})` round-trips to a page that renders.
- **Effort:** ~10 min + test.

### UX-02 · A suspended user cannot sign out (GET on a POST-only route)
- **Route:** `/account-status`
- **Role / viewport:** anonymous (this page is where a suspended account is parked)
- **Steps:** open `/account-status`, click **Sign out**.
- **Expected:** session ends, user lands on `/` or `/login`.
- **Actual:** `GET /auth/signout` → **405 Method Not Allowed**, empty body, user stays signed in.
- **Evidence:** `probes/` probe output: `{"text":"Sign out","href":"/auth/signout","method":"GET (anchor)"}` →
  `GET /auth/signout -> 405`.
- **Root cause:** `app/account-status/page.jsx:39` renders a plain `<a href="/auth/signout">`, while
  `app/auth/signout/route.js` exports **only `POST`** (by design — every other sign-out in the app is
  a `<form method="post">`).
- **Why it matters:** this is the one page a *suspended* user can reach, and it is the one page
  whose only action is broken. On a shared machine that is a session-hijack surface.
- **Fix:** replace the anchor with the same `<form action="/auth/signout" method="post">` +
  `<button>` pattern used by `AppShell` / `student/settings`. No API change.
- **Effort:** ~5 min.

---

## 4. P1 — serious

### UX-03 · Workspace navigation tears the shell off the page
- **Routes:** every `/student|/lead|/admin` transition (reproduced `/admin` → `/admin/students`)
- **Role / viewport:** admin 1440
- **Steps:** from `/admin`, click "People" → `/admin/students`.
- **Expected:** chrome stays put; only the content area re-renders.
- **Actual:** for **~2.6 s+** the viewport contains only `Skip to content` and six grey skeleton
  bars. `document.querySelector("header") === null`, `document.querySelector("main") === null`.
  The nav, account chip, workspace switcher and notifications all disappear, then snap back.
- **Evidence:** `loading/admin-students-fast-400.png` (and `-200.png`, `-3g-*`).
  Timeline: `t=80ms main=N hdr=y` → `t=400ms main=N len=86 hdr=y` → `t=800–2600ms` still skeleton.
- **Root cause:** `app/(app)/loading.jsx` is a **generic** skeleton that sits **above** each page's
  own `AppShell`. Next renders the segment's `loading.jsx` *instead of* the page during navigation,
  so the page-owned shell is unmounted and replaced by a shell-less skeleton.
- **Fix:** either (a) move the chrome out of the pages and into a shared layout so `loading.jsx`
  can render *inside* it, or (b) delete `app/(app)/loading.jsx` and keep the per-section
  `loading.jsx` files that already exist (`student/`, `admin/`, `lead/`, … ~24 of them) — they have
  the same flaw but a smaller blast radius. (a) is the correct fix; (b) is the cheap one.
- **Effort:** 2–4 h for (a).

### UX-04 · `/student` takes 5.3–6.1 s to become interactive
- **Route:** `/student`
- **Role / viewport:** admin 1440
- **Measured:** TTFB **528–842 ms**, DOMContentLoaded **5 303–6 126 ms** (3 runs).
  Meanwhile *all* network assets finish by **~870 ms** and total transfer is only **237 KB** —
  so this is **not** a bundle or network problem; it is server render time.
- **Root cause:** `app/(app)/student/page.jsx` issues **29 sequential `await sql`** calls and
  **zero** `Promise.all`. Measured database round-trip on this pooler: **median 49 ms** →
  29 × 49 ms = **1.4 s of pure round-trip latency** before any query does real work. The remaining
  ~4 s is query execution. This is a *consequence* of the documented pooler rule
  (`AGENTS.md` §1.5: page queries stay sequential, never `Promise.all`).
- **Comparable pages:** `/admin/students` 2 792–3 560 ms (4 queries), `/lead/overview`
  2 282–2 418 ms, `/admin` 1 292–1 942 ms, `/student/roadmap` 1 513–2 347 ms.
  Public pages are fine: `/events` 467 ms, `/domains` 108 ms.
- **Fix that respects the rule:** collapse the read-only dashboard queries into **one** SQL statement
  (or 2–3) returning multiple result sets — e.g. a single `SELECT` with JSON aggregation, or
  `WITH` CTEs returning one row of aggregates. Sequential *statements* stay 1–3 instead of 29, which
  serves the rule's intent (don't exhaust the 10-connection pooler) better than 29 round trips do.
- **Effort:** 3–5 h, highest risk item in the whole list (touches the busiest page).

### UX-05 · Public route changes blank the entire `<main>`
- **Routes:** `/about` → `/events`, `/events` → `/domains`, `/domains` → `/faq`
- **Role / viewport:** anonymous 1440
- **Actual:** the header stays, everything below it is **empty black** for **~400–700 ms**
  (unthrottled), longer on simulated 3G. `main` is `null` for the whole window.
- **Evidence:** `loading/public-events-fast-200.png`, `-400.png`;
  timeline `t=143ms main=N len=86` → `t=411ms main=N` → `t=807ms main=Y len=2747`.
- **Root cause:** `app/about/loading.jsx`, `app/events/loading.jsx`, `app/domains/loading.jsx`,
  `app/faq/loading.jsx` exist but render nothing visible before paint, and the public pages are
  fully dynamic (no static shell to fall back on).
- **Fix:** give each public segment a `loading.jsx` that paints the real hero/masthead skeleton
  (heading + one paragraph + one block), not an empty container.

### UX-06 · "WORKSHOPS" on a lead event page points at a route that does not exist
- **Route:** `/lead/events/[id]`
- **Role / viewport:** admin 1440
- **Steps:** open a lead event, click the **WORKSHOPS** breadcrumb.
- **Actual:** `/lead/events` → **404**. Directory `app/(app)/lead/events/` contains only `[id]/`;
  there is no `page.jsx`, so the collection URL is genuinely missing.
- **Evidence:** probe output `["Workshops -> /lead/workshops","WORKSHOPS -> /lead/events","Workshops -> /lead/workshops"]`
  then `/lead/events status: 404`.
- **Fix:** point the breadcrumb at `/lead/workshops` (which exists and is the sibling target the
  other two links on the same page already use), or add a `/lead/events` index. Prefer the former —
  it is one attribute, zero new surface.

### UX-07 · Dark theme: role badges in the admin roster are white-on-white
- **Route:** `/admin/students`
- **Role / viewport:** admin 1440, **dark theme** (the default)
- **Measured:** `.adst-role` computed `color: rgb(255,255,255)` on `background: rgb(242,243,241)`
  → **contrast ratio 1.11**, font size 8.48 px. axe: 28 nodes, `serious`.
- **Why:** `roleTone("admin")` in `app/(app)/admin/students/page.jsx` returns
  `{ bg: "var(--text)", color: "white" }`. In dark theme `--text` *is* near-white. This is exactly
  the "hardcode no colours" rule (`AGENTS.md` §4.1).
- **Fix:** `color: "var(--bg)"` — semantic, correct in both themes (light: dark text on dark chip;
  dark: dark text on light chip). Audit the sibling `vertical_lead` / `dept_lead` tones for the same
  hardcoding while there.
- **Effort:** ~10 min.

### UX-08 · `aria-pressed` on links — 28 nodes, invalid ARIA (`critical` in axe)
- **Routes:** `/student/resources` (19), `/student/events` (3), `/student/contests` (3),
  `/admin/students` (3); same pattern in `leaderboard`, `network`, `opensource`, `FilterToolbar`
- **Actual:** `<a aria-pressed="true">` — `aria-pressed` is only valid on `role="button"`. Screen
  readers ignore it, so the filter chips announce no selected state at all.
- **Evidence:** `axe.json` → `aria-allowed-attr`, impact `critical`.
- **Meanwhile the same pattern on real `<button>` elements** (`credentials/ProofRecord.jsx`,
  `roadmap/RoadmapTabs.jsx`, `settings/AppearancePanel.jsx`, …) is correct and must be left alone.
- **Fix:** for `<Link>`-based filters use `aria-current="page"` (they are links to a URL) — or, where
  the control really is a tab, move to `role="tablist"`/`role="tab"`+`aria-selected`. Do **one**
  shared fix in `components/loom/FilterToolbar.jsx`, `resources-ui.jsx:14/173`,
  `EventsBits.jsx:245/379`, `contests/page.jsx:146`, `leaderboard/page.jsx:305/321`,
  `admin/students/page.jsx:185`, `network/page.jsx:172`, `opensource/TrailClient.jsx:57`.
- **Effort:** 1–2 h, high coverage per hour.

### UX-09 · `/student/roadmap` has no `<main>`, and two `banner` landmarks
- **Route:** `/student/roadmap`
- **Actual:** `document.querySelectorAll("main").length === 0`; axe reports
  `landmark-one-main`, `landmark-no-duplicate-banner`, `landmark-unique`, plus 4 unlandmarked regions.
  The skip link (`Skip to content` → `#main`) therefore points at **nothing**.
- **Evidence:** `results-auth-1440.json` → `hasMain:false, mainLandmarks:0`; `axe.json`.
- **Root cause:** the roadmap page renders its own two-tier header and never wraps content in
  `<main id="main">` the way every other workspace page does.
- **Fix:** wrap the page body in `<main id="main">`; demote the inner header duplication.
  This is a one-page change but it is the shared skip-link contract, so fix it before anything else
  in that file moves.

---

## 5. P2 — moderate

### UX-10 · Multiple `<h1>` per page
| Route | `<h1>`s rendered |
|---|---|
| `/student/help` | 4 — "Stuck on something?", "Nothing outstanding", "No one is waiting on you", "Help others" |
| `/student/contests` | 2 — "Earn it under pressure.", "No open challenges yet." |
| `/student/leaderboard` | 2 — "Where steady work shows.", "Nobody is standing here yet." |

**Root cause (one shared defect):** `components/loom/States.jsx:13` renders the empty-state title
through `<Display size="md">`, and `components/loom/primitives.jsx` `Display` defaults to
`as: Tag = "h1"`. Every `OnboardingState` therefore injects an `<h1>`. 21 call sites use
`OnboardingState`; 7 more use `<Display>` directly, including
`app/(app)/student/help/page.jsx:211` (`<Display className="text-lg">Help others</Display>`).
**Fix:** `OnboardingState` title → `<Display as="h2">`; `help/page.jsx:211` → `<ProductHeading>`
(the pair already exists in `primitives.jsx`). That single change fixes all three routes and
immunises the other 18 call sites.

### UX-11 · `/student` is titled "HTML5" to a screen reader
- **Route:** `/student` (and `/student/insights`, which redirects here)
- **Actual:** the only `<h1>` is the *next roadmap node's* title — currently "HTML5". The page's own
  greeting, "Keep building, bansalyash161.", is an `<h2>`.
- **Root cause:** `app/(app)/student/_components/StudentDashboard.jsx:110`
  `<h1 id="desk-hero-title" className="desk-title">{nextNode.title}</h1>`.
- **Fix:** the page's `<h1>` should name the page ("Your dashboard" / the greeting); the current node
  card heading becomes `<h2>`. Note line 126 is the empty-path variant ("The whole path, walked.")
  and needs the same treatment.

### UX-12 · Account chip shows the wrong identity for ~0.6–1.2 s on every workspace page
- **Routes:** every `/student|/lead|/admin` page
- **Steps:** load `/admin` (no cache), watch the top-right chip.
- **Actual:** server-rendered as `BA @bansalyash161 student · private`, then at ~600–1200 ms it
  flips to `DE @demonstrikkk admin · public`. Initials, handle, role and privacy all change.
- **Evidence:** `probes/account-chip-flash-early.png` vs `-settled.png`; measured at
  `180 ms` → `"…BA @bansalyash161 student · private"`, `2680 ms` → `"…DE @demonstrikkk admin · public"`.
- **Root cause:** `components/AppShell.jsx` `MyProfileLink` receives only `user` (e-mail), so the
  server render falls back to `role: "student"`, `isPublic: false`, and the e-mail local-part as the
  handle. The real values arrive later from `/api/social/profile` + `/api/profile`.
- **Why it matters:** for a full second an **admin** is told they are a **student** with a
  **private** account. That is a trust defect on every single page.
- **Fix:** pass `profile.role` and the card handle from the server into `AppShell` so the first paint
  is correct, and use the fetched values only as a refresh.
- **Verified not a security issue:** the handle `demonstrikkk` genuinely belongs to user
  `7e196070-…` (`profiles.name = bansalyash161`); `/api/profile` returned `bansalyash161` on
  12/12 polls. No cross-user bleed — this is a *display* fallback bug only.

### UX-13 · Unlabelled form controls in operation surfaces
`<select>`/`<input>` with no `<label>`, no `aria-label`, placeholder-only.
axe severity `critical` where listed.

| Route | Unlabelled | Detail |
|---|---|---|
| `/admin/contests` | 5 | 2 × `datetime-local`, 1 × `<select>` (critical), 2 × placeholder-only |
| `/admin/resources` | 6 | 5 placeholder-only + 1 `<select>` (critical) |
| `/admin/roadmaps` | 4 | all placeholder-only |
| `/lead/challenges` | 3 | 1 `<select>` + 2 × `datetime-local` |
| `/admin/assets` | 1 | placeholder-only search |
| `/admin/directory` | 1 | placeholder-only search |
| `/admin/event-ops` | 1 | placeholder-only search |
| `/admin/feature-requests` | 1 | placeholder-only note field |
| `/admin/mous` | 1 | placeholder-only |

**Root cause:** these forms build controls inline rather than through `Field` from
`components/ui.jsx`, which wraps children in a `<label>`. The `datetime-local` and `<select>` cases
have *no* visible label at all, which is the worse half of the problem.
**Fix:** route every control through `Field`, or add `aria-label` where a visible label would be
noise (the search boxes). Prefer visible labels for `datetime-local` — "Starts at" / "Ends at" is
useful information, not clutter.

### UX-14 · Event times have no timezone, and past events still offer registration
- **Route:** `/events/[id]`, `/student/events/[id]`
- **Actual:** `WHEN — Thu, 29 Apr, 10:00 Am / Until Thu, 29 Apr, 4:00 Pm`. No timezone label
  anywhere on the page. The event date is **April 2026** (seven months past at audit time) yet the
  page still shows `SEATS — Open Registration · 0 Registered So Far`, and
  `POST /api/events/[id]` accepts a registration for a `status='past'` event
  (`app/api/events/[id]/route.js:57,74` select `IN ('upcoming','live','past')` with no date guard).
- **Also:** `10:00 Am` / `4:00 Pm` — the meridiem is capitalised by a formatter, not by design.
- **Fix:** one `formatEventTime()` helper that (a) emits `10:00 am`, (b) appends the chapter
  timezone (`IST`), and (c) is used by both the public and member detail pages. For the API, reject
  `register` when `starts_at < now() - interval '2 hours'` even if `status='past'` — read-only
  *cancel* must still be allowed.
- **Note:** there are **4 past events** in the database (`scope=past` in `GET /api/events`), but no
  UI path to reach them from `/events`.

### UX-15 · The 404 page offers "Sign in" to signed-in users and no way back to the workspace
- **Routes:** any bad URL inside the app, e.g. `/student/planner`, `/admin/planner`,
  `/student/network/<unknown>`, `/lead/events`
- **Actual:** a bare `<main>` with the public nav (`LOOM Home About Domains Events FAQ Sign in
  Get started`), a "Sign in" card, and no console nav. A signed-in admin is invited to sign in.
- **Evidence:** `probes/planner-404-authenticated.png`; body text
  `"Skip to content NO SUCH THREAD 404 … Everything real lives one tap away: Home START O…"`.
- **Root cause:** `app/not-found.jsx` is a standalone page with hardcoded public links; there is no
  `app/(app)/not-found.jsx`, so workspace 404s escape the workspace chrome.
- **Fix:** add `app/(app)/not-found.jsx` that renders inside `AppShell` with the signed-in user's
  own destinations, and keep `app/not-found.jsx` for genuinely public misses. Swap the hardcoded
  "Sign in" card for a session-aware block.

### UX-16 · Visitors see 18 member-only links and are redirect-laundered into `/login`
- **Route:** `/` (homepage footer)
- **Actual:** the homepage footer exposes 27 links, **18 of them `/student/*`** (Learn, Build,
  Prove, Connect, Discover, Insights, Roadmap, Resources, Contests, Leaderboard, Credentials,
  Community, Mentorship, Help, Sponsors, Privacy, Settings, Notifications). Clicking any one as a
  visitor silently 307s to `/login?redirect=…` with no lock icon, no "members only", no explanation.
- **Evidence:** probe: `visitor sees member-only links on homepage footer: 18`;
  click → `final /login?redirect=/student/...`.
- **Fix:** mark those footer entries as members-only (small lock + `Members` label) and, when
  anonymous, link the marketing equivalents (`/domains`, `/events`, `/about`) instead. The routes
  stay public-knowledge; what changes is that the footer stops pretending they are open.

### UX-17 · Two different public chromes
- **Actual:** homepage footer = **27 links / 8 `<nav>` landmarks**; inner pages (`/about`, `/events`,
  `/domains`, `/faq`, `/contact`) = **10 links / 1–3 `<nav>`**. Both hardcode `© 2026`.
- **Root cause:** `components/landing/PublicFooter.jsx` + `PublicNav.jsx` + `SiteFrame.jsx` for inner
  pages vs `app/_components/storyloom/halftone-wordmark-footer.jsx` +
  `HomeNavigation.jsx` for `/`.
- **Consequence:** a visitor crossing `/` → `/about` loses 17 links and the footer changes shape;
  the 404 page, verification pages and `/account-status` each pick a different one.
- **Fix:** decide which is canonical (the homepage footer is the richer, better-designed one) and
  render it from `SiteFrame` too; delete the other. Year should come from one constant.

### UX-18 · Mobile menu opens without taking focus, without a dialog role, without scroll lock
- **Route:** any public page at 390 px
- **Actual:** `aria-expanded` flips to `true` and links appear, but `document.activeElement` stays on
  the trigger, `body` keeps `overflow: visible` (the page scrolls behind the open menu), and there is
  no `role="dialog"`/`aria-modal`.
- **Working correctly (do not regress):** `Escape` closes it and returns focus to the trigger.
- **Fix:** move focus to the first item (or the sheet container), add `role="dialog"` +
  `aria-modal="true"` + `aria-label="Menu"`, and lock scroll while open.

### UX-19 · `/student/resources` is 13 255 px tall with 264 interactive children
- **Measured:** document height **13 255 px**; **264** resource cards; **264** client
  `ResourceCompleteButton` instances hydrated at once; no pagination, no "load more".
- **Consequence:** the page is 1.8–2.3 s to DOM ready, and the filter chips are 200+ screens above
  the fold once you scroll into the list.
- **Fix:** paginate or virtualise (server-side `LIMIT/OFFSET` already exists in the admin resource
  API), and keep a sticky filter bar. Target: ≤ 40 cards per view.

### UX-20 · Links inside body text fail the colour-only distinction rule
- **Routes:** `/student/events` (`a[href$="leaderboard"]`, link vs surrounding text contrast
  **1.23:1**), `/student/community/forums` (`a[href$="demonstrikkk"]`, **2.23:1**). axe `serious`.
- **Fix:** underline inline links (`text-decoration: underline` with `text-underline-offset`), or
  raise the accent-vs-body contrast to ≥ 3:1. Shared token change, not per-page.

### UX-21 · Login and register have focusable content inside `aria-hidden`
- **Routes:** `/login`, `/register` — axe `aria-hidden-focus` (`serious`), target `aside`.
- **Consequence:** a keyboard user can Tab into a decorative side panel that assistive tech has been
  told to ignore — focus disappears from the accessibility tree.
- **Fix:** either drop `aria-hidden` from the `<aside>` (if it is informative) or add `inert` /
  `tabindex="-1"` to its focusable descendants.

### UX-22 · The shared 11 px caption colour fails contrast on every public page
- **Routes:** `/about`, `/domains`, `/events`, `/faq`, `/contact`, `/events/[id]` — one node each.
- **Measured:** `#6a6d6c` on `#101314` = **3.56:1** at 11 px (needs 4.5:1). axe `serious`.
- **Fix:** one token — lift the muted caption colour ~1 step (e.g. `#8a8d8c` ≈ 5.2:1) in
  `globals.css`. Verify the light theme in the same pass.

### UX-23 · `aria-label` on `<p>` elements on the homepage
- **Route:** `/` — 5 nodes (`.description-a01/a03/a05…`). axe `serious` (`aria-prohibited-attr`).
- **Cause:** a `<p>` has no role that permits an accessible name, so the label is discarded.
- **Fix:** remove the `aria-label`s, or give the element `role="note"` only if the name carries real
  information (it usually does not).

### UX-24 · Touch targets under 24 × 24 px
- **Route:** `/` — **26** nodes. axe `target-size` (WCAG 2.2 AA 2.5.8).
- **Measured:** nav items are **21 px tall** (`Home` 38×21, `About` 39×21, `Domains` 57×21,
  `Events` 44×21, `FAQ` 27×21) and sit < 24 px apart.
- **Fix:** add vertical padding to reach 24 px and ≥ 8 px spacing between targets. One nav change
  fixes most of the 26.

### UX-25 · Empty table header on the admin roster
- **Route:** `/admin/students` — `th[aria-label="Actions"]` has no text, so the column is unnamed
  for screen readers (axe `minor`, but it is the actions column of the primary admin table).
- **Fix:** put visually-hidden text inside the `<th>` (`<span className="sr-only">Actions</span>`)
  rather than an `aria-label` on the `th`.

### UX-26 · `/setup` shows a bare sentence for 2–5 s
- **Route:** `/setup` (authenticated admin)
- **Timeline:** `t=500 ms` → `/setup`, **0 `<h1>`**, text `"Checking setup state…"`;
  `t=2000 ms` unchanged; `t≈3–5 s` → `/admin`.
- **Problems:** no heading, no landmark, no live region, no spinner — just three words on a blank
  page, and the wait is *this* account's normal path (setup is already complete, so it always
  resolves by redirecting away).
- **Fix:** render the same `AppShell`-less splash used by `/verify-email` but with an `<h1>`, a
  `role="status"` + `aria-live="polite"` line, and a spinner. If the check is already known
  server-side, skip the client round trip entirely and `redirect()` on the server.

---

## 6. P3 — polish and latent risk

| ID | Finding | Detail / fix |
|---|---|---|
| **UX-27** | Two filters report `aria-pressed="true"` at once | `/events?type=workshop`: both `Workshop` and `All domains` are `true`. `All domains` is a different axis (domain, not type) — it should not claim "pressed". Fix by using `aria-current` per axis, or label the axes. |
| **UX-28** | Register form is native-validation only | No password show/hide; the "At least 8 characters" hint is not referenced by `aria-describedby`; empty submit produces no inline error text (browser tooltip only); the consent checkbox is not `required`. All fields *do* have proper `<label>` + `autocomplete`, so this is refinement, not rescue. |
| **UX-29** | `/about` has a fake button | `div[tabindex="0"][role="button"]` ("JOIN LOOM …") — hand-rolled keyboard handling; also a "Show back" flip-card `<button>` that reveals nothing actionable. Use a real `<a>`/`<button>`. |
| **UX-30** | Hidden mobile nav disagrees with desktop nav | mobile "Prove" → `/student/contests`, desktop → `/student/credentials`; mobile "Connect" → `/student/community`, desktop → `/student/mentorship`. Two sources of truth. Fix: derive both from `lib/nav.js`. |
| **UX-31** | `/student/roadmap` shows "2 OF 33 COMPLETE" twice | Same statistic rendered in the hero and the summary rail. Redundant, not wrong. |
| **UX-32** | Homepage above-the-fold at 1440×768 | First paragraph at **y=519**, `<h1>` at **y=592**, document **13 083 px**. `/events`: first paragraph at **y=1063** — no event is visible without scrolling. The design is deliberate and cinematic; flagging it so the decision is conscious, not accidental. Mobile is *better* (`h1` y=517 of 844). |
| **UX-33** | 16 `<Link>`s across 11 files omit `prefetch={false}` | `DataTable.jsx` 3/0, `certificates/[code]/page.jsx` 2/0, `settings/page.jsx` 4/2, `AppShell.jsx` 11/9, `feature-requests/page.jsx` 1/0, `network/[slug]/page.jsx` 5/4, `verify/certificate` 1/0, `verify/credential` 1/0, `BrandMark.jsx` 1/0, `Evidence.jsx` 1/0, `States.jsx` 1/0. **Repo total: 332 `<Link>`, 316 with `prefetch={false}`.** Measured prefetch pressure is currently near zero (`/student` 0 requests, `/admin` 0, `/events` 1 — the brand mark), so this is *latent* risk, not a live regression. Fix for consistency with `AGENTS.md` §1.5. |
| **UX-34** | `/faq` heading order | `FaqSection` defaults `headingLevel = "h1"` and card titles are `<h3>` → h1 → h3 skips a level (axe `moderate`). Fix: card titles to `<h2>`, or add a real `<h2>` section heading. |
| **UX-35** | FAQ marquee has no *discoverable* pause | It does pause on hover and on focus-within (`faq.css:52`) and stops entirely under `prefers-reduced-motion` (`faq.css:65`) — so this is **not** the WCAG 2.2.2 failure my first pass suspected. What is missing is any *visible* affordance: 2 tracks, 60 s / 55 s infinite, cards 384 px wide that are cut off mid-sentence by the mask. Fix: a small pause/play button per row; consider slowing to ≥ 80 s. |
| **UX-36** | Homepage headline words sit at 16 % opacity | `.ycs-word` inactive words measure `opacity: 0.16` (contrast **1.31:1**). It is a scroll-driven reveal, so each word becomes legible in turn — but the sentence is unreadable as text at any single moment. Verify this is intentional; if the reveal ever fails (reduced motion, JS error) the headline is effectively invisible. |
| **UX-37** | Three feature-flagged planner routes 404 with no explanation | `/student/planner`, `/lead/planner`, `/admin/planner` all return the 404 page because `PLANNER_ENABLED` is off. `lib/nav.js` correctly hides the links, so nothing dead-ends — but a bookmark or a shared URL lands on "This page was never woven." Consider a 404 with "this feature isn't switched on yet". |
| **UX-38** | Two alias URLs that only redirect | `/student/insights` → `/student#growth`; `/student/privacy` → `/student/settings#privacy`. Neither is linked from anywhere (orphans). Harmless, but they inflate the route count and show up as "non-200" in every automated sweep. Either delete them or keep them deliberately with a comment. |
| **UX-39** | `/admin/students` reload cost | 2.8–3.6 s for 4 queries — the delta vs the 49 ms RTT floor is one expensive roster query (tier filter + dept counts in JS). Worth an `EXPLAIN` while UX-04 is being measured; likely the same fix. |

---

## 7. Verified working — do not "rediscover" these

Recorded so a future pass does not spend hours re-proving them:

- **Events filtering is URL-driven** (`?type=workshop#calendar`); browser **Back restores both the
  query string and scroll position** (measured `scrollY=712`).
- **Forms have real labels:** `/login`, `/register`, `/student` settings — every input has a
  `<label for>` and a correct `autocomplete` token.
- **Mobile menu Escape** closes the sheet and restores focus to the trigger (UX-18 covers the gaps).
- **All admin top-bar icon controls have `aria-label`s.** Nothing unnamed.
- **72 unique internal `href`s** reachable from `/`, `/about`, `/domains`, `/events`, `/student`,
  `/admin` all resolve for an admin. Browser-checked one by one.
- **All 11 domain cards** on `/domains` resolve.
- **`/auth/login` is not a 404:** middleware hands it to Auth0 (`307` to `lets-loom.jp.auth0.com`).
- **`/student/network/demo-college` renders correctly** ("MSIT") — an earlier 404 was my fixture
  using a username where a chapter slug was required.
- **`/account-status`, `/verify-email`, `/verify/certificate/*`, `/verify/credential/*` are thin
  but correct** for their purpose (public verification pages, one job each).
- **No horizontal overflow** at 390 px or 1440 px on any of the 125 renders.

### Deliberately excluded as harness noise

- `net::ERR_ABORTED /x?_rsc=…` — Next router prefetch requests cancelled by the sweep navigating
  away. Measured separately: `/student` 0, `/admin` 0, `/events` 1. Not a defect.
- The one `401` on `/setup` while anonymous is the setup-state probe correctly refusing an
  unauthenticated caller.
- `WebGL … GPU stall due to ReadPixels` on `/` — headless Chromium's software GL, not the site.
- My first-pass contrast numbers (a hand-rolled colour parser mis-reading `oklch()`) are **withdrawn**;
  every contrast figure in this document comes from axe-core 4.13.0.

---

## 8. Approval sheet

Tick what you want executed. Everything is grouped into the slices from
`docs/28-ux-overhaul-plan.md` so each slice is one reviewable commit.

| Slice | Contents | Findings | Risk |
|---|---|---|---|
| **S1** | One-line correctness fixes | UX-01, UX-02, UX-06, UX-07 | very low |
| **S2** | Heading + landmark semantics | UX-09, UX-10, UX-11 | low |
| **S3** | Shared ARIA + form labels | UX-08, UX-13, UX-23, UX-25 | low |
| **S4** | Shell that survives navigation | UX-03, UX-05, UX-26 | medium |
| **S5** | `/student` query collapse | UX-04, UX-39 | **high** |
| **S6** | Time + past-event correctness | UX-14 | low |
| **S7** | 404 + navigation truthfulness | UX-15, UX-16, UX-17, UX-30, UX-37, UX-38 | medium |
| **S8** | Contrast + link distinction | UX-20, UX-22, UX-24, UX-36 | low |
| **S9** | Mobile menu + auth panel focus | UX-18, UX-21, UX-28 | low |
| **S10** | Long-list, marquee, leftovers | UX-19, UX-27, UX-29, UX-31, UX-32, UX-33, UX-34, UX-35 | low |

**Default recommendation:** approve **S1–S4 + S6 + S7** now (21 of the 39 findings, and S1/S6 are
one-file edits), leave **S5** for its own dedicated session because a query collapse on the busiest
page deserves full attention, and treat **S8–S10** as a follow-up pass.

**Answer "approve all" to get S1–S10; or name the slices you want.** Nothing is edited until then.

---

## 8. Implementation status (all slices approved and applied)

Every finding below is closed in this working tree. "Intentional" means the audit
flagged a deliberate design decision and the decision was confirmed, not patched
away.

| ID | Status | What changed |
| --- | --- | --- |
| UX-01 | fixed | `/student/resources/[resourceId]` no longer gates on `isUuid()`; a non-UUID slug resolves to the same not-found path as a real miss. |
| UX-02 | fixed | `/account-status` sign-out is a POST form, not a GET link. |
| UX-03 | fixed | every workspace `loading.jsx` deleted (21 files). A segment boundary was unmounting the page-owned `AppShell`, so nav and account chip vanished for seconds. `RouteProgress` (2px, top) now supplies feedback. |
| UX-04 | fixed | `/student` collapsed from 29 sequential reads to one SQL statement (scalar subqueries). |
| UX-05 | fixed | four public `loading.jsx` rebuilt on `PublicLoadingSkeleton` — real geometry, no second hero, no `<h1>`. |
| UX-06 | fixed | lead breadcrumb points at `/lead/workshops`. |
| UX-07 | fixed | admin role badge uses `var(--bg)` on the role tone; `core`/`dept_lead`/`vertical_lead` mixed against `var(--text)`. Measured 1.11:1 is gone. |
| UX-08 | fixed | every `aria-pressed` on an `<a>`/`<Link>` is `aria-current`; `TrailClient` keeps `aria-pressed` because it is a real `<button>`. |
| UX-09 | fixed | `WorkspaceMasthead` no longer emits a second `<header>`; roadmap has one `<main>`. |
| UX-10 | fixed | `OnboardingState` title is `h2`; `/help` "Help others" is an `h2`; `Display`/`ProductHeading` forward `...rest`. |
| UX-11 | fixed | `/student` has an `sr-only` `h1`; node titles are `h2`. |
| UX-12 | fixed | `AppShell` takes `profile`/`seed` and stops asserting a placeholder handle/role/privacy; `platform_admin` included; all links `prefetch={false}`. |
| UX-13 | fixed | labels added across admin/lead forms (admin-forms, lead panels, feature board). |
| UX-14 | fixed | `lib/event-time.js` pins Asia/Kolkata and shapes "Fri, 20 Nov, 10:00 am IST"; public + member event pages share it; past events show "Registration closed"; API returns `EVENT_CONCLUDED` 409 after start + 2h. |
| UX-15 | fixed | new `app/(app)/not-found.jsx` renders inside `AppShell` with the reader's own destinations; root 404 uses `useWorkspaceLink` so a signed-in reader sees "Open workspace", not "Sign in". |
| UX-16 | fixed | homepage footer member columns are labelled `· members` for anonymous readers, and the nav landmark is named "(members only)". Destinations unchanged. |
| UX-17 | partial, intentional | both chomes remain (homepage cinematic footer vs compact inner footer) but now share `publicFooterLinks` and `SITE_YEAR`, so link sets and the year cannot drift. Full visual unification is deferred — deleting either footer would remove designed work and is not needed to fix the reported defect. |
| UX-18 | fixed | mobile menu is `role="dialog" aria-modal="true"` with a focus trap, focus moves to the first link, body scroll locks, Escape still restores the trigger. The dialog is a wrapper around a real `<nav aria-label="Mobile">`, so the links keep a navigation landmark instead of losing it to the dialog role. |
| UX-19 | fixed | `/student/resources` paginates 40 per page with `ResourcePager`; filters and sort survive paging. |
| UX-20 | fixed | prose links (`p a`, `li a`, `dd a`, excluding buttons/tap-targets/row-links) are underlined, so colour is not the only cue. |
| UX-21 | fixed | auth brand aside is `inert` as well as `aria-hidden`. |
| UX-22 | fixed | footer caption alpha 0.4 → 0.62. |
| UX-23 | fixed | GSAP `SplitText` splits `aria: "hidden"` with an sr-only copy of the sentence. |
| UX-24 | fixed | `.site-nav-links a` min-height 24px, 8px row gap. |
| UX-25 | fixed | admin roster has an sr-only "Actions" column header. |
| UX-26 | fixed | `/setup` splash has an `h1`, `role="status"` + `aria-live`, a spinner that respects reduced motion, and `aria-busy`. |
| UX-27 | fixed | each filter axis is visibly labelled (`TYPE`, `DOMAIN`), each in its own named nav; `aria-current` no longer looks like one flat group. |
| UX-28 | fixed | register: password show/hide, hint wired through `aria-describedby`, inline per-field errors (form is `noValidate`), consent `required` + described error. |
| UX-29 | fixed | `/about` badge card is a labelled `group`; the real "Show back/front" button is the only flip control and the only tab stop. |
| UX-30 | fixed | `mobileNav` derives its four verb slots from `studentNav` (Challenges/Community are explicit leaf leads), so phone and desktop share one source. |
| UX-31 | fixed | roadmap summary rail no longer repeats "X of Y complete" (hero owns it); the rail keeps only linked reading time. |
| UX-32 | intentional | homepage above-the-fold is a deliberate cinematic entry; recorded here so the decision stays conscious. |
| UX-33 | fixed | every `<Link>` in `app/` and `components/` now sets `prefetch={false}` (verified: 0 missing). |
| UX-34 | fixed | FAQ card titles are `h2` under the section `h1` (no skipped level). |
| UX-35 | fixed | each marquee row has a Pause/Play button (`aria-pressed`), 60s/55s retained; hover/focus pause and reduced-motion stop unchanged. |
| UX-36 | intentional, no code change | `.ycs-word` default opacity is 1; only the scroll reveal sets 0.16, and reduced motion forces 1. A failed reveal leaves readable text. |
| UX-37 | fixed | planner HTML routes render `FeatureOff` inside `AppShell` ("built, not switched on") instead of `notFound()`; planner APIs still 404. |
| UX-38 | kept, documented | `/student/insights` and `/student/privacy` are deliberate redirect aliases with comments saying so. |
| UX-39 | fixed with UX-04 | the roster page reads its counts in the same pass; the dashboard collapse removes the fan-out that dominated the measured delta. |

### Verification

- `npx eslint` across every changed JS/JSX file: 0 errors.
- `npx vitest run`: 1587 passed across 176 files, no test modified.
- `npm run build`: compiles clean.
- Browser sweep against the production build (`.screenshots/ux-audit`): dashboard data intact after the SQL collapse, route progress bar on navigation, no duplicate banners on `/student/roadmap`, one `h1` per page, mobile menu focus + scroll lock, 404s inside the workspace chrome.
- `npx playwright test` (production build, full suite): **457 passed, 9 skipped, 0 failed**. Run with `--workers=4` on this 8 GB machine; an earlier 10-worker run lost one Chromium context mid-sweep (`Target page, context or browser has been closed`) with 1.5 GB free RAM. The affected spec passes alone, on repeat, and in the 4-worker full run.
- Harness corrections found while verifying (the tests were racing the app, not failing it):
  - `public.spec.js`: the "settled page" guard accepted a body with **zero** `h1` (`<= 1`), so the home assertion could run before streaming finished and then see the hidden + visible copy at once. It now requires exactly one `h1` with text, no `aria-busy`, held across two checks 150 ms apart.
  - `home-redesign.spec.js`: the lazy domain carousel remounts once after its chunk resolves; `scrollIntoViewIfNeeded()` on the detached node throws without retrying, so that one action is wrapped in `toPass()`.
  - `student-audit.spec.js`: project/event/contest detail routes were pinned to seed uuids that no longer exist (the tenant currently has **0 contests**), so the sweep 404'd on data, not on code. Detail ids are now discovered from the live list pages, and the event hand-off test skips honestly when there is no event.
  - `public.spec.js` (product change, not harness drift): sign-out is asserted as a **button** because UX-02 replaced the GET link with a POST form. Same accessible name, safer method.
