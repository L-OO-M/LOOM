# GitHub OAuth — production setup

> What an operator must configure, and in what order. Every value here is
> required for the flows to work; the app refuses to boot in production without
> three of them rather than degrading quietly.

Related: [`docs/20-verified-ranking.md`](20-verified-ranking.md) (what the grant
proves), [`docs/16-github-integration.md`](16-github-integration.md) (webhooks).

---

## 0. The short version

Two **separate** GitHub grants exist and must not be confused:

| | Identity | Repository |
|---|---|---|
| Purpose | "who is this person" | "do they own this repo" |
| Runs through | **Supabase** | **this app** |
| Scopes | `read:user user:email` | `repo read:user` |
| Credentials live in | Supabase dashboard | this app's env |
| Proves a project? | **No** | Yes |

A GitHub **sign-in does not verify projects.** Students must complete the
repository grant separately. The UI says so in both places.

---

## 1. Environment variables (Vercel → Settings → Environment Variables)

Set these on **Production**. Same values for Preview if you test there.

### 1a. The repository grant — required

| Variable | Value | Notes |
|---|---|---|
| `GITHUB_CLIENT_ID` | from your OAuth App | Not a secret. |
| `GITHUB_CLIENT_SECRET` | from your OAuth App | Secret. Never in the repo. |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64 | **See 1b — do not skip.** |

`assertProductionSecrets()` now **throws at boot** if any of these three are
missing, blank, a known placeholder, or — for the key — not exactly 32 bytes
decoded. That is deliberate: a half-configured OAuth App should fail loudly on
deploy, not surface later as "my projects stay pending".

### 1b. Generating the encryption key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **This key is the single most dangerous value in this document.**
> Stored access tokens are sealed with AES-256-GCM under it. **Rotating it makes
> every stored token permanently unreadable** — members must re-link, and any
> project verified only through a repository grant drops back to pending.
> Back it up in a password manager now. Do not put it in a shared doc.

The ciphertext carries an `enc:v1:` prefix so a future rotation is detectable
rather than silent, but there is **no** automated re-seal path yet.

### 1c. Existing variables that must also be set

| Variable | Required because |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Must be your **real HTTPS origin**. It builds the OAuth redirect_uri and the webhook URL. `http://localhost:3000` will not work in production. |
| `GITHUB_WEBHOOK_SECRET` | Passed to GitHub when auto-installing a repo hook, and used to verify its deliveries. Must be ≥16 chars and not `dev-secret`. |
| `CREDENTIAL_SECRET` | Signs the OAuth `state` parameter (CSRF defence). Falls back to the webhook secret if unset, but set it explicitly — rotating one then silently affects the other. |
| `DATABASE_APP_URL` | Must be the `loom_app` role, not the owner, or RLS stays a no-op. |

Your current `NEXT_PUBLIC_APP_URL` is `https://loom-self-omega.vercel.app`.

---

## 2. GitHub OAuth App

[github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.

| Field | Value |
|---|---|
| Application name | `L.O.O.M.` |
| Homepage URL | `https://loom-self-omega.vercel.app` |
| **Authorization callback URL** | `https://loom-self-omega.vercel.app/api/github/oauth/callback` |

Then **Generate a new client secret**.

> ⚠️ The callback URL must match **character for character**, scheme included.
> GitHub does not normalise trailing slashes or http/https, and a mismatch fails
> at step 3 of the redirect with an opaque `redirect_uri_mismatch`.

**No "Request user verification (email)" is needed** — we already receive a
verified email from Supabase's provider.

### Local development

GitHub rejects `localhost` as a callback URL, so the repository grant **cannot
complete locally**. To test it, deploy a preview branch and register
`https://<preview-url>/api/github/oauth/callback` on a **separate** OAuth App.

---

## 3. Supabase — GitHub sign-in (identity only)

Dashboard → **Authentication → Sign In / Providers → GitHub → ON**.

- Callback URL: `https://gbkpocjtcnozihvacmtg.supabase.co/auth/v1/callback`
- Client ID / Secret: **paste the same credentials from §2.**

Supabase requests `read:user user:email` only. That is intended — do **not**
widen it. Repository access stays in this app.

### 3a. Redirect allow-list

Dashboard → **Authentication → URL Configuration → Redirect URLs**, add:

```
https://loom-self-omega.vercel.app/auth/callback
```

Supabase will refuse to redirect to anything not on this list.

### 3b. Equivalent via API

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/gbkpocjtcnozihvacmtg/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "external_github_enabled": true,
    "external_github_client_id": "Ov23li99flXnFnP6skQh",
    "external_github_secret": "YOUR_CLIENT_SECRET"
  }'
