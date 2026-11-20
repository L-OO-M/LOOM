# Local & production configuration — one codebase, two origins

> **Goal:** the same checkout serves `http://localhost:3000` and
> `https://www.lets-loom.xyz` with no crossed wires — no local link that points
> at production, no production link that points at a retired host.

Related: [`21-github-oauth-setup.md`](21-github-oauth-setup.md) (the repository
grant), [`24-auth0-migration.md`](24-auth0-migration.md) (Auth0 callbacks),
[`15-deploy-and-operations.md`](15-deploy-and-operations.md) (env var reference).

---

## 0. The canonical origin is `https://www.lets-loom.xyz`

Not the apex. `https://lets-loom.xyz` answers with a **308 to
`https://www.lets-loom.xyz/`** (path preserved), and production
`NEXT_PUBLIC_APP_URL` / `APP_BASE_URL` are both `https://www.lets-loom.xyz`.

That is a deliberate, working setup — do not "fix" it back to the apex half-way.
Everything below is derived from it:

| Surface | Value | Verified |
|---|---|---|
| Apex | `308` → `https://www.lets-loom.xyz/<path>` | ✅ 2026-11-16 |
| Canonical tag on `/` | `https://www.lets-loom.xyz` | ✅ |
| `robots.txt` | `Sitemap: https://www.lets-loom.xyz/sitemap.xml` | ✅ |
| `sitemap.xml` `<loc>` | `https://www.lets-loom.xyz/…` | ✅ |
| Retired `loom-self-omega.vercel.app` | still `200`, canonicals point at `www` | ✅ |
| Auth0 `redirect_uri` sent by the app | `https://www.lets-loom.xyz/auth/callback` | ✅ (also from the old host — proves `APP_BASE_URL` is pinned, not inferred) |
| Supabase `redirect_to` allow-list | **not yet checked** — see §8; needs `SUPABASE_ACCESS_TOKEN` | ⚠️ |
| Supabase GitHub provider | enabled | ✅ |
| `tenant_domains` → `www.lets-loom.xyz` | resolves `demo-college` | ✅ |
| Function region | `x-vercel-id: bom1::bom1` (edge **and** function in Mumbai, next to Postgres) | ✅ |

If someone later makes the apex primary in Vercel, **every registration in
§2–§4 must move with it in the same change** — `NEXT_PUBLIC_APP_URL`,
`APP_BASE_URL`, the GitHub OAuth App callback, Auth0, Supabase, and a redeploy.
Half a move produces `redirect_uri_mismatch`.

---

## 1. What the old configuration got wrong

Measured on 2026-11-16, before the fix:

| Fact | Consequence |
|---|---|
| `NEXT_PUBLIC_APP_URL` was `https://loom-self-omega.vercel.app` in **both** `.env.local` and Vercel | Every canonical, sitemap entry, PoW verify link, calendar link and GitHub `redirect_uri` advertised the retired host. Local dev generated production links. |
| Local and production shared one `GITHUB_CLIENT_ID` / `_SECRET` | An OAuth App has exactly **one** callback URL, so one environment could never complete the repository grant. |
| `tenant_domains` had no row for the real domain | `queryTenantByHost` guessed the slug `lets-loom`, found nothing, and fell through to `DEFAULT_TENANT_SLUG`. It worked by accident. |
| Functions ran in `iad1` (Virginia) while Postgres is `ap-south-1` (Mumbai) | Every sequential query paid a transatlantic round trip. `/api/health` measured 1.8–5.2 s. |

---

## 2. GitHub — two OAuth Apps, not one

`/api/github/oauth/start` and `/api/github/oauth/callback` both build
`redirect_uri` from `NEXT_PUBLIC_APP_URL`, so the registered callback must match
that origin **character for character** — scheme, `www`, path, no trailing slash.

Create at <https://github.com/settings/developers> → **OAuth Apps → New OAuth App**:

