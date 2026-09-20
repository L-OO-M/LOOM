import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicPaths = [
  "/",
  "/about",
  "/faq",
  "/events",
  "/login",
  "/register",
  "/setup",
  "/auth/callback",
  "/api/health",
  "/api/chapters",
  "/api/public/events",
  "/api/public/projects",
  "/api/public/departments",
  "/api/admin/check-setup",
  "/api/admin/claim-first",
  "/api/github/webhook"
];

export async function middleware(request) {
  const raw = request.nextUrl.pathname;
  const pathname = raw.length > 1 ? raw.replace(/\/+$/, "") : raw;

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

  // Cookie-local session read — no network round-trip. This is a coarse gate
  // (redirect logged-out navigations); pages and API routes still verify
  // identity with getUser(), which revalidates the JWT against Auth.
  // Previously this called getUser() here too, costing one Singapore
  // round-trip on EVERY navigation for logged-in users.
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
        }
      }
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    // API routes get machine-readable 401; pages get a login redirect.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  // Security headers (P0.5)
  res.headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co; frame-ancestors 'none'");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // HSTS only on https (prod)
  if (request.nextUrl.protocol === "https:") res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: [
    // Never auth-gate framework internals, SEO files, or any static asset in public/
    // (logo, icons, og image, fonts). Without the extension branch, requests like
    // /logo.png fall through to the login redirect and return HTML instead of the file.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|txt|woff2?)$).*)"
  ]
};