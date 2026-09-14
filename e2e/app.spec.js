const { test, expect } = require("@playwright/test");

// Unauthenticated route protection: every protected page redirects to /login,
// every protected API returns 401 (except the HMAC-verified GitHub webhook).
const protectedPages = [
  "/student",
  "/student/roadmap",
  "/student/resources",
  "/student/projects",
  "/student/projects/new",
  "/student/github",
  "/student/contests",
  "/student/mentorship",
  "/student/leaderboard",
  "/student/notifications",
  "/student/privacy",
  "/student/settings",
  "/student/onboarding",
  "/admin",
  "/admin/students",
  "/admin/roadmaps",
  "/admin/resources",
  "/admin/projects",
  "/admin/contests",
  "/admin/mentors",
  "/admin/flags",
  "/admin/audit",
  "/admin/settings",
  "/lead"
];

test.describe("route protection", () => {
  for (const path of protectedPages) {
    test(`${path} redirects to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }

  // Server-level publicity: /setup must serve 200, not a login redirect.
  // (The page itself bounces logged-out browsers to /login via client JS
  // because claiming admin needs a user — asserting on page URL races that
  // bounce and flakes. The status code tests exactly what "public" means here.)
  test("setup is public (first-admin bootstrap)", async ({ request }) => {
    const res = await request.get("/setup");
    expect(res.status()).toBe(200);
    expect(res.url()).toMatch(/\/setup$/);
  });
});

test.describe("api authorization", () => {
  const apis = [
    "/api/roadmap",
    "/api/resources",
    "/api/projects",
    "/api/contests",
    "/api/mentorship",
    "/api/leaderboard",
    "/api/notifications",
    "/api/profile",
    "/api/github",
    "/api/departments",
    "/api/announcements",
    "/api/contributions",
    "/api/admin/overview",
    "/api/lead/overview",
    "/api/admin/students",
    "/api/admin/flags",
    "/api/admin/audit"
  ];
  for (const path of apis) {
    test(`GET ${path} returns 401 without session`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  }

  test("POST /api/roadmap/progress returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/roadmap/progress", { data: { nodeId: "x", status: "completed" } });
    expect(res.status()).toBe(401);
  });

  test("department membership writes return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    for (const [method, url, data] of [
      ["post", `/api/departments/${id}/join`, {}],
      ["post", `/api/departments/${id}/request-core`, {}],
      ["patch", `/api/departments/${id}/members/some-user`, { level: "core" }]
    ]) {
      const res = method === "post"
        ? await request.post(url, { data })
        : await request.patch(url, { data });
      expect(res.status()).toBe(401);
    }
  });

  test("announcement and contribution writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/announcements", { data: { scope: "society", title: "x", body: "y" } });
    expect(post.status()).toBe(401);
    const log = await request.post("/api/contributions", { data: { kind: "project", title: "Public proof" } });
    expect(log.status()).toBe(401);
  });

  test("lead console and approvals return 401 without session", async ({ request }) => {
    const succession = await request.patch("/api/lead/succession", { data: { userId: "x", departmentId: "00000000-0000-0000-0000-000000000000", ready: true } });
    expect(succession.status()).toBe(401);
    const bulk = await request.post("/api/admin/students/bulk", { data: { userIds: ["x"], role: "core" } });
    expect(bulk.status()).toBe(401);
    const approve = await request.post("/api/events/00000000-0000-0000-0000-000000000000/approve", { data: { approve: true } });
    expect(approve.status()).toBe(401);
  });

  test("POST /api/github/webhook without signature returns 401 (not redirect)", async ({ request }) => {
    const res = await request.post("/api/github/webhook", {
      headers: { "x-github-event": "push", "x-github-delivery": "test" },
      data: "{}"
    });
    expect([400, 401]).toContain(res.status());
  });
});
