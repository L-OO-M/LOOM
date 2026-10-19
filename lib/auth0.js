import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Single server-side Auth0 client -- the login/signup front door.
//
// The SDK reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET
// and (optionally) APP_BASE_URL from the environment, and mounts the auth routes
// (/auth/login, /auth/logout, /auth/callback, /auth/profile, /auth/access-token)
// via the middleware -- see middleware.js.
//
// FAIL-SAFE: the SDK's constructor throws when credentials are missing. Because
// this module is imported by the Edge middleware, that throw would fail EVERY
// request -- an unconfigured Auth0 must degRade to "Auth0 is off", never to a
// site-wide 500. So when the four credentials are absent we export null, and the
// callers fall back to the Supabase session path (see middleware.js and
// lib/auth-server.js). This is what makes it safe to deploy before the Auth0 env
// vars are set on the host.
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

export const auth0 = configured ? new Auth0Client() : null;
