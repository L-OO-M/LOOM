import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { listFeatureRequests, screenFeatureRequest } from "@/lib/feature-requests";

function captureSql() {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ text: strings.join("?").replace(/\s+/g, " ").trim(), values });
    return [];
  };
  sql.__calls = calls;
  return sql;
}

describe("feature request visibility", () => {
  it("hides other people's pending/rejected ideas from a normal member", async () => {
    const sql = captureSql();
    await listFeatureRequests({ sql, tenantId: "t1", userId: "u1", isAdmin: false });
    const q = sql.__calls[0].text;
    expect(q).toMatch(/status IN \('approved','built'\)/);
    expect(q).toMatch(/requester_id/);
    // The viewer's own id is a bind parameter, not interpolated.
    expect(sql.__calls[0].values).toContain("u1");
    expect(q).toContain("tenant_id");
  });

  it("lets an admin see the whole moderation queue", async () => {
    const sql = captureSql();
    await listFeatureRequests({ sql, tenantId: "t1", userId: "admin1", isAdmin: true });
    const q = sql.__calls[0].text;
    expect(q).toContain("tenant_id");
    expect(q).not.toMatch(/status IN \('approved','built'\)/);
  });
});

describe("feature request content screening", () => {
  it("rejects abusive submissions", () => {
    expect(screenFeatureRequest({ title: "Add shit mode", description: "clean" }).code).toBe("UNSAFE_CONTENT");
    expect(screenFeatureRequest({ title: "Dark mode", description: "this is fucking broken" }).code).toBe("UNSAFE_CONTENT");
  });

  it("accepts a real idea", () => {
    expect(screenFeatureRequest({
      title: "Dark mode for snippets",
      description: "Let students toggle a dark theme on the snippets wall.",
      integration: "A toggle in the snippets header",
      tradeoffs: "More CSS variables",
      implementation: "localStorage flag + CSS vars"
    })).toEqual({ ok: true });
  });
});

describe("the student page uses the shared visibility rule", () => {
  it("does not run its own unfiltered feature_requests query", () => {
    const page = readFileSync("app/(app)/student/feature-requests/page.jsx", "utf8");
    expect(page).toContain("listFeatureRequests");
    expect(page).not.toMatch(/FROM feature_requests fr[\s\S]{0,200}ORDER BY fr\.created_at/);
  });
});
