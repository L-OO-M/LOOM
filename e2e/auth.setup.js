const { test: setup } = require("@playwright/test");

// The shared authenticated session used to be produced here by filling the
// Supabase email/password form. That form is gone: sign-in completes on Auth0's
// own origin, so obtaining a session now means automating the hosted login page
// and provisioning a dedicated Auth0 test identity for the tenant.
//
// Until that exists, the authenticated suites are gated on an explicit opt-in
// rather than on E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD. Those variables still
// exist in some local .env.local files and would otherwise make the setup try an
// impossible login and fail the whole suite for a reason that is working as
// designed.
//
// Everything unauthenticated still runs: public pages, SEO surfaces, route
// protection, and the login surface itself (e2e/login.spec.js).
setup.skip(
  process.env.E2E_AUTH0_READY !== "1",
  "authenticated E2E needs E2E_AUTH0_READY=1 and an Auth0 test identity (see docs/24-auth0-migration.md)"
);