| | Production app (existing) | Local app (new) |
|---|---|---|
| Name | `LOOM` | `LOOM Local` |
| Homepage URL | `https://www.lets-loom.xyz` | `http://localhost:3000` |
| Authorization callback URL | `https://www.lets-loom.xyz/api/github/oauth/callback` | `http://localhost:3000/api/github/oauth/callback` |

> ⚠️ **The production callback must say `www`.** Registering
> `https://lets-loom.xyz/api/github/oauth/callback` (the apex) fails even though
> the apex 308s to `www`: GitHub compares the `redirect_uri` the app *sends*
> (`www`) against the registered string (apex) and rejects the request before the
> browser is ever redirected. The failure mode is an opaque
> `redirect_uri_mismatch`.

- Production credentials → **Vercel → Production** only.
- Local credentials → **`.env.local`** only.
- GitHub OAuth *Apps* do accept an `http://localhost:PORT` callback. (Only
  *GitHub Apps* reject `localhost`; earlier revisions of `docs/21` said
  otherwise and were wrong.)

> Sign-in-with-GitHub is a **third** grant and is not this app. It runs through
> Supabase's own provider credentials with the fixed callback
> `https://weqduvtpaoihrmzxnrek.supabase.co/auth/v1/callback`. Do not paste these
> credentials into the Supabase provider settings.

---

## 3. Auth0 allow-lists

<https://manage.auth0.com/> → Applications → Applications → the LOOM application → Settings.

**Allowed Callback URLs**

```text
https://www.lets-loom.xyz/auth/callback
https://lets-loom.xyz/auth/callback
http://localhost:3000/auth/callback
http://127.0.0.1:3000/auth/callback
```

**Allowed Logout URLs**

```text
https://www.lets-loom.xyz
https://lets-loom.xyz
http://localhost:3000
http://127.0.0.1:3000
```

**Allowed Web Origins**

```text
https://www.lets-loom.xyz
https://lets-loom.xyz
http://localhost:3000
http://127.0.0.1:3000
```

Keep the apex entries too: they cost nothing and survive a later switch back to
apex-primary. `127.0.0.1` is not decorative — the Playwright `mobile` project and
`npm run start` checks use it.

`/auth/callback` belongs to the Auth0 SDK (mounted through `middleware.js`).
Supabase's exchange lives at `/auth/supabase-callback` — a **different** URL.

---

## 4. Supabase redirect allow-list

Dashboard → **Authentication → URL Configuration → Redirect URLs**:

```text
https://www.lets-loom.xyz/auth/supabase-callback
https://lets-loom.xyz/auth/supabase-callback
http://localhost:3000/auth/supabase-callback
http://127.0.0.1:3000/auth/supabase-callback
```

Do **not** change the provider callback URL — it stays
`https://weqduvtpaoihrmzxnrek.supabase.co/auth/v1/callback`. These entries are only
where the browser is sent *after* Supabase has authenticated the user.

Verify the provider is on before blaming the redirect:

```bash
curl -s "https://<project-ref>.supabase.co/auth/v1/settings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY" | jq '.external.github'
# false  =>  every GitHub click returns "Unsupported provider: provider is not enabled"
```

---

## 5. Vercel environment variables

Vercel → LOOM project → **Settings → Environment Variables**, scope **Production**:

```env
NEXT_PUBLIC_APP_URL=https://www.lets-loom.xyz
APP_BASE_URL=https://www.lets-loom.xyz
DEFAULT_TENANT_SLUG=demo-college
GITHUB_CLIENT_ID=<production app>
GITHUB_CLIENT_SECRET=<production app>
```

Then **redeploy**. `NEXT_PUBLIC_*` is inlined at build time — changing it in the
dashboard does nothing to the running deployment.

`APP_BASE_URL` must be a bare origin: **no trailing slash, no `:443`**.

