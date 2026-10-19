import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { auth0 } from "@/lib/auth0";

// Paths owned by the Auth0 SDK's middleware (login, logout, OAuth callback,
// profile, token). They MUST be delegated to the SDK -- treating them as public
// (a plain NextResponse.next()) would skip the OAuth code exchange entirely.
//
// /auth/callback is now Auth0's. The Supabase PKCE callback that used to live
// there has moved to /auth/supabase-callback (kept for the legacy GitHub
// sign-in path during the migration).
const AUTH0_PATHS = new Set([
  "/auth/login",
  "/auth/logout",
  "/auth/callback",
  "/auth/profile",
  "/auth/access-token",
  "/auth/backchannel-logout"
]);

const publicPaths = [
  "/",
  "/about",
  "/faq",
  "/events",
  "/privacy",
  "/terms",
  "/contact",
  "/login",
  "/register",
  "/setup",
  "/auth/supabase-callback",
  "/api/health",
  "/api/chapters",
  // Credential endpoints. These MUST be reachable without a session -- that is
  // the whole point -- and they are rate limited inside their own handlers.
  // Leaving them out made every login attempt return the middleware's generic
  // 401 before the route could run.
  "/api/auth/login",
  "/api/auth/register",
  "/api/public/events",
  "/api/public/projects",
  "/api/public/departments",
  "/api/admin/check-setup",
  "/api/admin/claim-first",
  "/api/github/webhook",
  // Alias of /api/github/webhook (see app/api/webhook/route.js). GitHub hooks
  // configured with /api/webhook were being auth-gated here and 401'd.
  "/api/webhook"
];

export async function middleware(request) {
  const raw = request.nextUrl.pathname;
  const pathname = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

  // Auth0 front door: hand its routes to the SDK before anything else. The SDK
  // performs the login redirect, the OAuth exchange, and session refresh; if the
  // request reaches the gating logic below it would be treated as an app page
  // and (for logged-out users) bounced to /login instead of completing auth.
  //
  // `auth0` is null when the Auth0 env vars are not configured (see lib/auth0.js);
  // in that case these paths fall through to the normal Supabase gating, so the
  // app behaves exactly as before Auth0 was introduced.
  if (auth0 && AUTH0_PATHS.has(pathname)) {
    return auth0.middleware(request);
  }

  // The student layout must gate first-run onboarding, but it has no pathname of
  // its own and the onboarding route lives under that same layout — so it has to
  // know the current path to avoid redirecting the onboarding page to itself.
  // Forward it as a request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  // Exact-match public pages; /api/* is NOT blanket-public (only listed routes).
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Public credential verification links: /verify/credential/<id>
  if (pathname === "/verify" || pathname.startsWith("/verify/")) {
    return NextResponse.next();
  }

  // Public shareable profiles: /u/<username> + OG images
  if (pathname === "/u" || pathname.startsWith("/u/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/og/")) {
    return NextResponse.next();
  }

  // Public department pages: /domains/<slug> (active departments only;
  // the page itself returns an honest empty state for unknown slugs).
  if (pathname === "/domains" || pathname.startsWith("/domains/")) {
    return NextResponse.next();
  }

  // Public event detail pages: /events/<id>. The exact "/events" entry above
  // does NOT cover these -- middleware matches by exact string, so without this
  // branch every event detail page auth-gated logged-out visitors to /login.
  // That is backwards: the page exists to recruit people who have no account.
  if (pathname.startsWith("/events/")) {
    return NextResponse.next();
  }

  // Session read + REFRESH.
  //
  // The refresh half used to be missing entirely: getSession() is a purely
  // cookie-local read, so nothing ever renewed the access token, and setAll
  // wrote only to `request.cookies` -- a mutation that dies with the request
  // and is never sent to the browser. So even when Supabase handed back fresh
  // tokens, they were discarded. The browser kept the original, eventually
  // expired pair, and the next visit looked logged out.
  //
  // The response object is created up front so refreshed cookies can be
  // attached to it, and the mutated request is threaded through so downstream
  // handlers see the new values in the same pass.
  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  // getUser() (not getSession) is what validates the JWT with Auth and triggers
  // the token refresh when the access token is near expiry. getSession() alone
  // would keep returning the stale cookie forever.
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    // API routes get machine-readable 401; pages get a login redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    // Carry any refreshed cookies onto the redirect, otherwise a user whose
    // token was refreshed on this request loses it at the hop.
    supabaseResponse.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  // Security headers (CSP, X-Frame-Options, HSTS, ...) are defined once in
  // next.config.mjs `headers()`. That covers static assets and SEO files too,
  // which this middleware's matcher deliberately excludes.
  //
  // Returns the response carrying the refreshed session cookies -- not a fresh
  // NextResponse.next(), which is what silently dropped them before.
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Never auth-gate framework internals, SEO files, or any static asset in public/
    // (logo, icons, og image, fonts). Without the extension branch, requests like
    // /logo.png fall through to the login redirect and return HTML instead of the file.
    //
    // `html` is excluded for the Search Console verification file
    // (public/google<token>.html). Google fetches it as an anonymous crawler;
    // auth-gating it returned a login redirect, so verification silently failed.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|txt|html|woff2?)$).*)"
  ]
};