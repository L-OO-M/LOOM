# Auth0 migration for existing Supabase accounts

> **Status: complete (2026-11).** Auth0 is the only sign-in flow. The Supabase
> email/password forms, the client helper, the `/api/auth/{login,register}`
> endpoints, and the server-side Supabase session fallback have all been
> **removed**. There is no cutover flag and no rollback to the legacy form.
> This document is kept as the record of how the migration was performed and as
> the reference for importing accounts exported from an older deployment.
>
> The production tenant was wiped before this cutover: every prior account was
> a test account, and all member-owned rows were deleted. The chapter catalogue
> (domains, departments, roadmap, resources, FAQs, OSS picks, events, planner)
> was retained. After the wipe there were no accounts to import.

The migration path this document describes was **additive and reversible while
it ran**: Supabase stayed available until every existing account had a working
Auth0 path. That end state has now been reached and the reversal path retired.

The app never uses the Auth0 `sub` as the database key. `lib/user-identities.js`
maps every verified Auth0 identity to the existing canonical
`profiles.user_id`, so importing users does not rewrite profiles, projects,
memberships, or audit history.

## Current snapshot

Before the wipe, the database held 17 Supabase `auth.users`, 17 confirmed
addresses, 17 bcrypt `$2a$` cost-10 password hashes (Auth0-importable), and one
linked GitHub identity. **Those were all test accounts and have been deleted**,
so the live database now has 0 `profiles`, 0 `auth.users`, and 0 Auth0 users.
There is nothing left to import.

Auth0 bulk import only accepts bcrypt `$2a$`/`$2b$` hashes with cost `10`. The
script refuses hashes it cannot import and reports how many users would need a
password reset instead.

## Preconditions

Register these callback URLs on the Auth0 application before testing:

- Production: `https://www.lets-loom.xyz/auth/callback`
- Production apex (keep; the apex 308s to `www`): `https://lets-loom.xyz/auth/callback`
- Local: `http://localhost:3000/auth/callback`
- Playwright: `http://127.0.0.1:3000/auth/callback`

Also add the matching logout URLs and web origins. A missing callback URL
produces `Callback URL mismatch` before the email/password form can be trusted,
so fix this first.

Add these to `.env.local` and Vercel:

- `AUTH0_DOMAIN`
- `AUTH0_MANAGEMENT_CLIENT_ID`
- `AUTH0_MANAGEMENT_CLIENT_SECRET`
- `AUTH0_DB_CONNECTION` (default `Username-Password-Authentication`)
- `AUTH0_DB_CONNECTION_ID` (recommended; copy the `con_...` value from the
  Auth0 dashboard database connection URL)
- `AUTH0_MIGRATION_SCOPES` (optional; only if you want the script to resolve the
  connection automatically: `read:users create:users read:connections`)

The M2M app must have at least `read:users` and `create:users`. Password
onboarding separately needs `update:users` and `delete:users`. If the script
cannot read `/connections`, it will tell you to set
`AUTH0_DB_CONNECTION_ID` or grant `read:connections`.

## Run the migration

From the repository root, with the intended `DATABASE_URL` loaded:

```powershell
# 1. Read-only plan. Prints counts only; never emails or hashes.
npm run auth0:migrate:plan

# 2. Export hashed users to .auth0-migration/ (gitignored, contains secrets).
npm run auth0:migrate:export

# 3. Upload. This is the only step that changes Auth0.
$env:AUTH0_DB_CONNECTION_ID='con_...'
npm run auth0:migrate:import

# 4. Compare Supabase emails with Auth0. Exits non-zero if any are missing.
npm run auth0:migrate:verify
```

Useful flags:

```powershell
# Include users who already have any Auth0 identity (skipped by default)
node load/auth0-migrate.mjs export --include-existing

# Omit the Supabase UUID from the Auth0 user_id if Auth0 rejects it
node load/auth0-migrate.mjs export --no-user-id

# Retry a partially completed import with upsert
node load/auth0-migrate.mjs import --confirm --upsert
```

