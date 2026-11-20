import { NextResponse } from "next/server";
import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { providerCallbackErrorCode, safeRedirectPath } from "@/lib/auth";

// Single server-side Auth0 client -- the login/signup front door.
//
// The SDK reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET
// and (optionally) APP_BASE_URL from the environment, and mounts the auth routes
// (/auth/login, /auth/logout, /auth/callback, /auth/profile, /auth/access-token)
// via the middleware -- see middleware.js.
//
// FAIL-SAFE: the SDK's constructor throws when credentials are missing. Because
// this module is imported by the Edge middleware, that throw would fail EVERY
// request -- an unconfigured Auth0 must degrade to "Auth0 is off", never to a
// site-wide 500. So when the four credentials are absent we export null, and the
// middleware treats every request as signed out. This is what makes it safe to
// deploy before the Auth0 env vars are set on the host.
//
// APP_BASE_URL is intentionally left unset locally so the SDK infers the origin
// from the request Host header: that makes both http://localhost:3000 (dev) and
// http://127.0.0.1:3000 (Playwright) resolve to a callback URL that must be
// registered in the Auth0 application's Allowed Callback URLs.
//
// Auth0 proves WHO someone is. The canonical application user id stays the
// Supabase uid, resolved from the Auth0 `sub` claim in lib/user-identities.js.
const configured = Boolean(
  process.env.AUTH0_DOMAIN &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET &&
  process.env.AUTH0_SECRET
);

/**
 * 302 to a path on this deployment.
 *
 * `ctx.appBaseUrl` is resolved by the SDK for every ordinary callback, but two
 * error paths (a missing/replayed `state`) call the hook with an empty context.
 * A relative Location is valid and keeps the member on whatever host they signed
 * in on, which matters because chapters can be served from their own domain.
 */
function redirectTo(path, appBaseUrl) {
  if (appBaseUrl) return NextResponse.redirect(new URL(path, appBaseUrl));
  return new NextResponse(null, { status: 302, headers: { location: path } });
}

/**
 * Replace the SDK's default callback handler.
 *
 * The default returns `new NextResponse(error.message, { status: 500 })`, i.e.
 * a bare text page on /auth/callback containing Auth0's raw wording. That is
 * exactly what a member sees when a social connection is disabled, and it is a
 * dead end: the URL is Auth0's, not ours, and nothing offers a retry.
 *
 * Instead, every callback failure becomes a redirect to /login with one of our
 * own codes. /login already knows how to render those (authCallbackMessage),
 * so the member lands on a page that offers the other sign-in path.
 *
 * Success keeps the SDK's behaviour but defaults to /auth/continue rather than
 * the site root: the root is the public marketing page, which reads as "signed
 * out" right after a successful sign-in.
 */
async function onCallback(error, ctx) {
  const appBaseUrl = ctx?.appBaseUrl || process.env.APP_BASE_URL || "";

  if (error) {
    const code = providerCallbackErrorCode(error);
    return redirectTo(`/login?error=${encodeURIComponent(code)}`, appBaseUrl);
  }

  const returnTo = safeRedirectPath(ctx?.returnTo) || "/auth/continue";
  return redirectTo(returnTo, appBaseUrl);
}

export const auth0 = configured ? new Auth0Client({ onCallback }) : null;
