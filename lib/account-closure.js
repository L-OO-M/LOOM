import { effectiveRole, termExpired } from "./permissions";

/**
 * Self-service account closure policy (pure, no DB).
 *
 * A closure is not a deletion: the ledger keeps the person's id so past work,
 * contributions and audit rows still make sense, while every identifying field
 * is stripped and the account is deactivated. The rules about who may close
 * themselves live here so the route only has to load the profile and act on the
 * verdict.
 */

export const CLOSURE_PHRASE = "CLOSE MY ACCOUNT";

export const CLOSURE_BLOCKER = Object.freeze({
  ADMIN_HANDOVER_REQUIRED: "ADMIN_HANDOVER_REQUIRED",
  LEADERSHIP_HANDOVER_REQUIRED: "LEADERSHIP_HANDOVER_REQUIRED"
});

export function isClosurePhrase(value) {
  return String(value || "").trim().toUpperCase() === CLOSURE_PHRASE;
}

/** A Head/Co-Head seat that is still live, not one whose term has ended. */
function hasLiveHeadSeat(profile) {
  const memberships = Array.isArray(profile?.memberships) ? profile.memberships : [];
  return memberships.some(
    (m) => m?.level === "dept_lead" && !termExpired(m?.term_end ?? m?.termEnd)
  );
}

/**
 * Why this account may not be closed by its owner right now.
 *
 * Admins and department heads carry a responsibility that cannot be dropped
 * silently: the chapter would lose its last admin, or a department would be
 * left with a seat nobody can fill from the roster. Both must hand over first.
 *
 * @returns {Array<{ code: string, message: string, status: number }>}
 */
export function closureBlockers(profile) {
  const role = effectiveRole({
    role: profile?.role,
    isPlatformAdmin: profile?.isPlatformAdmin,
    roleTermEnd: profile?.roleTermEnd ?? profile?.role_term_end ?? null
  });

  if (role === "admin" || role === "platform_admin" || profile?.isPlatformAdmin) {
    return [{
      code: CLOSURE_BLOCKER.ADMIN_HANDOVER_REQUIRED,
      message:
        "Hand over chapter administration before closing this account. An admin seat is transferred, never abandoned.",
      status: 409
    }];
  }

  if (hasLiveHeadSeat(profile)) {
    return [{
      code: CLOSURE_BLOCKER.LEADERSHIP_HANDOVER_REQUIRED,
      message:
        "Hand over your department Head seat before closing this account. An admin can move the seat, then you can close.",
      status: 409
    }];
  }

  return [];
}

/**
 * Identity columns a closure erases. Listed once so the audit entry can name
 * exactly what was removed instead of claiming a vague "anonymized".
 *
 * Deliberately NOT erased: `user_id` (the ledger key), `tenant_id`, `role`
 * (history), `primary_domain`, verified work, contributions and audit rows.
 */
export const ERASED_IDENTITY_FIELDS = Object.freeze([
  "name",
  "enrollment_number",
  "roll_number",
  "branch",
  "department",
  "year",
  "institution",
  "location",
  "github_username"
]);