Also set **Settings → Functions → Region = Mumbai (`bom1`)**. Without it the
function runs in `iad1` (Virginia) while Postgres is in `ap-south-1` (Mumbai),
and every sequential query pays ~250 ms instead of ~2 ms — measured at
**1.8–5.2 s** for `/api/health` before the pin, **~230 ms** after.

---

## 6. `tenant_domains` — map the real hosts

`lib/db.js` → `queryTenantByHost()` looks up `lower(d.domain) = <host>` and falls
back to `queryTenant(host.split('.')[0])`, which for `lets-loom.xyz` guesses the
slug `lets-loom` — a slug that does not exist. Without a row, the tenant is only
found through `DEFAULT_TENANT_SLUG`, which is configuration that happens to
cover one chapter.

```sql
-- Inspect first.
SELECT t.slug, d.domain, d.is_primary
FROM public.tenant_domains d LEFT JOIN public.tenants t ON t.id = d.tenant_id
ORDER BY d.domain;
```

```sql
-- Additive, idempotent. tenant_domains_domain_unique makes ON CONFLICT safe.
INSERT INTO public.tenant_domains (tenant_id, domain, is_primary)
SELECT tenant_id, d.domain, false
FROM public.tenant_domains,
     (VALUES ('lets-loom.xyz'), ('www.lets-loom.xyz')) AS d(domain)
WHERE tenant_domains.domain = 'loom-self-omega.vercel.app'
ON CONFLICT (domain) DO NOTHING;
```

Notes:

- **Applied on 2026-11-16.** Both rows exist and resolve to `demo-college`.
- Map **both** hosts. The app only ever sees the post-redirect `Host` (`www`);
  the apex row is for the day the redirect changes.
- Keep the `loom-self-omega.vercel.app` row until the old links are drained.
- `is_primary` is **not read anywhere** in application code (only the schema and
  `load/seed-control-plane.js` write it). `localhost` being `is_primary = true`
  is cosmetic — do not "fix" it expecting behaviour to change.
- `localhost` in `tenant_domains` is also cosmetic: `queryTenantByHost`
  short-circuits `localhost` and `127.0.0.1` to `DEV_TENANT_SLUG` before it ever
  queries the table.
- Rollback is a single `DELETE` on the two rows.

---

## 7. Local `.env.local`

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

GITHUB_CLIENT_ID=<LOOM Local app>
GITHUB_CLIENT_SECRET=<LOOM Local app>
```

- Leave `APP_BASE_URL` **unset** locally. The Auth0 SDK then infers the origin
  from `Host`, which is what makes both `localhost:3000` and `127.0.0.1:3000`
  work in one run.
- Leave `DEFAULT_TENANT_SLUG` unset; `DEV_TENANT_SLUG=demo-college` covers local
  resolution.
- `NEXT_PUBLIC_APP_URL` **was applied on 2026-11-16** — verified: local
  canonical, `/sitemap.xml` and `robots.txt` all emit `http://localhost:3000`.

> ⚠️ **Still open:** `.env.local` carries the **same `GITHUB_CLIENT_ID` /
> `_SECRET` and the same `DATABASE_URL` as production.** Until the `LOOM Local`
> OAuth App exists, the local repository grant fails with
> `redirect_uri_mismatch`. And until a separate Supabase project exists, any
> local write — `npm run dev`, seeds, Playwright — is a **production** write.

Use `npm run dev` for local work, not `npm run start`. `next start` only works
after a production build and will bake in whatever `NEXT_PUBLIC_*` that build saw.

### Run E2E against the production build, not the dev server

Dev-mode E2E is several times slower and, on Windows, is the usual reason a
"full suite" takes long enough that people stop running it. The suite supports
both; `E2E_PROD=1` switches the Playwright `webServer` command from `npm run dev`
to `npm run start`:

```powershell
npm run build
Stop-Process -Name node -Force -ErrorAction SilentlyContinue   # free port 3000
$env:E2E_PROD='1'
$env:GITHUB_WEBHOOK_SECRET='local-e2e-webhook-secret-2026-strong'
$env:CREDENTIAL_SECRET='local-e2e-credential-secret-2026-strong'
npx playwright test
```

