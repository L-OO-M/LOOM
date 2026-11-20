// Shared authenticated session for the E2E suite.
//
// The session is produced once per run by e2e/auth.setup.js and stored here, so
// the authenticated specs do not each perform their own sign-in.
//
// IMPORTANT (Auth0 cutover): sign-in now completes on Auth0's hosted Universal
// Login, so producing this file requires an Auth0 test identity and automation
// of that page. Until that exists the setup and the specs that consume it skip
// unless E2E_AUTH0_READY=1 is set. Everything unauthenticated still runs.
//
// The file holds a live session cookie, so `e2e/.auth/` is gitignored.
const path = require("node:path");

const AUTH_STATE_FILE = path.join(__dirname, ".auth", "student.json");
// Operator session for e2e/admin-audit.spec.js (see e2e/admin.setup.js).
const ADMIN_STATE_FILE = path.join(__dirname, ".auth", "admin.json");

module.exports = { AUTH_STATE_FILE, ADMIN_STATE_FILE };