### What the import does

Each exported record contains:

- `email` and `email_verified`
- `password_hash` when the Supabase bcrypt hash is compatible
- `user_id` set to the Supabase UUID (Auth0 stores it as `auth0|<uuid>`)
- `name` when Supabase has one
- `app_metadata.supabase_user_id` for traceability

Users already present in Auth0 by email are skipped by default. This avoids
creating a second Auth0 database identity for someone who already signs in with
Google or GitHub. They continue using their social identity and can add a
password from `/student/settings` after signing in.

## Verify the Auth0 path (historical checklist)

For one migrated password user:

1. Sign out.
2. Go to `/login` and choose **Continue with Auth0**.
3. Sign in with the migrated email/password.
4. Confirm the same profile, role, tenant, and projects load.
5. Confirm `user_identities` now has the Auth0 `sub` mapped to the original
   `profiles.user_id`.

For one existing social user, repeat with Google/GitHub and confirm it still
lands on the same profile.

The gate before removing the fallback was: `npm run auth0:migrate:verify`
reports `missingFromAuth0: 0`, at least one imported password login succeeds,
at least one social login succeeds, password onboarding works from
`/student/settings`, and Auth0's email delivery is configured for password
resets. All four were satisfied before the fallback was deleted.

## Cut over (done)

The deployment now requires these Auth0 variables:

| Name | Value |
|---|---|
| `AUTH0_DOMAIN` | your tenant domain |
| `AUTH0_CLIENT_ID` | existing Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | existing Auth0 application secret |
| `AUTH0_SECRET` | 32+ byte session secret |
| `AUTH0_MANAGEMENT_CLIENT_ID` | M2M client ID |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | M2M secret |
| `AUTH0_DB_CONNECTION` | `Username-Password-Authentication` |
| `AUTH0_DB_CONNECTION_ID` | `con_...` (optional once import is done) |
| `AUTH0_MIGRATION_SCOPES` | optional; safe to remove after import |
| `APP_BASE_URL` | `https://www.lets-loom.xyz` |
| `NEXT_PUBLIC_APP_URL` | `https://www.lets-loom.xyz` |

Rules:

- Never add a `NEXT_PUBLIC_` prefix to any secret.
- Vercel environment changes require a new deployment to take effect.
- Copy the values from `.env.local` or the Auth0 dashboard, not from chat.
- Rotate the M2M secret after any exposure; an already-issued access token
  remains valid until it expires, so treat the exposure window as active.

The legacy Supabase routes are **not** a rollback path any more: they return
`410 AUTH0_ONLY` unconditionally. Removing the old session fallback is what
closed the second door — the public anon key made a Supabase session an
Auth0 bypass for anyone who could reach Supabase's own signup.

## After sign-in: where a member lands

Auth0 completes the OAuth exchange in `middleware.js` and then sends the browser
to the `returnTo` destination. The SDK's default is the site root, and the root
is the public marketing page — a member who had just authenticated arrived
somewhere that looks signed-out. Every Auth0 call to action therefore passes an
explicit `returnTo=/auth/continue`, and `app/auth/continue/route.js` resolves the
account and redirects once:

| Context on arrival | Destination |
|---|---|
| no session / `UNAUTHORIZED` | `/login` |
| `CONSENT_REQUIRED` | `/consent` (which then continues to the role home) |
| `ACCOUNT_SUSPENDED` / `ACCOUNT_DEACTIVATED` | `/account-status?state=…` |
| `PROFILE_NOT_FOUND` / `TENANT_UNRESOLVED` | `/login?error=account_unresolved` (the login page explains it) |
| any unlisted error | `/login` |
| student, onboarding incomplete | `/student/onboarding` |
| student | `/student` |
| `dept_lead` / `vertical_lead` | `/lead` |
| `admin` / `platform_admin` | `/admin` |

