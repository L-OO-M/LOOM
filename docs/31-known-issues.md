# Known issues and temporary switches

Things that are deliberately turned off or known to be broken, with the exact
switch that controls them. Anything here is a current fact, not a plan.

---

## 1. GitHub sign-in is hidden on `/login` and `/register`

**Status:** hidden (temporary)
**Since:** 22 November 2026
**Switch:** `NEXT_PUBLIC_GITHUB_SIGNIN` (`lib/auth-providers.js`)
**Affects:** the "Continue with GitHub" and "Sign up with GitHub" buttons only

### What is hidden

The two social sign-in buttons. Nothing else.

### What still works, unchanged

| Piece | State |
|---|---|
| Auth0 GitHub social connection (`con_1kj3ynKXzsu2byHj`) | still configured and enabled |
| `/auth/login?connection=github` | still routes to GitHub |
| The Auth0 callback and account linking | untouched |
| GitHub as a **linked identity** (`/student/github`, repo sync, webhooks, OSS verification) | fully working, unrelated to sign-in |
| Every existing account created with GitHub | can still sign in by setting an email/password on the same identity |

Hiding the button does not disable the connection. Anyone with a saved
`/auth/login?connection=github` link can still complete the flow.

### Why

GitHub sign-in was taken out of the UI at the operator's request while an
unresolved problem with it is investigated. **The root cause is not yet
established**, so do not describe this as fixed or as a provider outage.

### How to bring it back

```bash
# .env.local and the deployment environment
NEXT_PUBLIC_GITHUB_SIGNIN=1
```

Rebuild (`npm run build`) and redeploy. The value is inlined into the client
bundle at build time, so a restart without a rebuild will not change it.

### How it is tested

`e2e/login.spec.js`, `e2e/public.spec.js` and `e2e/home-redesign.spec.js` assert
the button is **absent** by default. When the flag is turned on, those three
assertions must be flipped back to `toBeVisible()` in the same commit as the
flag change -- otherwise the suite fails against the correct behaviour.

---

## 2. Notifications are in-app only

**Status:** by design, for now

`notify()` writes to the `notifications` table and the shell inbox reads it.
There is no email or push delivery. A member who never opens the app will not
learn that work was assigned to them, a submission was returned, or a decision
was made.

The outbox (`lib/outbox.js`) already retries and deduplicates, so adding a
delivery handler is the missing piece -- not a new system.

---

## 3. The chapter currently has no verified evidence

**Status:** data state, not a bug

At the time of writing: 0 verified roadmap nodes, 0 verified projects, 0 merged
OSS contributions, 0 accepted forum answers. The seat gate (migrations 098-099)
therefore refuses every Core and Head request, correctly. The seats open when
evidence is approved at `/admin/ranking`, not by changing the threshold.

---

## 4. Three accounts are locked out until their email is verified

**Status:** expected behaviour of the verification gate

`kanojiaishit@gmail.com` (a department head), `yoome5218@gmail.com` and
`iamyashgupta55@gmail.com` have `email_verified: false` in Auth0. The
middleware gate refuses email/password sessions until they verify. They can
sign in once the verification link is used.

---

## 5. One duplicate profile remains

**Status:** awaiting an operator decision (destructive)

`iamyashgupta55@gmail.com` has two canonical profiles: `ba21e70e`
(google-oauth2) and `5acc42e0` (auth0, unverified). Merging or deleting one is a
destructive data operation and has not been done.

---

## 6. The product tour and signed-in telemetry have no live E2E coverage yet

**Status:** known coverage gap, not a product switch
**Since:** 24 November 2026
**Affects:** `components/tour/*`, `components/telemetry/Tracker.jsx`,
`POST /api/telemetry`, the Settings usage panel

The Playwright suite runs against the production build with a programmatic
Supabase session, and the tour needs a real signed-in profile whose
`profiles.tour_state` is empty. Locally Auth0 is not configured and the stored
E2E session cookies have expired, so the browser specs cannot reach `/student`
with a live account. What is covered today:

- `tests/telemetry.test.js` - path normalization, allowlist, metadata bounds,
  bot/cross-site rejection, daily key rotation, tour-state patch.
- `tests/telemetry-route.test.js` - tenant from session, anonymous public
  views, opt-out writes nothing, tour completion merges `profiles.tour_state`.
- `tests/tour.test.js` - every step targets a real `data-tour` slot, copy and
  placement are valid, version gating and storage keys.
- `npm run build` compiles the client components; the public E2E suite proves
  the tracker did not break any page or the SEO contract.

The usage dashboard has the same gap: `/admin/analytics` (sections 05-07) and
`/lead/analytics` are server-rendered from `usage_daily` / `tour_daily`, and the
existing E2E session cannot sign in as an admin or a lead locally. Their data
path is covered by `tests/usage.test.js` (arithmetic) and
`tests/usage-rollup.test.js` (writes, idempotency, dry run), and the SQL was run
against the real database by hand. What is not covered automatically is the
rendering: after the first nightly rollup with real traffic, open both pages in
both themes and at 390 px, and confirm the empty state appears on a chapter with
no traffic yet.

Page walkthroughs have the same gap for the same reason. Their copy and routing
are covered by `tests/page-guides.test.js` (every page in `app/(app)` must resolve
an entry, ids must stay unique and tour-shaped, and every named section must
still exist in `app/` or `components/`), and the spotlight vocabulary by
`tests/tour.test.js`, but the overlay itself only renders for a signed-in member:
walk one page per workspace after the next login and confirm it opens on a first
visit, spotlights the sections in order, closes on Skip or Finish, and does not
reappear on the next visit. `GET /api/telemetry` returns only the caller's own
`tour_state`.

Before claiming the tour works for members, do one manual pass after a real
login: first visit opens at Home (~900 ms), Next/Back/Skip behave, Escape
skips, focus stays inside the card, completion survives a hard refresh and a
second device, and Settings -> "Replay the product tour" reopens it. Check both
themes and 390 px width. If a step's target is renamed in `AppShell.jsx`, the
step silently falls back to a centered card - `tests/tour.test.js` is what
catches the mismatch, so keep that test's `known` set in sync.
