import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// These are structural regression tests, not behavioural ones. The bug they
// guard against -- middleware reading the session but never writing the
// refreshed cookies back -- is invisible to unit tests and to the whole E2E
// suite, because every test signs in fresh inside one browser session. It only
// shows up when a user returns after the access token has expired.
const middleware = readFileSync("middleware.js", "utf8");
const serverClient = readFileSync("lib/supabase/server.js", "utf8");

describe("session persistence", () => {
  it("refreshes the session in middleware instead of only reading it", () => {
    // getSession() is a cookie-local read with no network call: it can never
    // renew an expired token.
    expect(middleware).toContain("supabase.auth.getUser()");
  });

  it("writes refreshed cookies onto the response, not just the request", () => {
    expect(middleware).toContain("supabaseResponse.cookies.set(");
    expect(middleware).toMatch(/supabaseResponse\s*=\s*NextResponse\.next\(\{\s*request\s*\}\)/);
  });

  it("returns the response carrying the refreshed cookies", () => {
    expect(middleware).toContain("return supabaseResponse;");
  });

  it("preserves the refreshed cookies across a login redirect", () => {
    // Cookies are copied FROM the (possibly refreshed) response TO the redirect.
    expect(middleware).toMatch(
      /supabaseResponse\.cookies\.getAll\(\)[\s\S]{0,120}redirectResponse\.cookies\.set\(/
    );
  });

  it("does not pin the session cookie to sameSite=strict", () => {
    // strict withholds the cookie on cross-site navigations (bookmarks, shared
    // links, returning from Supabase), which reads to users as "logged out".
    expect(serverClient).not.toMatch(/sameSite:\s*"strict"/);
    expect(serverClient).toMatch(/sameSite:\s*"lax"/);
  });

  it("keeps Supabase's maxAge so the session outlives the tab", () => {
    // The options spread must come first so upstream maxAge is not clobbered.
    expect(serverClient).toMatch(/\.\.\.options,[\s\S]*sameSite/);
  });

  // Regression guard. A `getSession()` assertion was added after sign-in to
// "wait for the cookie write". It returned null on a fully successful login and
// turned it into a spurious error, locking every user out. Persistence is
// middleware's job, not the client helper's.
//
// The helper now routes through /api/auth/login (so attempts are rate limited),
// so it no longer calls the auth SDK directly -- the invariant asserted here is
// the absence of the assertion, not the presence of a particular call.
it("does not assert on getSession() after a successful sign-in", () => {
  const authClient = readFileSync("lib/auth-client.js", "utf8");
  expect(authClient).not.toContain("Sign in did not produce a session");
  const signInBody = authClient.slice(
    authClient.indexOf("export async function signIn"),
    authClient.indexOf("export async function signUp")
  );
  expect(signInBody).toContain("/api/auth/login");
  expect(signInBody).not.toMatch(/supabase\.auth\.getSession\(\)/);
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
      expect(loading, `${dir}/loading.jsx must pass headingLevel="h2"`).toContain('headingLevel="h2"');
    }
  });

  it("supports a headingLevel override in PageHero", () => {
    const hero = readFileSync("components/landing/PageHero.jsx", "utf8");
    expect(hero).toMatch(/headingLevel:\s*Heading\s*=\s*"h1"/);
    expect(hero).toContain("<Heading");
  });
});