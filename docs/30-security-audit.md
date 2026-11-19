# Security audit — 2026-11-18

Scope: can this deployment be crashed cheaply (denial of service) or penetrated
(account takeover, auth bypass, tenant escape, data exfiltration)? This is an
evidence-backed review of the **running production build** plus the code paths
behind it. No destructive testing, no third-party targets, no load generator —
every probe ran locally against `http://localhost:3000`.

## 1. Method

| Step | What ran |
|------|----------|
| Route inventory | Enumerated all 140 `app/api/**/route.js` handlers and derived their URLs |
| Unauthenticated sweep | `GET` every route with no cookie, recorded status + body prefix |
| Authenticated sweep | Signed in as a seeded **student** and repeated the sweep to look for admin-only data |
| Header probe | Read the live response headers for `/` and an unauthenticated API call |
| Body-size probe | Sent a 6 MB JSON body to a public POST route |
| Rate-limit probe | Rotated `x-forwarded-for` vs. a stable value against `/api/auth/login` |
| Dependency audit | `npm audit` and `npm audit --omit=dev` |
| Code review | Auth/session, tenant scoping, SQL construction, uploads, outbound fetches, secrets, cron, rendering sinks |

## 2. What already held (verified, not assumed)

| Control | Evidence |
|---------|----------|
| CSP with a per-request nonce, `object-src 'none'`, `frame-ancestors 'none'` | Live header contained a fresh `'nonce-…'`; policy built in `lib/csp.js`, set in `middleware.js` |
| HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | Present on the live response (`next.config.mjs`) |
| CSRF origin gate on every unsafe `/api` method | `lib/csrf.js`, wired in `middleware.js`; webhook exempt by explicit list |
| Session cookie flags | Live login `Set-Cookie`: `secure`, `httponly`, `samesite`, `path`, `max-age` |
| Tenant isolation | Tenant always resolved server-side (`lib/tenant.js`, `lib/auth-server.js`); `tests/tenant-scoping-gate.test.js` — 32 tests pass |
| Route authorization | Signed-in **student** sweep: **zero** `/api/admin/*` 200s except the intentionally public `check-setup`; 35 endpoints answered 403 |
| Fail-closed permission guard | `lib/requirePermission.js` refuses to call `can()` on a broken context |
| SQL injection | All queries are tagged templates; the only identifier interpolations are `sql(item.table)` / `sql(column)` over constant lists (`lib/scheduler.js`, `lib/tenant-scope.js`) |
| XSS sinks | `dangerouslySetInnerHTML` appears only in `components/seo/JsonLd.jsx`, which escapes `<` as `\u003c`; no `eval` / `new Function` |
| Webhook authenticity | HMAC-SHA256 over raw bytes with `timingSafeEqual`; endpoint closed without a secret |
| Credential/certificate signing | HMAC-SHA256 + `timingSafeEqual` (`lib/credentials.js`, `lib/certificates.js`) |
| Stored GitHub tokens | AES-256-GCM (`lib/crypto.js`), key validated at boot (`lib/env.js`) |
| Email verification tokens | 32 random bytes, stored only as SHA-256, single use, expiring (`lib/email-verification.js`) |
| Cron entry point | `/api/jobs/run` requires `CRON_SECRET`; with no secret it is **closed**, not open |
| Open redirect | `safeRedirectPath()` rejects absolute, protocol-relative, and backslash paths (`lib/auth.js`) |
| Upload policy | MIME + extension allowlist, magic-byte check, 25 MB cap (`lib/media.js`, `lib/storage.js`); private bucket, short-lived signed URLs |
| Link hygiene | Every `target="_blank"` carries `rel` with `noopener`/`noreferrer`; profile links screened (`lib/content-safety.js`) |
| Runtime dependencies | `npm audit --omit=dev` → **0** vulnerabilities |

## 3. Findings fixed in this pass

### F1 — Rate limits were bypassable with a forged `x-forwarded-for` (High)

`lib/rate-limit.js` keyed the bucket on the **first** entry of
`x-forwarded-for`, which is the only part a client fully controls.

Evidence before the fix:

```
B spoofed-xff statuses [401,401,401,401,401,401,401,401,401,401,401,401]   // 12 attempts, never limited
C same-xff statuses    [401,401,401,401,401,401,401,401,429]               // limited on the 9th
```

