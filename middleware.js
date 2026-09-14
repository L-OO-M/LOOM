import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const publicPaths = [
  "/",
  "/login",
  "/register",
  "/setup",
  "/auth/callback",
  "/api/health",
  "/api/chapters",
  "/api/admin/check-setup",
  "/api/admin/claim-first",
  "/api/github/webhook"
];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Exact-match public pages; /api/* is NOT blanket-public (only listed routes).
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // Public credential verification links: /verify/credential/<id>
  if (pathname === "/verify" || pathname.startsWith("/verify/")) {
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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Never auth-gate framework internals, SEO files, or any static asset in public/
    // (logo, icons, og image, fonts). Without the extension branch, requests like
    // /logo.png fall through to the login redirect and return HTML instead of the file.
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:png|jpe?g|gif|webp|svg|ico|css|js|map|txt|woff2?)$).*)"
  ]
};