Two rules keep this safe:

- Every branch must end in a redirect. A 200 in the middle of a login is a bug.
- A deep link still wins: `/login?redirect=/student/roadmap` sends that path to
  Auth0 as `returnTo`, so the member skips this route entirely.

`tests/auth-continue-route.test.js` pins the table above.

## Password for social sign-ups

Google and GitHub sign-in never create a password identity, so those members
could not later sign in with an email and password. The backend for adding one
already existed (`ensurePasswordIdentity` in `lib/auth0-management.js`,
`POST /api/auth/password`, `GET /api/auth/security`); the missing piece was any
UI that called it.

`components/loom/AccountSecurityCard.jsx` closes that gap and appears on
`/student/settings` and `/admin/settings`. Deliberate constraints:

- It is only **offered** when `hasPassword === false`. Replacing an existing
  password from an open session would turn a stolen cookie into a permanent
  account takeover; those members are pointed at the password-reset link instead.
- It requires a verified email — a password on an unverified address would let
  someone claim an identity they never proved.
- With no Management API credentials it says so rather than showing a button that
  cannot work (`hasPassword: null`).

## Custom domain (optional — not in use)

**Decision (2026-11-16): not using one.** Auth0 requires a **credit card on file**
to issue a free custom domain ("for verification purposes and fraud prevention",
not charged). Without a card the domain cannot be added, and it is not needed for
the path we chose: Universal Login works on the tenant domain
(`lets-loom.jp.auth0.com`) and every callback stays on `www`.

The only cost of skipping it is cosmetic — the address bar shows
`lets-loom.jp.auth0.com` during sign-in — plus one forward-looking caveat: passkeys
are bound to the login domain (`rpId`), so if passkeys are adopted later they will
be scoped to the tenant domain unless a custom domain exists by then.

Do **not** try to fake it with a Cloudflare/Vercel proxy: Auth0 validates a
`cname-api-key` header for proxied domains and that is an Enterprise-only,
self-managed-certificate path.

Universal Login is a redirect to the tenant domain. Adding a custom domain would
not change the sign-in flow; it changes the host in the address bar.

Embedded login (an Auth0 form rendered inside our own page) **would** require a
custom domain, because it calls Auth0 cross-origin from the browser. As verified
on 2026-11-16 that domain is not live:

| Check | Result |
|---|---|
| `Resolve-DnsName auth.lets-loom.xyz` | `216.198.79.1`, `64.29.17.1` — Vercel's anycast IPs, the same pair `www` uses |
| HTTPS to `https://auth.lets-loom.xyz` | `ECONNRESET` before the TLS handshake — no Auth0 edge is answering |
| Auth0 client `lets-loom` callbacks / `web_origins` | no `auth.lets-loom.xyz` entry |

Every `*.lets-loom.xyz` name currently resolves to Vercel, so the DNS record for
an Auth0 custom domain has to be a specific record that overrides that wildcard
and points at the tenant's Auth0 edge. Until it terminates TLS for the name,
embedded login cannot work and turning it on would break the front door.

The runbook below is kept so the step is mechanical if a card is added later.

### Adding the custom domain (Auth0-managed certificate)

DNS for `lets-loom.xyz` is hosted by Vercel (`ns1/ns2.vercel-dns.com`). The
CNAME target is issued per tenant by the dashboard — do not copy one from a blog.

1. Auth0 Dashboard → **Branding → Custom Domains → Add Domain**, enter
   `auth.lets-loom.xyz`, choose **Auth0-managed certificates**. Auth0 requires a
   credit card on file for a free custom domain (not charged).
2. The dashboard shows the CNAME value. In Vercel → **Domains → lets-loom.xyz →
   DNS Records**, add `CNAME auth <value>`. A specific record overrides the
   `*.lets-loom.xyz` wildcard, so this is allowed. Leave TTL at the default and
   do not enable CNAME flattening or a proxy.
