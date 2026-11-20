import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Structural regression tests for the auth gate. The failures they guard
// against are invisible to unit tests: a middleware that reads a session but
// never writes the rolled cookie back only breaks a returning user, and one that
// accepts a retired identity provider is a second front door.
const middleware = readFileSync("middleware.js", "utf8");

describe("Auth0 is the only session source", () => {
  it("reads the Auth0 session, rolling it on app pages", () => {
    expect(middleware).toContain("auth0.getSession(request)");
    // Only delegating /auth/* meant the cookie was never rolled elsewhere and
    // members silently expired after the inactivity window.
    expect(middleware).toMatch(/rolled\s*=\s*await auth0\.middleware\(request\)/);
    expect(middleware).toMatch(/rolled\.cookies\.getAll\(\)[\s\S]{0,80}res\.cookies\.set\(/);
  });

  it("no longer builds a Supabase session client", () => {
    // The anon key is public, so a Supabase session was a door around Auth0.
    expect(middleware).not.toContain("createServerClient");
    expect(middleware).not.toContain("supabase.auth.getUser()");
    expect(middleware).not.toContain("supabaseResponse");
  });

  it("lets an Auth0 session through instead of redirecting to /login", () => {
    // The allow branch must return a next() response; a redirect there is the bug.
    expect(middleware).toMatch(/auth0Session\?\.user[\s\S]{0,600}NextResponse\.next\(/);
  });

  it("keeps /auth/signout reachable without a session", () => {
    // Sign-out is a POST from app chrome. The gate used to 307 it to /login
    // (?redirect=/auth/signout) before the handler could clear anything.
    expect(middleware).toMatch(/publicPaths[\s\S]*"\/auth\/signout"/);
  });

  it("answers signed-out API requests with a machine 401", () => {
    expect(middleware).toMatch(/pathname\.startsWith\("\/api\/"\)[\s\S]{0,400}UNAUTHORIZED/);
  });

  it("redirects a signed-out page request to /login with a redirect param", () => {
    expect(middleware).toMatch(/loginUrl\.searchParams\.set\("redirect", pathname\)/);
  });
});

// Found while fixing the above: these boundaries shipped a second <h1>, so any
// streamed public page momentarily had two. Breaks the one-h1 SEO contract and
// the document outline, and made an E2E assertion fail nondeterministically.
describe("public loading boundaries do not claim the page h1", () => {
  const publicDirs = ["app/about", "app/domains", "app/events", "app/faq"];

  it("renders the loading heading below h1", () => {
    for (const dir of publicDirs) {
      const loading = readFileSync(`${dir}/loading.jsx`, "utf8");
      expect(loading, `${dir}/loading.jsx must not claim the page heading`).not.toMatch(/<h1\b/);
      if (/<(?:PageHero|FaqSection)\b/.test(loading)) {
        expect(loading, `${dir}/loading.jsx must lower its rendered heading`).toContain('headingLevel="h2"');
      }
    }
  });

  it("keeps route loading free of retired heroes and duplicate catalogues", () => {
    for (const dir of ["app/domains", "app/events"]) {
      const loading = readFileSync(`${dir}/loading.jsx`, "utf8");
      expect(loading).not.toMatch(/PageHero|DomainsContent|EventsCalendar/);
      expect(loading).toContain('aria-busy="true"');
      expect(loading).toContain('role="status"');
    }
  });

  it("supports a headingLevel override in PageHero", () => {
    const hero = readFileSync("components/landing/PageHero.jsx", "utf8");
    expect(hero).toMatch(/headingLevel:\s*Heading\s*=\s*"h1"/);
    expect(hero).toContain("<Heading");
  });
});
