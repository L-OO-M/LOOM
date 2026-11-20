import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

describe("password policy alignment", () => {
  it("ships no in-app registration form of its own", () => {
    // Auth0 owns the credential and its policy; a second form would be a second
    // set of rules that drift apart.
    const page = read("app/(auth)/register/page.jsx");
    expect(page).not.toContain('type="password"');
    expect(page).toContain("Sign up with GitHub");
    expect(page).toContain("Sign up with email or username");
  });

  it("keeps the server minimum at eight characters for password changes", () => {
    expect(read("app/api/auth/password/route.js")).toContain("password: z.string().min(8)");
  });
});
