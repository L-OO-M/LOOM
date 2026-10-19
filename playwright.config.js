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
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120000
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ]
});
