const { test: setup } = require("@playwright/test");

// Operator session for e2e/admin-audit.spec.js.
//
// Same change as e2e/auth.setup.js: the Supabase form that used to produce this
// session no longer exists, and Auth0's hosted login is not automated yet. Gate
// on the same explicit opt-in so the suite skips honestly instead of failing on
// a flow that was deliberately removed.
//
// The operator audit itself is valuable and should come back with the Auth0 test
// identity -- two production 500s lived here unnoticed before it existed.
setup.skip(
  process.env.E2E_AUTH0_READY !== "1",
  "operator E2E needs E2E_AUTH0_READY=1 and an Auth0 admin test identity (see docs/24-auth0-migration.md)"
);
