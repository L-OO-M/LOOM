# Auth0 migration for existing Supabase accounts

This is the controlled path from the Supabase Auth fallback to Auth0 as the
primary identity provider. It is **additive and reversible**: Supabase stays
available until every existing account has a working Auth0 path and
`NEXT_PUBLIC_AUTH0_ONLY=1` is deliberately deployed.

The app never uses the Auth0 `sub` as the database key. `lib/user-identities.js`
maps every verified Auth0/Supabase OAuth identity to the existing canonical
`profiles.user_id`, so importing users does not rewrite profiles, projects,
memberships, or audit history.

## Current snapshot (run again before importing)

The dry run on the current database found:

- 17 Supabase `auth.users`
- 17 confirmed email addresses
- 17 password hashes, all `$2a$` bcrypt with cost `10` (Auth0-importable)
- 0 duplicate email groups
- 1 existing linked GitHub identity

Auth0 bulk import only accepts bcrypt `$2a$`/`$2b$` hashes with cost `10`. The
script refuses hashes it cannot import and reports how many users would need a
password reset instead.

## Preconditions

Register these callback URLs on the Auth0 application before testing:

- Production: `https://loom-self-omega.vercel.app/auth/callback`
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

## Verify before hiding the fallback

For one migrated password user:

1. Sign out.
2. Go to `/login` and choose **Continue with Auth0**.
3. Sign in with the migrated email/password.
4. Confirm the same profile, role, tenant, and projects load.
5. Confirm `user_identities` now has the Auth0 `sub` mapped to the original
   `profiles.user_id`.

For one existing social user, repeat with Google/GitHub and confirm it still
lands on the same profile.

Do not set `NEXT_PUBLIC_AUTH0_ONLY=1` until:

- `npm run auth0:migrate:verify` reports `missingFromAuth0: 0`
- at least one imported password login succeeds
- at least one social login succeeds
- password onboarding works from `/student/settings`
- Auth0's email delivery is configured for password resets

## Cut over

In Vercel → Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_AUTH0_ONLY` | `1` |
| `AUTH0_DOMAIN` | your tenant domain |
| `AUTH0_CLIENT_ID` | existing Auth0 application client ID |
| `AUTH0_CLIENT_SECRET` | existing Auth0 application secret |
| `AUTH0_SECRET` | 32+ byte session secret |
| `AUTH0_MANAGEMENT_CLIENT_ID` | M2M client ID |
| `AUTH0_MANAGEMENT_CLIENT_SECRET` | M2M secret |
| `AUTH0_DB_CONNECTION` | `Username-Password-Authentication` |
| `AUTH0_DB_CONNECTION_ID` | `con_...` (optional once import is done) |
| `AUTH0_MIGRATION_SCOPES` | optional; safe to remove after import |
| `APP_BASE_URL` | `https://loom-self-omega.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | `https://loom-self-omega.vercel.app` |

Rules:

- Never add a `NEXT_PUBLIC_` prefix to any secret.
- Vercel environment changes require a new deployment to take effect.
- Copy the values from `.env.local` or the Auth0 dashboard, not from chat.
- Rotate the M2M secret after any exposure; an already-issued access token
  remains valid until it expires, so treat the exposure window as active.

The legacy Supabase routes remain deployed even when the flag is `1`; the flag
only hides the forms. That is the rollback path.

## Rollback

1. Set `NEXT_PUBLIC_AUTH0_ONLY=0` in Vercel.
2. Redeploy.
3. Existing Supabase password users can sign in through the legacy form again.

Imported Auth0 users can be removed from Auth0 without touching Supabase. Their
`app_metadata.supabase_user_id` identifies them. Do not delete Supabase users
until the Auth0 path has been stable for a full term.

## Cleanup

`.auth0-migration/` contains bcrypt hashes and email addresses. It is ignored by
git. Delete it after the import is verified:

```powershell
Remove-Item -LiteralPath '.auth0-migration' -Recurse -Force
```

Do not upload these files anywhere except the Auth0 bulk-import endpoint.
