// Website Plan's 5 levels: student (General) < core < dept_lead (Head and
// Co-Head share one tier) < vertical_lead < admin (Super Admin).
// Mentorship capability is NOT a role — it derives from an approved
// mentor_applications row + the mentor bar (lib/mentorship.js).
export const roles = {
  student: ["student"],
  core: ["core", "student"],
  dept_lead: ["dept_lead", "core", "student"],
  vertical_lead: ["vertical_lead", "dept_lead", "core", "student"],
  admin: ["admin", "vertical_lead", "dept_lead", "core", "student"],
  platform_admin: ["platform_admin", "admin", "vertical_lead", "dept_lead", "core", "student"]
};

export function hasRole(user, requiredRole) {
  if (!user || !requiredRole) return false;
  return roles[user.role]?.includes(requiredRole) ?? false;
}

/** Where each level lands after sign-in. Leads open their console, admins
 *  the overview — everyone else the student home. Layouts still enforce
 *  access, so this is convenience, never a gate. */
export function homeForRole(role) {
  if (role === "admin" || role === "platform_admin") return "/admin";
  if (role === "dept_lead" || role === "vertical_lead") return "/lead";
  return "/student";
}

export function requireRole(user, requiredRole) {
  if (!hasRole(user, requiredRole)) {
    return { ok: false, code: "FORBIDDEN", message: "The current user cannot perform this action" };
  }
  return { ok: true };
}

/**
 * Only a relative, same-origin path may be used as a post-login destination.
 *
 * `?redirect=` comes straight from the URL, so without this an attacker could
 * send `/login?redirect=https://evil.example` (or `//evil.example`) and the app
 * would hand the freshly authenticated user to their site. Protocol-relative and
 * absolute URLs, backslash tricks, and anything that resolves to another origin
 * are rejected; the caller falls back to the role-aware home.
 */
export function safeRedirectPath(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const url = new URL(raw, "http://loom.invalid");
    if (url.origin !== "http://loom.invalid") return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

// Codes the Supabase callback may put on /login?error=. Only these are shown;
// an arbitrary `error_description` is never reflected, because that is
// attacker-controlled text rendered on our own origin.
const AUTH_ERROR_CODES = new Set([
  "access_denied",
  "auth_callback_failed",
  "provider_disabled",
  "redirect_not_allowed"
]);

const AUTH_ERROR_MESSAGES = {
  access_denied: "Sign-in was cancelled before it finished.",
  auth_callback_failed: "Sign-in could not be completed. Please try again.",
  provider_disabled: "GitHub sign-in is not enabled right now. Use email and password.",
  redirect_not_allowed: "Sign-in is not configured for this address. Contact your chapter admin."
};

/** Collapse any provider error to one of our own small, safe code set. */
export function safeAuthErrorCode(value) {
  if (typeof value !== "string") return "auth_callback_failed";
  const code = value.trim().toLowerCase();
  return AUTH_ERROR_CODES.has(code) ? code : "auth_callback_failed";
}

/** Human message for /login?error=..., or null when no error was reported. */
export function authCallbackMessage(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return AUTH_ERROR_MESSAGES[safeAuthErrorCode(value)];
}

/**
 * May an Auth0 identity be matched to an existing account by email?
 *
 * Linking on an UNVERIFIED email is an account-takeover primitive: anyone who
 * can create an Auth0 account claiming victim@college.edu would inherit the
 * victim's canonical user_id (and therefore their profile, role and data). The
 * link is only safe once Auth0 has proven control of the address.
 */
export function canLinkByEmail(user) {
  return (
    typeof user?.email === "string" &&
    user.email.trim().length > 0 &&
    user.email_verified === true
  );
}
