/**
 * Auth availability predicates.
 *
 * Deliberately dependency-free and framework-free: middleware.js runs in the
 * edge runtime and must not pull in the database client that lib/auth-server.js
 * needs.
 */

/**
 * Is a Supabase auth failure a transport/server problem rather than "no session"?
 *
 * supabase-js reports a failed fetch as `AuthRetryableFetchError` and an
 * upstream 5xx as an error carrying that status. Both mean "we could not ask",
 * which must never be answered with "you are not signed in". Conflating the two
 * turned one dropped pooler connection into a spurious sign-out: a signed-in
 * student was bounced to `/login?redirect=%2Fstudent%2Fprivacy` while their
 * session cookie was still valid, which is what failed
 * `e2e/student-audit.spec.js`.
 *
 * Keeping this decision in one place means the middleware gate and the server
 * session lookup cannot drift apart.
 */
export function isTransientAuthError(error) {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  if (typeof error.status === "number" && (error.status === 0 || error.status >= 500)) return true;
  return /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|network/i.test(
    error.message || ""
  );
}

/** Machine-readable code so clients can tell an outage from a 401. */
export const AUTH_UNAVAILABLE = "AUTH_UNAVAILABLE";
