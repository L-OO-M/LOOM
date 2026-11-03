// Deploy-time environment validation.
//
// WHY THIS IS A SEPARATE MODULE
// `assertProductionSecrets()` in lib/env.js is the single source of truth for
// "is this deployment safe to serve?". It used to have exactly one caller (the
// GitHub webhook), so the site could boot with placeholder secrets and only
// fail when someone happened to hit that one route. This module exists so the
// runtime can call the same check at boot (and so health checks and deploy
// scripts can share it) without duplicating the rules or editing lib/env.js.
//
// WIRING: root instrumentation.js calls this when a nodejs server instance
// starts. The production BUILD phase is deliberately skipped (a build box may
// not hold runtime secrets); a serving instance still fails closed.
//
// Never call assertDeployEnv()/validateDeployEnv() at module scope in a file
// that client components can import: lib/env.js is intentionally importable on
// the client, and the check must only run on the server at boot.

import { assertProductionSecrets } from "./env";

/**
 * Non-throwing variant for health probes and deploy scripts.
 * Returns { ok, problems } and is a no-op outside production.
 */
export function validateDeployEnv() {
  if (process.env.NODE_ENV !== "production") {
    return { ok: true, problems: [] };
  }
  try {
    assertProductionSecrets();
    return { ok: true, problems: [] };
  } catch (error) {
    return {
      ok: false,
      problems: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Throwing variant for a boot hook. Delegates to lib/env.js so there is exactly
 * one definition of a required/placeholder secret.
 */
export function assertDeployEnv() {
  assertProductionSecrets();
}