Two traps, both of which cost a full cycle if you hit them:

- `playwright.config.js` sets `reuseExistingServer: true`. A dev server already
  listening on `3000` will be **reused**, and you will silently test the dev
  build while believing you tested the production one. Free the port first.
- `next dev` overwrites `.next`. Running the suite once in dev mode deletes the
  production build, so the next `E2E_PROD=1` run fails with *"Could not find a
  production build in the '.next' directory"*. Re-run `npm run build` after any
  dev-mode run.

---

## 8. Verification checklist

Run `npm run auth:verify` first — it checks the Auth0 and Supabase allow-lists
against the origins this checkout is configured for, and prints the GitHub
callbacks that must be registered by hand. Add `--fix` to append missing entries
(the merge is append-only; it never deletes a preview or chapter origin).

Exit codes: `0` all verified, `1` missing origins found, `2` some surface could
not be read (nothing is known to be wrong, nothing is proven either).

The script needs two one-time grants. Neither is a deployment secret; both are
script-only credentials.

**Auth0** — the Management API machine-to-machine app must be allowed to read and
write client configuration:

> Auth0 Dashboard → Applications → *(the M2M app)* → APIs → **Auth0 Management
> API** → Authorized Scopes → check `read:clients` and `update:clients` → Update.

Without this the Management API returns `403` and the script reports `BLOCKED`
rather than guessing.

**Supabase** — create a personal access token and put it in `.env.local` as
`SUPABASE_ACCESS_TOKEN` (never in chat, never in a deployment):

> <https://supabase.com/dashboard/account/tokens> → Generate new token.

Then `GET https://api.supabase.com/v1/projects/<ref>/config/auth` returns
`uri_allow_list`, which is the only authoritative source for the Redirect URLs.

