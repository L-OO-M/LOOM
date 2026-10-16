# Tenant RLS rollout — operator runbook

Tenant isolation is currently enforced **in application code only** (hand-written
`WHERE tenant_id = …` clauses). The database-level backstop is built, verified and
switched off. This file is the exact procedure for switching it on, and switching
it back off.

Read it end to end before starting. Steps 1–3 are safe and reversible; step 4 is the
point of no return, and step 5 is how you come back.

---

## What the switch actually changes

| | Flag OFF (today) | Flag ON |
|---|---|---|
| Request handling connection | owner (`postgres`) | `loom_app` (NOBYPASSRLS) |
| Isolation enforced by | app `WHERE` clauses | app clauses **+** DB policies |
| Cross-tenant read of another chapter's rows | blocked by the clauses | blocked by the clauses **and** the policies |

The flag is read once per request in `lib/auth-server.js`. The next request after the
change already uses the new path.

---

## Prerequisites

- `DATABASE_URL` (owner) and `DATABASE_APP_URL` (`loom_app`) present in the environment.
- Migrations through `035` applied: `npm run db:migrate`.
- An operator with SQL access (Supabase SQL Editor or `psql`) — the final flip is
  deliberately **not** available from the admin UI.

---

## Step 1 — confirm you are starting from a known state

```bash
npm run flag:verify
```

Expect `tenant_rls_enforced: OFF`. If it says `ON`, stop and find out why before
continuing.

## Step 2 — create/refresh the application role credential

Idempotent; safe to re-run.

```bash
npm run rls:role
```

Prints a `DATABASE_APP_URL=postgresql://loom_app.…` line **once** — the password is
generated, never stored in a tracked file. Copy it now.

## Step 3 — verify the policies actually hold

```bash
npm run rls:verify
```

This is the gate. It creates a throwaway tenant and profile, proves that

1. `loom_app` is not superuser and does not have `BYPASSRLS`,
2. RLS is genuinely evaluated for `loom_app` (and demonstrably not for the owner),
3. an unset `app.tenant_id` **denies**, and tenant A cannot read tenant B's row,
4. the flag row exists and says what you think it says.

then deletes the probe rows. It must end `RESULT: PASS`.

If any line fails, **stop**. Do not flip the flag. The failure means the policies are
not in the state the code expects.

## Step 4 — set the environment variable

Add `DATABASE_APP_URL` from step 2 to Vercel for **all three** environments
(Production, Preview, Development), then redeploy.

Nothing changes behaviourally yet: while the flag is off, `getAppSql()` is never
called.

> This is the step people skip, and skipping it is worse than doing nothing.
> `DATABASE_APP_URL` silently falls back to `DATABASE_URL`. If the flag is then
> flipped, requests run on the BYPASSRLS owner connection, every policy stays
> decorative, the admin UI reports enforcement as active, and you have a security
> control that does nothing. The app now **refuses to boot** in that combination
> rather than serving traffic — see `lib/auth-server.js`.

Re-run `npm run rls:verify` after the deploy to confirm the app-side connection is
live.

## Step 5 — flip the flag

```sql
UPDATE public.feature_flags SET enabled = true
 WHERE key = 'tenant_rls_enforced'
   AND tenant_id = (SELECT id FROM public.tenants WHERE slug = 'demo-college');
```

Must be boolean `true`. The code compares with `=== true`, so `'true'`, `1` and `'t'`
all read as **off**.

Only the `demo-college` row (or whatever `DEV_TENANT_SLUG` resolves to) has any
effect. Flipping another tenant's row does nothing.

---

## Rolling back

Any one of these, in order of preference:

```sql
-- 1. SQL (always available)
UPDATE public.feature_flags SET enabled = false
 WHERE key = 'tenant_rls_enforced';
```

Or edit the row in the admin UI — it is shown read-only as "Operator-only" and cannot
be toggled from there.

**Removing `DATABASE_APP_URL` is not a rollback.** The flag stays `true`, the app falls
back to the owner connection, and you lose the boot-time warning that tells you the
control is inert.

---

## Known limits — read before you rely on this

These are true after the switch and are not bugs in the rollout; they are the current
shape of the app.

- **Enforcement is partial by design.** Public pages, `/admin`, `/lead` and
  `/student` dashboards still use the owner connection directly and rely on
  hand-written `WHERE` clauses. RLS covers the scoped request path, not every query.
- **The federation directory is a deliberate exception.** `/student/network` and
  `/api/network` read across tenants on purpose, using `getFederationSql()`. They
  expose anonymised counts and public chapter names only, never member identities.
- **`feature_flags` and `tenant_domains` have no RLS.** They must be readable before a
  tenant is known, so a chapter admin can read every chapter's flags. They hold
  configuration, not member data.
- **Every scoped statement costs a BEGIN/COMMIT round-trip.** This is the known cost
  of `SET LOCAL` and is documented in `lib/db.js`. If it ever shows up in latency,
  fix it with a request-scoped transaction in the route handlers — do not remove the
  scoping.
- **`/admin/flags` can no longer toggle this flag.** That route rejects
  `tenant_rls_enforced` with `OPERATOR_ONLY`.

## Rollback trigger

Revert immediately if you see: 500s on roadmap node completion or resource completion,
an empty federation directory, or missing names in `/admin/analytics`. Those are the
known failure signatures of this switch.

```bash
git log --oneline -5
git revert <rls-commit>
git push origin main
```