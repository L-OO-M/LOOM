import crypto from "node:crypto";
import { fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { authorizeUrl, signState } from "@/lib/github-oauth";
import { env } from "@/lib/env";

// Start the repository grant.
//
// Deliberately a GET that 302s rather than a POST: this is a navigation the
// browser is sent to, not a mutation with a body. The state cookie is the only
// thing written, and `maxAge` bounds it to the flow.
//
// This route is NOT in middleware.js `publicPaths`, and must not be. It requires
// a session so that state can be bound to a specific student -- making it public
// would let anyone start a flow whose callback then lands on a stranger's
// account.

const STATE_COOKIE = "loom_gh_oauth";
const STATE_TTL_SECONDS = 600;

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant } = ctx;

  // Fail loudly and legibly rather than redirecting to a GitHub error page: an
  // unconfigured OAuth App is an operator problem, and the student should not be
  // the one diagnosing it.
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return fail(
      "GITHUB_OAUTH_NOT_CONFIGURED",
      "GitHub linking is not configured for this chapter. Ask an admin to set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.",
      503
    );
  }

  // A student may ask to verify specific repositories (from the new-project
  // form) or none at all (from the settings page). Keeping it in the signed
  // state means the callback can never be pointed at a repository the student
  // did not initiate.
  const requested = requestedRepos(request);

  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = signState({ userId: user.id, nonce });

  const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/github/oauth/callback`;
  const target = authorizeUrl({
    clientId: env.GITHUB_CLIENT_ID,
    redirectUri,
    state
  });

  // sameSite=lax is REQUIRED, not a preference. The callback arrives as a
  // cross-site top-level GET from github.com; under `strict` the cookie is not
  // sent and the exchange fails with an opaque "invalid state". `none` would
  // require Secure and widens CSRF exposure for no benefit.
  // The requested repositories travel in the SAME cookie as the nonce, not as a
  // query parameter on the GitHub URL. An unknown parameter is dropped by GitHub
  // and never echoed to the redirect_uri, so appending it here would silently
  // discard the student's selection -- and would also leak their repository
  // names into GitHub's request logs for no benefit.
  const response = new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=${nonce}.${encodeURIComponent(requested.join(","))}; Path=/; Max-Age=${STATE_TTL_SECONDS}; HttpOnly; SameSite=Lax${env.NEXT_PUBLIC_APP_URL.startsWith("https") ? "; Secure" : ""}`
    }
  });
  return response;
}

/**
 * Which repositories to verify in this pass.
 *
 * Bounded and validated BEFORE anything is signed, because this value ends up in
 * a redirect URL and then in GitHub API calls. Unlimited input here would let a
 * caller request thousands of repositories and burn the 5,000/hr rate limit
 * shared across the whole chapter.
 */
function requestedRepos(request) {
  const raw = new URL(request.url).searchParams.get("repos") || "";
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = parts.filter((p) => /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.test(p));
  return [...new Set(valid)].slice(0, 10);
}