**GitHub cannot be automated at all.** OAuth App callback URLs are not exposed by
the REST API (`docs.github.com/en/rest/apps/oauth-applications` documents only
grant and token endpoints; `GET /applications/{client_id}` returns `404` even
with the app's own secret). Register them by hand:

> <https://github.com/settings/developers> → OAuth Apps → *(the app)* →
> **Authorization callback URL**.

An OAuth App holds exactly **one** callback URL, so a single app cannot serve
both local dev and production: two apps are required, one per origin.

**GitHub as a sign-in option is a second switch, not the same one.** The OAuth App
credentials above make the *connection* exist; the connection also has to be
enabled *for this application* (`enabled_clients`). With valid credentials but the
client missing from that list, `/authorize?...&connection=github` answers as if
the connection did not exist and drops the member on Auth0's "Oops" page — the
same response as a misspelt connection name, so the error page cannot tell you
which of the two is wrong.

`npm run auth:github` flips that switch and proves it:

> `npm run auth:github:check` — probe only, no token, no writes. Exit `1`
> while GitHub is still unreachable, `0` once it forwards to github.com.
>
> `npm run auth:github` — adds the LOOM client to `enabled_clients` on every
> GitHub connection in the tenant (additive; no other application loses access),
> then retries the probe. It fails with the exact dashboard path when the M2M
> grant lacks `read:connections` / `update:connections`, and reports the OAuth App
> credentials as the suspect when the client is enabled but GitHub is still not
> reached.

The check mode is a separate npm script rather than `npm run auth:github --
--check`: npm drops forwarded arguments in this checkout (verified — the script
receives none), so the flag has to live in the script definition.

The scope grant lives in the same place as the client scopes above:
Applications → *(the M2M app)* → APIs → **Auth0 Management API** → Authorized
Scopes → tick `read:connections` and `update:connections` → Update.

Anything marked ✅ below was proven by a real request on 2026-11-16.

### Provider state after this pass

Both providers were found pointing **only** at the retired
`loom-self-omega.vercel.app` host, so a real sign-in on `www.lets-loom.xyz`
would have failed today. Corrected on 2026-11-16:

| Provider | Before | After |
|---|---|---|
| Auth0 `lets-loom` callbacks | `loom-self-omega.vercel.app/auth/callback` | + `www`, apex, `localhost:3000`, `127.0.0.1:3000` |
| Auth0 `allowed_logout_urls` | `loom-self-omega.vercel.app/` | + all four origins |
| Auth0 `web_origins` | *empty* | all four origins |
| Supabase `uri_allow_list` | old Vercel callback only | + all four `…/auth/supabase-callback` |
| Supabase `site_url` | `https://loom-self-omega.vercel.app` | `https://www.lets-loom.xyz` |

The old Vercel entries were **kept**. The merge is append-only by design: a
retired host costs nothing to leave in place, while deleting a live preview or
chapter domain breaks a working deployment. Removing them is a human decision.

> ⚠️ **The retired host is not dead — it is still a live deployment.** On
> 2026-11-16 `https://loom-self-omega.vercel.app/` returned `200` and
> `/auth/login` still redirected into Auth0. That makes it a second working
> origin for the same Auth0 application and the same Supabase project.
>
> The risk is not today; it is the day that Vercel project is deleted. Vercel
> subdomains are released when a project goes away, and anyone who then claims
> `loom-self-omega.vercel.app` inherits a callback URL that both providers still
> trust — an authorization code delivered to someone else's server. Either keep
> that deployment alive deliberately, or remove its entries from Auth0
> (`callbacks`, `allowed_logout_urls`) and Supabase (`uri_allow_list`) at the
> same time you delete the project. `--fix` will not remove them for you.


| Check | How | Result |
|---|---|---|
| Apex → `www`, path preserved | `curl -I https://lets-loom.xyz/about` | ✅ `308` → `/about` |
| Canonical is absolute `www` | view-source `/` | ✅ |
| One `<h1>` per public page | `/`, `/about`, `/faq`, `/events`, `/domains` | ✅ all `1` |
| Private pages noindexed | `/login`, `/register` | ✅ `noindex, nofollow` |
| Private routes gated | `/student`, `/admin`, `/lead` | ✅ `307` → `/login?redirect=…` |
| Protected APIs machine-401 | `/api/credentials`, `/api/admin/flags` | ✅ `{"ok":false,"error":{"code":"UNAUTHORIZED",…}}` |
| Public APIs live | `/api/chapters`, `/api/public/events` | ✅ `200` |
| PoW verify link resolves on the right origin | `/verify/credential/<real id>` | ✅ `200`, canonical `www`, old domain absent |
| Supabase `redirect_to` allow-listed | `npm run auth:verify` + `GET /projects/<ref>/config/auth` | ✅ all four origins present in `uri_allow_list`; `site_url` corrected to `www` |
| Auth0 `redirect_uri` correct | `GET /auth/login` | ✅ `https://www.lets-loom.xyz/auth/callback` |
| **Auth0 callback is in the allow-list** | differential probe: allow-listed vs bogus `redirect_uri` | ✅ allow-listed → `302 /u/login`; bogus path on the same host → `403` |
| **GitHub callback is registered as `www`** | one grant on `/student/github` — **no API exists** | ⚠️ **cannot be automated or probed**: a real callback, a fake path and a bogus domain all return the identical `302 → /login`, so validation only happens after sign-in. |
| Latency after region pin | `/api/health` ×5 | ✅ `226–545 ms` (was `1861–5223 ms`) |

Auth0 is now proven by the differential above, not by a config echo: the same
`/authorize` call with the registered callback forwards, and with an
unregistered one on the same host is rejected `403`. Supabase is proven by
reading `uri_allow_list` back from the Management API. GitHub is the single
remaining unproven item and it fails loudly (`redirect_uri_mismatch`) rather
than silently.
