import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

const ONBOARDING = "app/(app)/student/onboarding/_components/OnboardingForm.jsx";
const SETTINGS = "app/(app)/student/settings/SettingsClient.jsx";
const SECURITY_CARD = "components/loom/AccountSecurityCard.jsx";

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

  it("advertises the live minimum in every password form", () => {
    const onboarding = read(ONBOARDING);
    expect(onboarding).toContain("security?.passwordMinLength");
    expect(onboarding).not.toContain("minLength={8}");
    expect(onboarding).not.toContain("at least 8 characters");

    // The settings "Sign-in methods" card is the other password form and used to
    // hardcode eight characters, so a member was told a password was fine and
    // then rejected by Auth0. It must read the same reported rule.
    const card = read(SECURITY_CARD);
    expect(card).toContain("state.data?.passwordMinLength");
    expect(card).toContain("minLength={minLength}");
    expect(card).not.toContain("at least 8 characters");
  });

  it("keeps each client fallback equal to the server constant", () => {
    const server = read("lib/auth0-management.js");
    const match = server.match(/export const PASSWORD_MIN_LENGTH = (\d+);/);
    expect(match).not.toBeNull();
    expect(read(ONBOARDING)).toContain(`DEFAULT_PASSWORD_MIN_LENGTH = ${match[1]};`);
    expect(read(SECURITY_CARD)).toContain(`|| ${match[1]};`);
  });

  // On 2026-11-24 a member's password was rejected and the whole onboarding save
  // aborted, so the handle was stored but every profile field (and
  // onboarding_completed) was silently dropped. The profile must be written
  // before the optional password, and the password must never return early past
  // it. Settings no longer carries a second password form at all.
  it("writes the profile before the optional password", () => {
    const onboarding = read(ONBOARDING);
    const profileAt = onboarding.indexOf('await fetch("/api/profile"');
    const passwordAt = onboarding.indexOf('await fetch("/api/auth/password"');
    expect(profileAt).toBeGreaterThan(-1);
    expect(passwordAt).toBeGreaterThan(profileAt);
  });

  it("keeps settings to one password surface and writes the profile first", () => {
    const settings = read(SETTINGS);
    // The duplicate form is gone; AccountSecurityCard owns passwords.
    expect(settings).not.toContain('fetch("/api/auth/password"');
    const profileAt = settings.indexOf('await fetch("/api/profile"');
    const cardAt = settings.indexOf("await saveCard()");
    expect(profileAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(profileAt);
  });

  it("reports a rejected password without claiming the profile failed", () => {
    expect(read(ONBOARDING)).toMatch(/onboarding are saved/);
  });
});