So every "per-IP" budget in the app was effectively unlimited for an attacker
willing to send a header. Login was the dangerous case: unlimited password
guessing.

Fix: `clientIp()` now prefers headers the edge overwrites
(`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-real-ip`, `fly-client-ip`) and
otherwise takes the **last** `x-forwarded-for` hop — the address the nearest
proxy observed. Because a spoofable header can still be the only input when
`next start` is exposed directly, login and registration also got a **per-account**
budget keyed on a SHA-256 of the email, which no header can reset:

- `/api/auth/login`: 8 / 10 min per IP **+ 30 / 15 min per account**
- `/api/auth/register`: 5 / hour per IP **+ 5 / hour per account**

### F2 — No request body-size cap; megabyte payloads were buffered (High)

Route handlers call `request.json()` / `request.formData()`, which read the
**entire** body into memory before zod validates it.

Evidence before the fix:

```
D 6MB body status 400 {"ok":false,"error":{"code":"VALIDATION_ERROR",…}}
```

A validation error, not a rejection: the 6 MB was accepted, buffered, and
parsed. A few concurrent large POSTs are a cheap way to exhaust a small instance.

Fix: `lib/request-limits.js` defines the policy and `middleware.js` enforces it
before any handler runs:

- 1 MB for JSON APIs
- 27 MB for the three file-upload routes and the signed webhooks (above the
  25 MB upload validator so real files still pass)
- `413 PAYLOAD_TOO_LARGE`, or `400 INVALID_CONTENT_LENGTH` for a malformed length

### F3 — Expensive public endpoints had no budget (Medium)

`/api/public/{departments,events,projects,summary}`, `/api/chapters` and
`/api/health` are unauthenticated and each runs real database work (joins,
subqueries — health runs three queries per call). Nothing stopped a loop from
turning them into a database amplifier.

Fix: a shared 120 requests/minute per-IP durable bucket on each. A real page
view uses a fraction of that, and a monitor polling every 10–30 s stays far
below it.

### F4 — `X-Powered-By: Next.js` fingerprinting (Low)

The header was confirmed on the live server. It tells a scanner which published
advisory list to try. Fix: `poweredByHeader: false` in `next.config.mjs`.

### F5 — Registration leaked whether an email already had an account (Medium)

The route returned `fail("SIGNUP_FAILED", error.message, 400)`, printing
Supabase's `User already registered` verbatim — a clean account-existence
oracle, and a free way to map which students use the site.

It also had a correctness bug: with email confirmation enabled, Supabase does
not error for a taken address; it returns a user row with an **empty identities
array**. That path would have written a consent record against an existing
member's `user_id` and reported success.

Fix:

- one neutral `SIGNUP_UNAVAILABLE` reply for both the error form and the
  identity-less-user form (`409`), with provider detail left in the server log;
- the identity check runs **before** `recordConsent()`, so no consent row is
  written for an account that already exists;
- a per-account budget (F1) makes probing one address expensive.

Residual: a **new** address still creates an account (it must), so an attacker
can distinguish "created" from "not created" at the cost of one signup per
address. The per-account and per-IP budgets bound the rate; complete removal
would require making every signup return an identical response, which needs a
verified-email flow this chapter has turned off.

## 3a. Verification after the fixes

Same probes, re-run against the rebuilt production server:

```
1 x-powered-by: (absent)
2 6MB body: 413 {"ok":false,"error":{"code":"PAYLOAD_TOO_LARGE","message":"Request body is too large"}}
4 rotating-xff login: 31 attempts
4 last four: [401,401,401,429]
5 rotating-xff register: 6 attempts
5 statuses: [409,409,409,409,409,429]
5 first body: {"ok":false,"error":{"code":"SIGNUP_UNAVAILABLE","message":"We could not create an account with
              those details. If you already have an account, sign in instead or reset your password."}}
6 public burst: 121 requests
6 last three: [200,200,429]
7 chapters same IP: 200
```

How to read that:

- **2** — the 6 MB payload that used to be buffered now dies in middleware.
- **4** — rotating a forged `x-forwarded-for` no longer buys anything: the
  per-account budget trips on the 31st attempt. Before the fix the same pattern
  produced unlimited 401s.
- **5** — a taken address gets the neutral message, never the provider's
  "already registered", and the sixth probe is refused.
- **6 / 7** — the public budget is per route: one endpoint throttle does not
  take the rest of the public site down with it.

