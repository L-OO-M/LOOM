import { describe, expect, it } from "vitest";
import { assertAdminFloor, isLastAdminError, LastAdminError } from "@/lib/last-admin";

function db(admins) {
  const statements = [];
  const tx = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    statements.push({ text, values });
    return Promise.resolve(admins);
  };
  return { tx, statements };
}

describe("assertAdminFloor", () => {
  it("locks active admins before deciding and allows a non-admin removal", async () => {
    const { tx, statements } = db([{ user_id: "admin-1" }]);
    const result = await assertAdminFloor(tx, { tenantId: "t1", removingUserIds: ["student-1"] });
    expect(result).toEqual({ activeAdmins: 1, removing: 0 });
    expect(statements[0].text).toContain("FOR UPDATE");
    expect(statements[0].text).toContain("role = 'admin'");
  });

  it("refuses to remove the only active admin", async () => {
    const { tx } = db([{ user_id: "admin-1" }]);
    await expect(
      assertAdminFloor(tx, { tenantId: "t1", removingUserIds: ["admin-1"] })
    ).rejects.toMatchObject({ code: "LAST_ADMIN" });
  });

  it("allows removing one of two active admins", async () => {
    const { tx } = db([{ user_id: "admin-1" }, { user_id: "admin-2" }]);
    const result = await assertAdminFloor(tx, { tenantId: "t1", removingUserIds: ["admin-1"] });
    expect(result).toEqual({ activeAdmins: 2, removing: 1, remaining: 1 });
  });

  it("does not block a chapter with zero active admins when nobody admin is removed", async () => {
    const { tx } = db([]);
    await expect(
      assertAdminFloor(tx, { tenantId: "t1", removingUserIds: ["student-1"] })
    ).resolves.toEqual({ activeAdmins: 0, removing: 0 });
  });

  it("classifies the typed error", () => {
    expect(isLastAdminError(new LastAdminError())).toBe(true);
    expect(isLastAdminError(new Error("other"))).toBe(false);
  });
});
