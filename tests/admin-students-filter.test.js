import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { filterIdsByTier, rosterTierIndex, tallyTiers } from "@/lib/tiers";

const TENANT = "11111111-1111-1111-1111-111111111111";
const USERS = Array.from({ length: 75 }, (_, i) => `user-${String(i).padStart(3, "0")}`);

function makeSql({ profiles = [], projectRows = [], fail = null } = {}) {
  const calls = [];
  function respond(text) {
    if (fail && fail.test(text)) throw new Error("aggregate failed");
    if (/FROM profiles p/.test(text)) return profiles.map((id) => ({ user_id: id }));
    if (/FROM roadmap_nodes/.test(text)) return [{ totalNodes: 0 }];
    if (/FROM student_roadmap_progress/.test(text)) return [];
    if (/FROM resources\b/.test(text)) return [{ totalRes: 0 }];
    if (/FROM resource_progress/.test(text)) return [];
    if (/FROM projects/.test(text)) return projectRows;
    if (/FROM student_oss_contributions/.test(text)) return [];
    if (/FROM forum_replies/.test(text)) return [];
    if (/FROM event_registrations/.test(text)) return [];
    return [];
  }
  const sql = (strings, ...values) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    return Promise.resolve().then(() => respond(text));
  };
  sql.calls = calls;
  return sql;
}

const PROJECT_ROWS = [
  ...USERS.slice(0, 30).map((id) => ({ id, n: 2 })),
  ...USERS.slice(30, 50).map((id) => ({ id, n: 1 })),
];

describe("admin students tier index", () => {
  it("counts every matching member, not just the 50-row page", async () => {
    const sql = makeSql({ profiles: USERS, projectRows: PROJECT_ROWS });
    const index = await rosterTierIndex(sql, { tenantId: TENANT });

    expect(index.tierReady).toBe(true);
    expect(index.ids).toHaveLength(75);
    expect(index.counts).toEqual({ beginner: 25, intermediate: 20, advanced: 30 });

    const progressCall = sql.calls.find((c) => c.text.includes("FROM student_roadmap_progress"));
    const idsArg = progressCall.values.find((v) => Array.isArray(v));
    expect(idsArg).toHaveLength(75);
  });

  it("runs profile and membership filters server-side before classification", async () => {
    const sql = makeSql({ profiles: USERS, projectRows: PROJECT_ROWS });
    await rosterTierIndex(sql, { tenantId: TENANT, q: "aanya", role: "core", dept: "web" });

    const candidate = sql.calls[0];
    expect(candidate.text).toMatch(/FROM profiles p/);
    expect(candidate.text).not.toMatch(/LIMIT/i);
    expect(candidate.text).toContain("department_memberships");
    expect(candidate.values).toContain(TENANT);
    expect(candidate.values).toContain("aanya");
    expect(candidate.values).toContain("core");
    expect(candidate.values).toContain("web");
  });

  it("keeps counts independent of the tier filter and filters the full roster", async () => {
    const sql = makeSql({ profiles: USERS, projectRows: PROJECT_ROWS });
    const index = await rosterTierIndex(sql, { tenantId: TENANT });
    const advanced = filterIdsByTier(index.ids, index.tierMap, "advanced");

    expect(advanced).toHaveLength(30);
    expect(index.counts).toEqual({ beginner: 25, intermediate: 20, advanced: 30 });
    expect(filterIdsByTier(index.ids, index.tierMap, "not-a-tier")).toEqual([]);
  });

  it("falls back to the unfiltered roster when tier evidence fails", async () => {
    const sql = makeSql({ profiles: USERS, fail: /FROM projects/ });
    const index = await rosterTierIndex(sql, { tenantId: TENANT });

    expect(index.ids).toHaveLength(75);
    expect(index.tierReady).toBe(false);
    expect(index.counts).toEqual({ beginner: 0, intermediate: 0, advanced: 0 });
  });

  it("treats missing tier entries as beginner", () => {
    expect(tallyTiers(["a", "b"], new Map([["a", { tier: "advanced" }]])))
      .toEqual({ beginner: 1, intermediate: 0, advanced: 1 });
  });
});

describe("admin students route wiring", () => {
  it("filters tiers before the row query instead of filtering returned rows", () => {
    const page = readFileSync("app/(app)/admin/students/page.jsx", "utf8");
    expect(page).toContain("rosterTierIndex");
    expect(page).not.toMatch(/rows\s*=\s*rows\.filter/);
    // Bounded AND paged: the limit comes from PAGE_SIZE (same constant the
    // offset arithmetic uses, so the stride cannot drift) and the offset comes
    // from the clamped page window. Pinning the literal "LIMIT 50" would let a
    // future edit change one and not the other.
    expect(page).toMatch(/const PAGE_SIZE = \d+/);
    expect(page).toMatch(/LIMIT \$\{PAGE_SIZE\} OFFSET \$\{win\.offset\}/);
    expect(page).toContain("pageWindow(");
  });

  it("accepts tier as an API query parameter", () => {
    const route = readFileSync("app/api/admin/students/route.js", "utf8");
    expect(route).toContain('searchParams.get("tier")');
    expect(route).toContain("ANY(${visibleIds})");
  });
});
