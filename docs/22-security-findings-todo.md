# Security findings — deferred work

Source: **"Security Testing — LOOM"** by the Cybersec Department (Mayank Somvanshi & Rajput). This file tracks the findings that were **not** fixed in the 2026-10 remediation pass, so they are not lost. Everything else from that report was fixed (see the closing table).

> **Status: NOT IMPLEMENTED.** These are recorded, not done. Do not assume the site is protected against them.

---

## V1 — Account takeover by repeated username changes  🔴

**Finding.** `user_profiles.username` is unique and is the public identity (`/student/<username>`, `/u/<username>`). A user can rename themselves as often as they like. Names are freed the instant they are changed, and a deleted account's name is freed immediately, with no tombstone. An attacker can therefore:
1. rename away from a name (freeing it), or wait for an account to be deleted, then
2. rename *into* that freed name and impersonate the original holder across `/student/<name>` and their shared card.

**Where it lives.**
- `app/api/social/profile/route.js:26` — `PUT`, the only username writer (`ON CONFLICT (user_id) DO UPDATE`).
- `app/(app)/student/[username]/ProfileBits.jsx` (`ProfileEditor`) and `app/(app)/student/discover/DiscoverBits.jsx` (`UsernameForm`) both call it.
- `load/migrations/010_events_social.sql:61` — `user_profiles` (no cooldown column, no change counter); unique constraint `user_profiles_username_key`.
- The route calls **no** rate limiter; the generic `lib/rate-limit.js` is not wired here.

**Proposed fix (not started).** New migration `040_username_change_limits.sql`:
- `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;`
- `ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS username_change_count integer NOT NULL DEFAULT 0;`
Enforce in the `PUT` handler: allow the first claim freely, then reject a change within a cooldown window (e.g. 14 days) and/or past a fixed count, returning `429 USERNAME_CHANGE_LIMIT`. Optionally keep a `renamed_usernames` tombstone table so a recently released name is not immediately claimable. Add a unit test that a second rename inside the window is rejected.

**Rationale for deferral.** Touches identity/auth behavior; product owner chose to hold it.

---

## V2 — Spam accounts via temporary email providers  🔴

**Finding.** Registration accepts any syntactically valid email. There is no disposable/temp-mail blocklist, so anyone can create dozens of throwaway accounts that become dead rows once the temp inbox expires.

**Where it lives.**
- `app/api/auth/register/route.js:8` — `email: z.string().email().max(320)` (format only; rate-limited 5/hr per IP at `:24`).
- `lib/auth-client.js:26` — `signUp()` → `POST /api/auth/register`.
- `app/(auth)/register/page.jsx` — client form; placeholder says "college email" but no domain is enforced.
- No domain allowlist and no MX/verification check anywhere (repo-wide search found none).

**Proposed fix (not started).**
- Add `lib/email-guard.js` with a curated disposable-domain list + `isDisposableEmail(email)` (keep it in-repo; no new dependency).
- Reject in `POST /api/auth/register` with `422 DISPOSABLE_EMAIL` before `supabase.auth.signUp`.
- Optionally add MX-record verification and/or restrict to the chapter's college domains.
- Add tests for known temp domains and for a normal college address.

**Note.** The register form also advertises `minLength={6}` while the API schema requires 8 (`register/page.jsx:120` vs `route.js:9`). That mismatch is cosmetic but should be reconciled in the same change. Deferred with this item.

**Rationale for deferral.** Touches auth/registration; product owner chose to hold it.

---

## Fixed from the same report (for traceability)

| Finding | Resolution | Commit subject |
|---|---|---|
| Shareable card broken / gibberish placeholder | `cardData.js` dropped `user_id` from its SELECT; restored | `Public card: load the builder card instead of the not-found placeholder` |
| GitHub handle accepts random characters | `validGithubHandle` in `lib/content-safety.js`, enforced in `PUT /api/social/profile` | `Profile: screen GitHub handles, LinkedIn links and bios` |
| LinkedIn accepts any URL | `isLinkedInUrl` (linkedin.com only) | same |
| Bio accepts profanity/gibberish | `findUnsafeText` profanity screen | same |
| Feature requests show unapproved/abusive ideas immediately | Page now shares the API's status filter; submissions screened | `Feature requests: hide unapproved ideas and screen submissions` |
| No snippet search quality (matched inside code) | Search now title/description/language | `Snippets: author edit/delete, syntax highlighting, and search fix` |
| No edit/delete of a published snippet | `PATCH`/`DELETE /api/community/snippets/[id]` (author-scoped, soft-hide) | same |
| No code syntax highlighting | `lib/highlight.js` + server `CodeBlock` | same |
| Can't remove / opt out of endorsements | Recipient `DELETE` + `endorsements_visible` opt-out (migration 039) | `Endorsements: let recipients remove them and opt out` |
