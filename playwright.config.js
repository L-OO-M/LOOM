import { defineConfig, devices } from "@playwright/test";

// Load .env.local for the test runner too. Next loads it for the app, but the
// Playwright process is separate — without this, E2E_LOGIN_EMAIL /
// E2E_LOGIN_PASSWORD are never visible and every authenticated spec
// (login.spec.js, student-audit.spec.js) silently skips itself, which is how
// the whole student surface ended up with zero runtime coverage.
import "./load/env-local.js";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    // E2E_PROD=1 runs the suite against the production build (`npm run build`
    // must already have run). Default stays dev so CI's e2e job, which does not
    // build, keeps working. Either way an already-listening server is reused.
    command: process.env.E2E_PROD === "1" ? "npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120000
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    // One real sign-in per run, shared with the authenticated specs through
    // e2e/.auth/student.json. Without it the specs each logged in, in both
    // projects, and tripped the login rate limit (8 attempts / 10 minutes per
    // IP) partway through the suite. See e2e/auth-state.js.
    { name: "setup", testMatch: /auth\.setup\.js$/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["setup"] }
  ]
});
