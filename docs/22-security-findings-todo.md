# Security findings — deferred work

Source: **"Security Testing — LOOM"** by the Cybersec Department (Mayank Somvanshi & Rajput). This file tracks the findings that were **not** fixed in the 2026-10 remediation pass, so they are not lost. Everything else from that report was fixed (see the closing table).

> **Status: BOTH FINDINGS FIXED.** V1 and V2 were implemented after the audit;
> this file is kept for traceability. The current enforcement is described under
> each finding and pinned by the named test.

---

## V1 — Account takeover by repeated username changes  ✅ fixed

**Finding.** `user_profiles.username` is unique and is the public identity
(`/student/<username>`, `/u/<username>`). A user could rename as often as they
liked, so a handle could be released and re-claimed to impersonate its previous
holder.

**Enforcement now.**
- `load/migrations/064_username_change_limits.sql` adds
  `username_changed_at timestamptz` and `username_change_count integer NOT NULL
  DEFAULT 0` (with a non-negative check).
- `app/api/social/profile/route.js` (`PUT`) allows the first card freely, then
  rejects a rename inside a 30-day cooldown with `409 USERNAME_COOLDOWN` and a
  rename past five changes with `403 USERNAME_CHANGE_LIMIT`. Unchanged handles
  do not consume a change.
- The route is rate-limited through `lib/rate-limit.js` (`durable: true`).
- `tests/username-change.test.js` covers the first claim, cooldown, post-cooldown
  increment, unchanged handle, lifetime cap, and the taken-name check.

**Still open:** an optional `renamed_usernames` tombstone so a released name is
not instantly claimable. Not required for the cooldown/cap fix.

---

## V2 — Spam accounts via temporary email providers  ✅ fixed

**Finding.** Registration accepted any syntactically valid email, so anyone
could create throwaway accounts that became dead rows once the temp inbox
expired.

**Enforcement now.**
- `lib/auth-server.js` holds the in-repo disposable-domain list and
  `isDisposableEmail()`; `POST /api/auth/register` rejects a known throwaway
  domain with `DISPOSABLE_EMAIL` before creating the account.
- API and client both require an 8-character minimum password.
- Covered by the registration/email-guard tests in the unit suite.

**Still open (optional, product decision):** MX-record verification and/or a
chapter college-domain allowlist. Neither is required for the disposable-domain
fix.

---

## Fixed from the same report (for traceability)

| Finding | Resolution | Commit subject |
|---|---|---|
| V1 repeated username changes | migration 064 + cooldown/limit in `PUT /api/social/profile` | `Profile: bound username changes` |
| V2 disposable email signups | `lib/email-guard.js` + 8-char minimum | `Auth: reject disposable email domains` |
| Shareable card broken / gibberish placeholder | `cardData.js` dropped `user_id` from its SELECT; restored | `Public card: load the builder card instead of the not-found placeholder` |
| GitHub handle accepts random characters | `validGithubHandle` in `lib/content-safety.js`, enforced in `PUT /api/social/profile` | `Profile: screen GitHub handles, LinkedIn links and bios` |
| LinkedIn accepts any URL | `isLinkedInUrl` (linkedin.com only) | same |
| Bio accepts profanity/gibberish | `findUnsafeText` profanity screen | same |
| Feature requests show unapproved/abusive ideas immediately | Page now shares the API's status filter; submissions screened | `Feature requests: hide unapproved ideas and screen submissions` |
| No snippet search quality (matched inside code) | Search now title/description/language | `Snippets: author edit/delete, syntax highlighting, and search fix` |
| No edit/delete of a published snippet | `PATCH`/`DELETE /api/community/snippets/[id]` (author-scoped, soft-hide) | same |
| No code syntax highlighting | `lib/highlight.js` + server `CodeBlock` | same |
| Can't remove / opt out of endorsements | Recipient `DELETE` + `endorsements_visible` opt-out (migration 039) | `Endorsements: let recipients remove them and opt out` |
