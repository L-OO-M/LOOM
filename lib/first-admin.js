// First-admin bootstrap gate.
//
// The first platform admin is the only account that can never be demoted, so
// creating it must not be a race to a public URL. The operator sets
// FIRST_ADMIN_CODE (out of band) and hands it to the founder; /setup submits it
// and app/api/admin/claim-first compares it here.
//
// Server-only: imports node:crypto, so never import this from a client
// component. The setup page learns whether the gate is open via
// GET /api/admin/check-setup.

import { timingSafeEqual } from "node:crypto";

// A shorter code is guessable, so it is treated as "not configured" rather than
// as a weak gate that looks like a real one.
export const MIN_SETUP_CODE_LENGTH = 16;

function configuredCode() {
  return (process.env.FIRST_ADMIN_CODE || "").trim();
}

/** Is online first-admin setup possible on this deployment? */
export function firstAdminSetupEnabled() {
  return configuredCode().length >= MIN_SETUP_CODE_LENGTH;
}

/**
 * Does the submitted code match FIRST_ADMIN_CODE?
 *
 * Compared with timingSafeEqual so a wrong guess cannot be refined by timing.
 * Returns false when the secret is unset or too short, so a deployment without
 * configuration fails closed instead of accepting anything.
 */
export function setupCodeMatches(given) {
  const expected = configuredCode();
  if (expected.length < MIN_SETUP_CODE_LENGTH) return false;
  if (typeof given !== "string") return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(given.trim());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