```

---

## 4. Turn on the features

Both are **off by default** and must be enabled deliberately.

### 4a. `ranking_verified` — verified standings

Currently `false` for every tenant. Until this is on, students still see the
**old self-declared leaderboard**, where nodes and projects were worth 55 of
every 100 points without any verification.

```sql
UPDATE feature_flags SET enabled = true, updated_at = now()
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-college')
  AND key = 'ranking_verified';
```

> Read `docs/20-verified-ranking.md` §6 first. Enabling this **retroactively
> withdraws points** students were shown as earned, because those points came
> from claims nobody verified. Tell them before you flip it.

### 4b. `github_integration` — webhook ingestion

```sql
UPDATE feature_flags SET enabled = true, updated_at = now()
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo-college')
  AND key = 'github_integration';
```

---

## 5. Turn the ranking flag on *last*

Order matters. Do it after §1–§4, because flipping `ranking_verified` on before
OAuth is live leaves every project permanently pending with no way to resolve
them except manual review.

Recommended sequence:

1. Deploy with env vars set.
2. Confirm **Sign in with GitHub** works on `/login`.
3. Have one member complete the repository grant on `/student/github`.
4. Confirm a project claim now verifies **immediately** (no webhook needed).
5. Then enable `ranking_verified`.

---

## 6. Verify it worked

```bash
# 1. The trust boundary is real (must FAIL with the verified_by message)
psql "$DATABASE_URL" -c "INSERT INTO ranking_events
  (tenant_id,user_id,kind,ref_id,weight,verified_by)
  SELECT id,'probe','project_verified','x',20,NULL FROM tenants LIMIT 1;"

# 2. Migrations applied
node load/migrate.js    # expect: skip 037…, skip 038…

# 3. No unscoped owner connection in request handling
node load/verify-rls.js

# 4. In the UI, /student/github should show "verified by GitHub",
#    and /admin/ranking should show the confirmed project.
```

Health: `GET /api/health` reports configuration problems including the three new
variables.

---

## 7. What students experience

1. **Sign in** → "Continue with GitHub" → identity recorded.
2. **`/student/github`** → "Link GitHub account" → consent screen → identity
   bound to GitHub's **immutable numeric id**, not the renameable login.
3. **Create a project** with a repo URL under their handle → GitHub is asked
   whether they have push access → verified **immediately**.
4. **Webhook auto-installed** (if they hold admin) → future pushes and PRs in
   that repo count automatically.

If they lack admin (org repos), the project still verifies via the grant; only
future event ingestion needs the manual queue at `/admin/ranking`.

---

## 8. Security notes

- **The typed-handle path is gone.** `POST /api/github` no longer writes a
  handle at all. It used to let a student claim someone else's login and absorb
  their commits as their own score.
- **State is HMAC-signed and single-use**, bound to the starting user, expiring
  in 10 minutes. A replayed callback URL cannot complete against another
  account.
- **Tokens are AES-256-GCM sealed.** Plaintext never enters the database.
- **Disconnecting revokes derived proof** — deleting the link deletes the
  `ranking_events` rows that depended on it, otherwise a member could hand their
  token to someone else, unlink, and hand it back.
- **Duplicate webhooks are prevented.** GitHub delivers one payload *per hook*,
  with different delivery ids, so a duplicate hook would silently double-count
  every commit. `ensureWebhook()` lists first and skips.
- **Neither OAuth route is in the middleware allow-list.** Both require a
  session; the webhook is the only public GitHub endpoint.

### Rotate the client secret

It was pasted into a chat transcript during setup, so treat it as exposed.
Rotating it is cheap — only `GITHUB_CLIENT_SECRET` changes, existing grants stay
valid, and members do **not** need to re-link.

**Do not rotate `GITHUB_TOKEN_ENCRYPTION_KEY`** without accepting that every
stored token is lost.