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
