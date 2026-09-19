const { test, expect } = require("@playwright/test");

// CONNECT → Community: unauthenticated visitors are bounced to /login and
// unauthenticated writes are rejected with 401. No seeds required — auth runs
// before any database read.
const FAKE_ID = "00000000-0000-0000-0000-000000000000";

test.describe("community route protection", () => {
  for (const path of [
    "/student/community",
    "/student/community/forums",
    `/student/community/forums/${FAKE_ID}`,
    "/student/community/wiki",
    "/student/community/wiki/never-written",
    "/student/community/snippets",
    "/admin/community"
  ]) {
    test(`${path} redirects to login when unauthenticated`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?redirect=/);
    });
  }
});

test.describe("community api authorization", () => {
  test("community reads return 401 without session", async ({ request }) => {
    for (const path of [
      "/api/community/threads",
      `/api/community/threads/${FAKE_ID}`,
      "/api/community/wiki",
      "/api/community/wiki/never-written",
      "/api/community/snippets"
    ]) {
      const res = await request.get(path);
      expect(res.status()).toBe(401);
      const body = await res.json();
      expect(body.ok).toBe(false);
    }
  });

  test("community writes return 401 without session", async ({ request }) => {
    const thread = await request.post("/api/community/threads", { data: { title: "Hello world?", body: "x" } });
    expect(thread.status()).toBe(401);
    const reply = await request.post(`/api/community/threads/${FAKE_ID}`, { data: { body: "helpful" } });
    expect(reply.status()).toBe(401);
    const vote = await request.post("/api/community/votes", { data: { targetType: "thread", targetId: FAKE_ID } });
    expect(vote.status()).toBe(401);
    const flag = await request.post("/api/community/flags", { data: { targetType: "thread", targetId: FAKE_ID } });
    expect(flag.status()).toBe(401);
    const page = await request.post("/api/community/wiki", { data: { title: "Guide", content: "x" } });
    expect(page.status()).toBe(401);
    const snippet = await request.post("/api/community/snippets", { data: { title: "Hook", code: "x" } });
    expect(snippet.status()).toBe(401);
  });

  test("flag validation rejects unknown reasons without session bypass", async ({ request }) => {
    // 401 (auth) still wins over 400 (validation) — auth runs first.
    const res = await request.post("/api/community/flags", { data: { targetType: "thread", targetId: FAKE_ID, reason: "harassment" } });
    expect(res.status()).toBe(401);
  });
});