Note on local topology: with `next start` exposed directly, a single-value
`x-forwarded-for` still becomes the "last hop", so the **IP** part of the budget
remains forgeable in that specific setup. The per-account budgets in 4 and 5 are
the part that holds regardless, which is why they were added. Behind a proxy
that appends its own hop, `clientIp()` returns the address the proxy observed
and the IP budget is meaningful too.

## 3b. One observed failure mode, worth recording

During verification the server logged an unhandled `ECONNRESET` raised inside a
page render (a database read reset by the pooler):

```
⨯ Error: read ECONNRESET  (digest 840550981)
    at ... app/(app)/student/resources/page.js
```

Next.js caught it, returned an error response for that one request, and the
server kept serving (`/api/health` and `/` were still 200 afterwards). So a
reset connection is **not** a process-killer here — but it is a 500 for the
user who happened to hit it, and the same class of failure under a burst would
surface as 500s rather than a crash. Mitigation is the pooler configuration and
the existing error boundaries; no code change was warranted from a single
observed reset. Re-check this if a deployment shows repeated `ECONNRESET`
digests under normal traffic.


## 4. Denial-of-service posture

What the app now does by itself:

- Rejects declared bodies over the path's cap in middleware (`413`) before
  buffering.
- Bounds credential attacks per IP and per account, independent of headers.
- Bounds the public read API at 120/min/IP.
- Keeps every route behind auth except an explicit public allowlist (10 of 140
  handlers, all read-only or bootstrap checks).
- Fails closed on tenant resolution, permissions, cron auth, and config
  problems (`/api/health` reports `degraded`).

What it cannot do from inside Next.js, and therefore needs the platform for:

1. **Volumetric / L3–L4 floods.** Application code never sees these. A CDN/WAF
   (Cloudflare, Vercel Firewall, or the host's equivalent) is the only real
   layer; this repo has no such dependency.
2. **Chunked bodies with no `Content-Length`.** The middleware gate cannot size
   them. The proxy must enforce a body limit too.
3. **Many instances.** In-memory buckets are per process. Set
   `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (both are present but
   **empty** in `.env.local`) or every instance gets its own budget.
4. **Multi-minute floods against one dynamic page.** Caching/CDN rules and
   platform rate limits, not per-route code.

## 5. Operator checklist before this is production-hardened

- [ ] Set durable rate limiting: non-empty `UPSTASH_REDIS_REST_URL` and
      `UPSTASH_REDIS_REST_TOKEN` in the deployment environment.
- [ ] Set `CREDENTIAL_SECRET` (absent locally; `lib/env.js` flags it and
      `/api/health` reports degraded). Generate with
      `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
- [ ] Put a CDN/WAF in front and enforce a request body limit there as well.
- [ ] Confirm the deployment terminates TLS at a proxy that **overwrites**
      `x-forwarded-for` / provides `x-real-ip`. Without one, IP buckets are
      advisory — the per-account budgets are the backstop.
- [ ] Keep `/api/health` monitored; `isolation.effective: false` means the app
      layer is the only tenant boundary (see `docs/rls-rollout-runbook.md`).
- [ ] Rotate any secret that was ever pasted into a chat, ticket, or log.

## 6. Dependency audit (accepted risk)

`npm audit`:

- runtime (`--omit=dev`): **0** vulnerabilities
- dev-only: 16 advisories (11 high, 5 moderate, 0 critical) in the eslint and
  vitest toolchains — `picomatch`/`micromatch`/`tinyglobby` ReDoS and
  `minimatch` glob amplification. These are build/test-time only, never shipped
  to a browser or executed on request paths. Clearing them requires major
  upgrades of `eslint-config-next` / `vitest`; deferred to a dedicated upgrade
  change rather than mixed into a security fix.

## 7. Not changed deliberately

- **SVG uploads are allowed** (`lib/media.js`). Stored objects are served from
  the Supabase Storage origin through signed URLs, not from the app origin, so
  an SVG cannot script this site. If a future change proxies storage through
  the app domain, SVG must be dropped or served with `Content-Disposition:
  attachment` plus a sandboxing CSP.
- **No antivirus scan** on uploads (already documented in `lib/media.js`); the
  mitigation is the allowlist, size cap, private bucket, and signed URLs.
- **No new dependency** was added; every fix uses Node built-ins or code
  already present.
