import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { isRelaxationDate } from "@/lib/planner";
import { mergeTenantSettings, parseTenantSettings } from "@/lib/tenant-settings";

describe("strict tenant settings", () => {
  it("treats an explicit disabled window as authoritative", () => {
    expect(isRelaxationDate("2026-11-25", {
      relaxation_window: { enabled: false, start: "2026-11-20", end: "2026-12-20" }
    })).toBe(false);
  });

  it("uses tenant-specific inclusive dates", () => {
    const settings = {
      relaxation_window: { enabled: true, start: "2027-01-10", end: "2027-01-12" }
    };
    expect(isRelaxationDate("2027-01-09", settings)).toBe(false);
    expect(isRelaxationDate("2027-01-10", settings)).toBe(true);
    expect(isRelaxationDate("2027-01-12", settings)).toBe(true);
    expect(isRelaxationDate("2027-01-13", settings)).toBe(false);
  });

  it("rejects inverted dates and malformed currency", () => {
    expect(() => mergeTenantSettings(parseTenantSettings(), {
      relaxation_window: { enabled: true, start: "2027-02-02", end: "2027-02-01" }
    })).toThrow();
    expect(() => mergeTenantSettings(parseTenantSettings(), {
      dual_head_approval: { currency: "rupees" }
    })).toThrow();
  });
});

describe("privacy cache and restore verification", () => {
  it("invalidates public passport pages after a privacy update", () => {
    const route = fs.readFileSync("app/api/profile/route.js", "utf8");
    expect(route).toMatch(/revalidatePath\("\/u\/\[username\]", "page"\)/);
  });

  it("restore verification is scratch-only and checks RLS plus grant integrity", () => {
    const script = fs.readFileSync("load/verify-restored-backup.mjs", "utf8");
    expect(script).toMatch(/SCRATCH_RESTORE_DATABASE_URL/);
    expect(script).toMatch(/url === process\.env\.DATABASE_URL/);
    expect(script).toMatch(/relforcerowsecurity/);
    expect(script).toMatch(/cross-tenant\/orphan grants/);
  });
});
