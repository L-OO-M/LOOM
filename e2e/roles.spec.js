const { test, expect } = require("@playwright/test");

// Authorization surface for hardened promotion paths:
// single PATCH /api/admin/students and bulk POST both require admin and
// validate scoped fields (dept_lead needs departmentId, vertical_lead needs vertical).
// Uses unauthenticated 401 checks — no secrets needed, tenant isolation stays intact.
test.describe("role promotion authZ (hardened bulk parity)", () => {
  const id = "00000000-0000-0000-0000-000000000000";

  test("PATCH /api/admin/students returns 401 without session", async ({ request }) => {
    const res = await request.patch("/api/admin/students", {
      data: { userId: "u", role: "core" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  test("POST /api/admin/students/bulk returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/admin/students/bulk", {
      data: { userIds: ["u"], role: "vertical_lead", vertical: "technical" },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).ok).toBe(false);
  });

  test("lead bulk variant also 401 without session (finance/lead parity)", async ({ request }) => {
    const res = await request.post("/api/admin/students/bulk", {
      data: { userIds: ["u"], role: "dept_lead", departmentId: id },
    });
    expect(res.status()).toBe(401);
  });

  test("/lead stays protected and /api/profile is authenticated (soft-invalidation source)", async ({ request, page }) => {
    const prof = await request.get("/api/profile");
    expect(prof.status()).toBe(401);
    expect((await prof.json()).ok).toBe(false);

    await page.goto("/lead");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});
