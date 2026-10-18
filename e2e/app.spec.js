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
  "/student/opensource",
  "/student/contests",
  "/student/events",
  "/student/mentorship",
  "/student/community",
  "/student/discover",
  "/student/network",
  "/student/network/demo-college",
  "/student/leaderboard",
  "/student/credentials",
  "/student/community/forums",
  "/student/community/wiki",
  "/student/community/snippets",
  "/student/notifications",
  "/student/privacy",
  "/student/settings",
  "/student/onboarding",
  "/admin",
  "/admin/events",
  "/admin/students",
  "/admin/roadmaps",
  "/admin/resources",
  "/admin/opensource",
  "/admin/projects",
  "/admin/contests",
  "/admin/mentors",
  "/admin/flags",
  "/admin/audit",
  "/admin/settings",
  "/admin/faq",
  "/admin/finance",
  "/admin/reports",
  "/admin/handover",
  "/admin/departments",
  "/lead",
  "/lead/overview",
  "/lead/roster",
  "/lead/workshops",
  "/lead/reports",
  "/lead/succession",
  "/lead/assets",
  "/lead/mous",
  "/lead/directory",
  "/lead/event-ops",
  "/admin/assets",
  "/admin/mous",
  "/admin/directory",
  "/admin/event-ops"
];