3. Click **Verify** in Auth0. The certificate is generated in 1–2 minutes; the
   record must stay in place permanently or renewal fails.
4. **Social connections need their redirect URI updated.** In each provider's
   settings add `https://auth.lets-loom.xyz/login/callback`. If Google is using
   Auth0 **developer keys**, that will not work on a custom domain — create your
   own Google OAuth client first and paste its ID/secret into the connection.
5. App environment, then redeploy:

   | Variable | Value |
   |---|---|
   | `AUTH0_DOMAIN` | `auth.lets-loom.xyz` |
   | `AUTH0_MANAGEMENT_DOMAIN` | `lets-loom.jp.auth0.com` |
   | `APP_BASE_URL` | `https://www.lets-loom.xyz` (unchanged) |

   `AUTH0_MANAGEMENT_DOMAIN` is not cosmetic: Auth0 only accepts the **tenant**
   domain in the Management API audience, so pointing `AUTH0_DOMAIN` at the
   custom domain without it would break password management and
   `npm run auth:verify` while sign-in still looked fine.

6. **Everyone is signed out once.** Sessions created on the old domain are not
   valid on the new one; that is expected, not a regression.

Verify with real requests:

```powershell
# issuer must be the custom domain
Invoke-RestMethod https://auth.lets-loom.xyz/.well-known/openid-configuration | Select-Object issuer
# /auth/login must now bounce to the branded host
node load/verify-auth-config.mjs   # should print the sign-in/tenant note
```

Callback URLs do not move: the app is still served from `www`, so
`https://www.lets-loom.xyz/auth/callback` stays as registered.

## Branding the hosted login page

The sign-in surface is Auth0's Universal Login, not our React code, so branding
is dashboard configuration — there is nothing to deploy.

1. **Branding → Universal Login** — set the logo, page background and primary
   button colour to the LOOM palette (the values in `app/globals.css`:
   ink `#111`, paper `#f4f1ea`, accent `#c2410c`). Keep the default page rather
   than a fully custom one unless there is a reason: a custom page must be
   maintained against Auth0 template changes and can break MFA and
   passkey prompts.
2. **Branding → Universal Login → Customize** — set the page title and the
   "Sign up" copy so the hand-off reads as LOOM, not "Welcome to lets-loom".
3. Leave **embedded login off**. Embedded login needs the custom domain, adds
   cross-origin cookie problems (Safari and Chrome with third-party cookies
   blocked), and gives up Auth0's bot detection and brute-force protection for
   UI that we would then have to keep in sync with every new MFA/passkey screen.
4. **Announce the hop in-app.** `/login` and `/register` print one line under
   the Auth0 button (`app/(auth)/_components/AuthHandoffNote.jsx`): "Sign-in
   continues on our secure Auth0 page, then you come straight back." Branding
   alone does not help someone who was not expecting to leave the site; naming
   the step first does. The copy deliberately avoids printing the tenant host,
   so it stays true once a custom domain replaces `lets-loom.jp.auth0.com`.

The app's own `/login` page stays as the front door and keeps its Auth0
"Continue" button; after this it simply lands on a branded, first-party host.

## Rollback (no longer available)

The legacy form is gone, so there is nothing to flip back to. Rolling back the
application code to a commit before the cutover would restore the Supabase
fallback, which is exactly the second door this change closed; do that only as a
deliberate incident decision, not as a routine option.

Auth0 users can be removed from Auth0 without touching Supabase. Their
`app_metadata.supabase_user_id` identifies them. Do not delete Supabase users
until the Auth0 path has been stable for a full term.

## Cleanup

`.auth0-migration/` contains bcrypt hashes and email addresses. It is ignored by
git. Delete it after the import is verified:

```powershell
Remove-Item -LiteralPath '.auth0-migration' -Recurse -Force
```

Do not upload these files anywhere except the Auth0 bulk-import endpoint.
