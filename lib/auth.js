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

// Codes the auth callback may put on /login?error=. Only these are shown; an
// arbitrary `error_description` is never reflected, because that is
// provider-controlled text rendered on our own origin.
const AUTH_ERROR_CODES = new Set([
  "access_denied",
  "account_unresolved",
  "auth_callback_failed",
  "auth0_only",
  "provider_disabled",
  "redirect_not_allowed"
]);

const AUTH_ERROR_MESSAGES = {
  access_denied: "Sign-in was cancelled before it finished.",
  account_unresolved:
    "Your sign-in worked, but this account is not attached to a chapter yet. Ask your chapter admin to finish setting it up.",
  auth_callback_failed: "Sign-in could not be completed. Please try again.",
  auth0_only: "Email and password sign-in has been retired. Use GitHub or email/username on the sign-in page.",
  provider_disabled: "GitHub sign-in is not available right now. Sign in with your email or username.",
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
 * Reduce an Auth0 SDK callback error to one of our own codes.
 *
 * The SDK hands the hook an `AuthorizationError` whose `cause` carries Auth0's
 * raw OAuth error. Its `error_description` is provider text (and, for errors
 * such as `access_denied`, may include user input), so it is never rendered:
 * we read it only to classify the failure, then discard it.
 *
 * The case this exists for: a social connection that exists but is not enabled
 * for the application makes /authorize bounce back with
 * `invalid_request / the connection is not enabled`. Without this the SDK's
 * default hook answers with a 500 text page, leaving the member on a raw
 * Auth0 error URL with no way forward.
 */
export function providerCallbackErrorCode(error) {
  const parts = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (typeof current.code === "string") parts.push(current.code);
    if (typeof current.message === "string") parts.push(current.message);
    current = current.cause;
  }
  const text = parts.join(" ").toLowerCase();

  if (text.includes("connection is not enabled") || text.includes("connection not enabled")) {
    return "provider_disabled";
  }
  if (text.includes("redirect_uri") || text.includes("callback url")) {
    return "redirect_not_allowed";
  }
  if (text.includes("access_denied")) {
    return "access_denied";
  }
  return "auth_callback_failed";
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
