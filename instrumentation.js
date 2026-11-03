// Boot-time environment validation.
//
// Next calls this once per server instance (not per request). Static generation
// also boots a server during `next build`, so skip the build phase: a build box
// may legitimately have no runtime secrets, while a serving instance must not
// start with placeholders.
import { assertDeployEnv } from "@/lib/deploy-env-check";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  assertDeployEnv();
}
