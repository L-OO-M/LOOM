// Shared authenticated session for the E2E suite.
//
// Why this exists: `POST /api/auth/login` is rate limited to 8 attempts per 10
// minutes per IP (app/api/auth/login/route.js). Every authenticated spec used to
// perform its own real sign-in, in both the chromium and mobile projects
// (login.spec.js, drawer-focus.spec.js, student-audit.spec.js), which consumed
// that budget. When a run was slow enough for those attempts to land inside one
// window, whichever spec ran ninth failed in `waitForURL` with the login form
// still showing "Too many requests. Retry after Ns" -- a self-inflicted flake
// that had nothing to do with the code under test.
//
// Now `e2e/auth.setup.js` signs in once per run and writes the storage state
// here, and the specs that only need "a signed-in student" load it. login.spec.js
// deliberately keeps its own real sign-in: that spec is the login regression
// test, so its whole point is to exercise the endpoint.
//
// The file holds a live session cookie, so `e2e/.auth/` is gitignored.
const path = require("node:path");
const fs = require("node:fs");

const AUTH_STATE_FILE = path.join(__dirname, ".auth", "student.json");

function hasAuthState() {
  // Credentials must be present too: a stale file from an earlier run must not
  // silently authenticate a suite that is supposed to skip without credentials.
  return Boolean(process.env.E2E_LOGIN_EMAIL && process.env.E2E_LOGIN_PASSWORD) && fs.existsSync(AUTH_STATE_FILE);
}

module.exports = { AUTH_STATE_FILE, hasAuthState };