test.describe("route protection", () => {
  for (const path of protectedPages) {
    test(`${path} redirects to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }

  test("/student/events/00000000-0000-0000-0000-000000000000 redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/student/events/00000000-0000-0000-0000-000000000000");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });

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
    "/api/events",
    "/api/events?scope=past",
    "/api/events?scope=registered",
    "/api/mentorship",
    "/api/leaderboard",
    "/api/notifications",
    "/api/profile",
    "/api/github",
    // The repository grant. These MUST require a session: state is signed with
    // the starting user's id and the callback writes github_connections for
    // them, so making either public would let a flow land on a stranger's
    // account. /api/github/webhook is deliberately excluded above — GitHub has
    // no session and is authenticated by HMAC instead.
    "/api/github/oauth/start",
    "/api/github/oauth/callback",
    "/api/github/oauth/callback?code=stolen&state=forged",
    "/api/admin/ranking",
    "/api/opensource/projects",
    "/api/opensource/contributions",
    "/api/credentials",
    "/api/departments",
    "/api/network",
    "/api/announcements",
    "/api/contributions",
    "/api/community/threads",
    "/api/community/wiki",
    "/api/community/snippets",
    "/api/admin/community",
    "/api/admin/overview",
    "/api/lead/overview",
    "/api/lead/assets",
    "/api/lead/asset-categories",
    "/api/lead/mous",
    "/api/lead/directory",
    "/api/lead/event-ops",
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

  test("event detail, registration, and feedback return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    const get = await request.get(`/api/events/${id}`);
    expect(get.status()).toBe(401);
    expect((await get.json()).ok).toBe(false);
    const post = await request.post(`/api/events/${id}`, { data: { action: "register" } });
    expect(post.status()).toBe(401);
    const cancel = await request.post(`/api/events/${id}`, { data: { action: "cancel" } });
    expect(cancel.status()).toBe(401);
    const patch = await request.patch(`/api/events/${id}`, { data: { feedbackScore: 5 } });
    expect(patch.status()).toBe(401);
    const materials = await request.post(`/api/events/${id}/materials`, {
      data: { title: "Slides", storageUrl: "https://example.com/slides", fileType: "link" }
    });
    expect(materials.status()).toBe(401);
    const attendance = await request.post(`/api/admin/events/${id}/attendance`, { data: { checkInCode: "LOOM-TEST" } });
    expect(attendance.status()).toBe(401);
  });

  test("POST /api/roadmap/progress returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/roadmap/progress", { data: { nodeId: "x", status: "completed" } });
    expect(res.status()).toBe(401);
  });

  test("POST /api/credentials returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/credentials", {
      data: { achievementId: "00000000-0000-0000-0000-000000000000", expiresInDays: 365 }
    });
    expect(res.status()).toBe(401);
  });

  test("public credential verification needs no session but 404s unknown ids", async ({ request }) => {
    const res = await request.get("/verify/credential/cred_doesnotexist000");
    expect(res.status()).toBe(404);
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

  test("asset library writes and downloads return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    const create = await request.post("/api/lead/assets", {
      data: { title: "Brand kit", externalUrl: "https://example.com/kit.zip" }
    });
    expect(create.status()).toBe(401);
    const patch = await request.patch(`/api/lead/assets/${id}`, { data: { title: "x" } });
    expect(patch.status()).toBe(401);
    const del = await request.delete(`/api/lead/assets/${id}`);
    expect(del.status()).toBe(401);
    const version = await request.post(`/api/lead/assets/${id}/versions`, { data: {} });
    expect(version.status()).toBe(401);
    const download = await request.get(`/api/lead/assets/${id}/download`);
    expect(download.status()).toBe(401);
  });

  test("MoU writes and document downloads return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    const create = await request.post("/api/lead/mous", { data: { title: "Cloud credits", partnerName: "Acme" } });
    expect(create.status()).toBe(401);
    const patch = await request.patch(`/api/lead/mous/${id}`, { data: { status: "active" } });
    expect(patch.status()).toBe(401);
    const del = await request.delete(`/api/lead/mous/${id}`);
    expect(del.status()).toBe(401);
    const doc = await request.post(`/api/lead/mous/${id}/documents`, { data: {} });
    expect(doc.status()).toBe(401);
    const download = await request.get(`/api/lead/mous/${id}/documents/${id}/download`);
    expect(download.status()).toBe(401);
  });

  test("directory writes return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    const create = await request.post("/api/lead/directory", { data: { name: "Asha Rao", title: "Department Lead" } });
    expect(create.status()).toBe(401);
    const patch = await request.patch(`/api/lead/directory/${id}`, { data: { isCurrent: false } });
    expect(patch.status()).toBe(401);
    const del = await request.delete(`/api/lead/directory/${id}`);
    expect(del.status()).toBe(401);
  });

  test("event ops writes return 401 without session", async ({ request }) => {
    const id = "00000000-0000-0000-0000-000000000000";
    const create = await request.post("/api/lead/event-ops", { data: { title: "Book auditorium" } });
    expect(create.status()).toBe(401);
    const patch = await request.patch(`/api/lead/event-ops/${id}`, { data: { status: "done" } });
    expect(patch.status()).toBe(401);
    const del = await request.delete(`/api/lead/event-ops/${id}`);
    expect(del.status()).toBe(401);
  });

  test("POST /api/github/webhook without signature returns 401 (not redirect)", async ({ request }) => {
    const res = await request.post("/api/github/webhook", {
      headers: { "x-github-event": "push", "x-github-delivery": "test" },
      data: "{}"
    });
    expect([400, 401]).toContain(res.status());
  });

  test("bare username profile redirects to login when unauthenticated", async ({ page }) => {
    await page.goto("/student/some-builder");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });

  test("GET /api/social/* returns 401 without session", async ({ request }) => {
    for (const path of ["/api/social/profile", "/api/social/connections", "/api/social/discover"]) {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    }
  });
});

test.describe("operations api authorization", () => {
  const id = "00000000-0000-0000-0000-000000000000";
  const getApis = [
    "/api/volunteers",
    "/api/reports",
    "/api/reports/export?scope=semester",
    "/api/handover",
    "/api/finance"
  ];
  for (const path of getApis) {
    test(`GET ${path} returns 401 without session`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    });
  }

  test("volunteer signup writes return 401 without session", async ({ request }) => {
    const post = await request.post(`/api/volunteers/${id}/signup`, { data: {} });
    expect(post.status()).toBe(401);
    const del = await request.delete(`/api/volunteers/${id}/signup`);
    expect(del.status()).toBe(401);
  });

  test("volunteer slot creation returns 401 without session", async ({ request }) => {
    const res = await request.post("/api/volunteers", { data: { eventId: id, title: "Help out", capacity: 5 } });
    expect(res.status()).toBe(401);
  });

  test("report writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/reports", { data: { departmentId: id, month: "2026-09-01" } });
    expect(post.status()).toBe(401);
    const patch = await request.patch(`/api/reports/${id}`, { data: { status: "submitted" } });
    expect(patch.status()).toBe(401);
  });

  test("handover writes return 401 without session", async ({ request }) => {
    const post = await request.post("/api/handover", { data: { title: "Keys", category: "general" } });
    expect(post.status()).toBe(401);
    const patch = await request.patch(`/api/handover/${id}`, { data: { done: true } });
    expect(patch.status()).toBe(401);
  });

  test("finance writes return 401 without session", async ({ request }) => {
    const propose = await request.post("/api/finance/expenses", { data: { amount: 500, note: "Snacks for workshop" } });
    expect(propose.status()).toBe(401);
    const decide = await request.patch("/api/finance/expenses", { data: { id, decision: "approved" } });
    expect(decide.status()).toBe(401);
    const create = await request.post("/api/finance/sponsorships", { data: { name: "Acme", amount: 1000 } });
    expect(create.status()).toBe(401);
    const update = await request.put("/api/finance/sponsorships", { data: { id, status: "received" } });
    expect(update.status()).toBe(401);
  });
});
