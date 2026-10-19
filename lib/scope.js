/**
 * Domain (vertical) scope for lead-section records.
 *
 * The permission matrix says a lead runs their own domain. That is easy for a
 * vertical lead (`profiles.vertical`), less obvious for a department head, who
 * owns the verticals their departments belong to. This module is the single
 * place those rules live so every lead route filters the same way.
 *
 * Pure functions — no DB. Callers pass the request-context profile, whose
 * memberships already carry each department's `vertical`.
 */

import { isAdmin } from "@/lib/permissions";

const VERTICALS = new Set(["technical", "non_technical"]);

export function isVertical(value) {
  return VERTICALS.has(value);
}

/** Verticals the profile may act in. Admins get the wildcard. */
export function ownedVerticals(profile) {
  if (!profile) return new Set();
  if (isAdmin(profile)) return { all: true };
  if (profile.role === "vertical_lead" && isVertical(profile.vertical)) {
    return new Set([profile.vertical]);
  }
  return new Set(
    (profile.memberships || [])
      .map((m) => m.vertical)
      .filter((v) => isVertical(v))
  );
}

/**
 * Can this lead touch a record in `vertical`? A null vertical means a
 * society-wide record, which only an admin may create or edit.
 */
export function canAccessVertical(profile, vertical) {
  const owned = ownedVerticals(profile);
  if (owned.all) return true;
  if (vertical == null) return false;
  return owned.has(vertical);
}

/** Society-wide writes stay admin-only across the lead section. */
export function canManageSocietyWide(profile) {
  return isAdmin(profile);
}
