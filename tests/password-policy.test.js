import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

const PASSWORD_FORMS = [
  "app/(app)/student/settings/SettingsClient.jsx",
  "app/(app)/student/onboarding/_components/OnboardingForm.jsx"
];

describe("password policy alignment", () => {
  it("ships no in-app registration form of its own", () => {
    // Auth0 owns the credential and its policy; a second form would be a second
    // set of rules that drift apart.
    const page = read("app/(auth)/register/page.jsx");
    expect(page).not.toContain('type="password"');
    expect(page).toContain("Sign up with GitHub");
    expect(page).toContain("Sign up with email or username");
  });

  // The server used to hardcode eight characters while the Auth0 connection
  // required fifteen and a username, so every "add a password" attempt was
  // rejected as "use a stronger password". The rule now comes from the tenant.
  it("takes the server minimum from the tenant policy, not a literal", () => {
    const route = read("app/api/auth/password/route.js");
    expect(route).toContain("z.string().min(PASSWORD_MIN_LENGTH)");
    expect(route).not.toContain(".min(8)");
  });

  it("advertises the live minimum in both password forms", () => {
    for (const path of PASSWORD_FORMS) {
      const source = read(path);
      expect(source).toContain("security?.passwordMinLength");
      expect(source).not.toContain("minLength={8}");
      expect(source).not.toContain("at least 8 characters");
    }
  });

  it("keeps each client fallback equal to the server constant", () => {
    const server = read("lib/auth0-management.js");
    const match = server.match(/export const PASSWORD_MIN_LENGTH = (\d+);/);
    expect(match).not.toBeNull();
    for (const path of PASSWORD_FORMS) {
      expect(read(path)).toContain(`DEFAULT_PASSWORD_MIN_LENGTH = ${match[1]};`);
    }
  });
});
