import { afterEach, describe, expect, it, vi } from "vitest";

// Username changes are an identity boundary: peers, mentors, and the audit log
// resolve people by handle. These tests drive the real PUT route so the cooldown
// and lifetime cap are proven at the API boundary, not just described.

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function makeDb({ existing = null, taken = null } = {}) {
  const state = { cards: existing ? [{ ...existing }] : [], queries: [] };

  function dispatch(strings, values) {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    state.queries.push({ text, values });

    if (/SELECT user_id FROM user_profiles WHERE username = \?/.test(text)) {
      return taken ? [{ user_id: taken }] : [];
    }

    if (/SELECT username, username_changed_at, username_change_count/.test(text)) {
      const card = state.cards.find((c) => c.user_id === values[0]);
      return card ? [{ ...card }] : [];
    }

    if (/INSERT INTO user_profiles/.test(text)) {
      const [
        userId,
        tenantId,
        username,
        bio,
        avatarUrl,
        location,
        links,
        primaryDomain,
        isPublic,
        endorsementsVisible,
        usernameChangedAt,
        usernameChangeCount
      ] = values;
      const card = {
        user_id: userId,
        tenant_id: tenantId,
        username,
        bio,
        avatar_url: avatarUrl,
        location,
        social_links: links,
        primary_domain: primaryDomain,
        is_public: isPublic,
        endorsements_visible: endorsementsVisible,
        username_changed_at: usernameChangedAt,
        username_change_count: usernameChangeCount
      };
      const index = state.cards.findIndex((c) => c.user_id === userId);
      if (index === -1) state.cards.push(card);
      else state.cards[index] = card;
      return [{ ...card }];
    }

    throw new Error(`unexpected query: ${text}`);
  }

  const sql = (strings, ...values) => Promise.resolve(dispatch(strings, values));
  sql.json = (value) => value;
  sql.state = state;
  return sql;
}

let route = null;
let context = null;

async function loadRoute() {
  vi.resetModules();
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => context,
    writeAudit: async () => {}
  }));
  return import("@/app/api/social/profile/route");
}

async function save(sql, body) {
  context = { user: { id: USER }, tenant: { id: TENANT }, profile: { role: "student" }, sql };
  route ||= await loadRoute();
  const response = await route.PUT(new Request("http://localhost/api/social/profile", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
  return { response, body: await response.json() };
}

afterEach(() => {
  vi.doUnmock("@/lib/auth-server");
  route = null;
  context = null;
});

describe("PUT /api/social/profile — username change limits", () => {
  it("creates a first card without consuming a change", async () => {
    const sql = makeDb();
    const { response, body } = await save(sql, { username: "ada", bio: "" });

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(sql.state.cards[0].username_change_count).toBe(0);
    expect(sql.state.cards[0].username_changed_at).toBeNull();
  });

  it("rejects a rename inside the 30-day cooldown", async () => {
    const changedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const sql = makeDb({
      existing: { user_id: USER, username: "ada", username_changed_at: changedAt, username_change_count: 1 }
    });

    const { response, body } = await save(sql, { username: "ada-l", bio: "" });

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("USERNAME_COOLDOWN");
    expect(body.error.message).toContain("30 days");
    expect(sql.state.queries.some((q) => /INSERT INTO user_profiles/.test(q.text))).toBe(false);
  });

  it("allows a rename after the cooldown and increments the count", async () => {
    const changedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const sql = makeDb({
      existing: { user_id: USER, username: "ada", username_changed_at: changedAt, username_change_count: 1 }
    });

    const { response, body } = await save(sql, { username: "ada-l", bio: "" });

    expect(response.status).toBe(200);
    expect(body.data.card.username).toBe("ada-l");
    expect(body.data.card.username_change_count).toBe(2);
    expect(new Date(body.data.card.username_changed_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("does not consume a change when the handle is unchanged", async () => {
    const changedAt = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const sql = makeDb({
      existing: { user_id: USER, username: "ada", username_changed_at: changedAt, username_change_count: 2 }
    });

    const { response, body } = await save(sql, { username: "ada", bio: "Updated bio" });

    expect(response.status).toBe(200);
    expect(body.data.card.username_change_count).toBe(2);
    expect(body.data.card.username_changed_at).toBe(changedAt);
  });

  it("rejects a rename after the lifetime cap", async () => {
    const sql = makeDb({
      existing: {
        user_id: USER,
        username: "ada",
        username_changed_at: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString(),
        username_change_count: 5
      }
    });

    const { response, body } = await save(sql, { username: "ada-final", bio: "" });

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("USERNAME_CHANGE_LIMIT");
  });

  it("still rejects a taken handle before the change checks", async () => {
    const sql = makeDb({ taken: "someone-else" });
    const { response, body } = await save(sql, { username: "taken", bio: "" });

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("USERNAME_TAKEN");
  });
});
