# TODO

## Auth0 popup sign-in (planned, not started)

Goal: clicking "Continue with Auth0" must not replace the current page with the
Auth0-hosted domain. Keep the page open and complete sign-in in a popup while
preserving the existing server-side Auth0 session.

Approach: use the SDK-supported `challengeMode=popup` flow on `/auth/login`.
The callback returns a same-origin `postMessage` page and writes the normal
httpOnly session cookie. No `auth0-spa-js`, embedded credentials, or client-held
tokens.

### Implementation

- [ ] Add `app/(auth)/_components/auth0-popup.js`
  - Build `/auth/login?challengeMode=popup&returnTo=...` from the already
    sanitized redirect.
  - Open a centered popup on the user click.
  - Accept only `event.origin === window.location.origin`,
    `event.data.type === "auth_complete"`, and `event.source === popup`.
  - Handle popup blocked, user closed, and timeout (10-15 minutes).
  - Clean up the message listener, polling timer, and timeout on completion.
- [ ] Add `app/(auth)/_components/Auth0PopupButton.jsx`
  - Keep a real `/auth/login?returnTo=...` href as the no-JS fallback.
  - Show loading and disable repeat clicks while the popup is active.
  - On success, resolve the destination through `/api/profile` (student with
    incomplete onboarding goes to `/student/onboarding`, otherwise
    `homeForRole`), then `router.replace(...)` and `router.refresh()`.
  - If the popup is blocked, fall back to the existing full-page login redirect.
  - On close/timeout/error, show an inline `role="alert"` message with retry.
- [ ] Reuse the password form's post-login destination logic instead of
      duplicating it in `app/(auth)/login/page.jsx`.
- [ ] Contract tests for URL building, redirect sanitization, and message
      origin/type/source validation.
- [ ] E2E: stub `window.open`, click the CTA, and assert the page URL stays on
      `/login` while the popup URL contains `challengeMode=popup`.
- [ ] Update `docs/15-deploy-and-operations.md`: popup mode uses the existing
      `/auth/callback`; no extra Auth0 dashboard URL is required.

### Optional follow-up

- [ ] Branded Auth0 custom domain (`auth.<domain>`): requires Auth0 dashboard
      access, a DNS CNAME, and credit-card verification even on the free plan.
      Set `AUTH0_DOMAIN` to the custom domain and add its callback/logout URLs
      in Auth0. This removes the `*.auth0.com` URL from the popup address bar.

### Verification

- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Targeted E2E: `login`, `public`, `mobile-layout`, `session-persistence`
- [ ] Full production Playwright suite (still outstanding from the previous
      workstream)
- [ ] Real Auth0 login in a popup; needs tenant credentials.
