import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The security report: "THERE'S NO WAY TO remove offensive endorsements
 * voluntarily or to opt out of endorsements." These lock in both controls.
 */

describe("endorsement removal (recipient-controlled)", () => {
  const route = readFileSync("app/api/social/connections/route.js", "utf8");

  it("exposes a DELETE that is scoped to the recipient", () => {
    expect(route).toMatch(/export async function DELETE/);
    expect(route).toMatch(/DELETE FROM user_endorsements/);
    expect(route).toMatch(/endorsee_id = \$\{user\.id\}/);
  });

  it("audits the removal", () => {
    expect(route).toContain("writeAudit");
    expect(route).toContain("removed_endorsement");
  });
});

describe("endorsement opt-out", () => {
  it("adds an endorsements_visible column idempotently", () => {
    const migration = readFileSync("load/migrations/039_endorsement_controls.sql", "utf8");
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS endorsements_visible boolean NOT NULL DEFAULT true/);
  });

  it("persists the flag from the profile form", () => {
    const route = readFileSync("app/api/social/profile/route.js", "utf8");
    expect(route).toContain("endorsementsVisible");
    expect(route).toMatch(/endorsements_visible = COALESCE\(EXCLUDED\.endorsements_visible, user_profiles\.endorsements_visible\)/);
  });

  it("respects the flag on both profile surfaces", () => {
    const student = readFileSync("app/(app)/student/[username]/page.jsx", "utf8");
    const publicPage = readFileSync("app/u/[username]/page.jsx", "utf8");
    expect(student).toContain("endorsements_visible !== false");
    expect(publicPage).toContain("endorsements_visible !== false");
  });

  it("gives the owner a control to toggle it", () => {
    const bits = readFileSync("app/(app)/student/[username]/ProfileBits.jsx", "utf8");
    expect(bits).toContain("endorsementsVisible");
    expect(bits).toContain("EndorsementManager");
  });
});
