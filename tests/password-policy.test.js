import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

describe("password policy alignment", () => {
  it("uses the API's eight-character minimum in the registration form", () => {
    const page = read("app/(auth)/register/page.jsx");
    expect(page).toContain('hint="At least 8 characters"');
    expect(page).toContain("required minLength={8}");
    expect(page).not.toContain("minLength={6}");
  });

  it("keeps the server minimum at eight characters", () => {
    expect(read("app/api/auth/register/route.js")).toContain("password: z.string().min(8)");
    expect(read("app/api/auth/password/route.js")).toContain("password: z.string().min(8)");
  });
});
