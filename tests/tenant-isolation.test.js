import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression tests for cross-tenant reads found by the tenant-isolation audit.
//
// These are structural: they assert the QUERY carries the tenant predicate,
// because the previous guards ran in JavaScript AFTER the row was fetched and
// failed open whenever either side was null. An assertion on the response code
// alone would not catch a row that was read into process memory.

describe("cross-tenant reads are filtered in SQL, not after the fact", () => {
  it("mentorship lookup constrains mentors by tenant on both id shapes", () => {
    const src = readFileSync("app/api/mentorship/route.js", "utf8");
    // This lookup previously had NO tenant predicate at all: any member could
    // pass another chapter's mentorId and read that mentor's row.
    expect(src).not.toMatch(/SELECT \* FROM mentors WHERE user_id = \$\{body\.mentorId\} LIMIT 1/);
    const scopedLookups = src.match(/FROM mentors WHERE[^`]*tenant_id = \$\{tenant\?\.id \?\? null\}::uuid/gi) || [];
    expect(scopedLookups.length).toBeGreaterThanOrEqual(2);
  });

  it("project detail never fetches by id alone", () => {
    const src = readFileSync("app/api/projects/[id]/route.js", "utf8");
    expect(src).not.toContain("SELECT * FROM projects WHERE id = ${id} LIMIT 1");
    // Both GET and PATCH must carry the predicate in SQL.
    expect((src.match(/tenant_id = \$\{tenant\?\.id \?\? null\}::uuid/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("contest registration never fetches by id alone", () => {
    const src = readFileSync("app/api/contests/route.js", "utf8");
    expect(src).not.toContain("SELECT * FROM contests WHERE id = ${body.contestId} LIMIT 1");
    // Both lookups now refuse before querying when the tenant is missing and
    // use plain equality (`${tenant.id}`), not the OR-null escape hatch.
    expect(src).toContain("if (!tenant?.id) return fail(\"FORBIDDEN\", \"No chapter context\", 403);");
    expect((src.match(/tenant_id = \$\{tenant\.id\}::uuid/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it("no route guards a cross-tenant row with a fail-open JS check", () => {
    // The shape `if (row.tenant_id && tenant?.id && ...)` is the bug itself:
    // a NULL on either side skips the check entirely.
    const routes = ["app/api/mentorship/route.js", "app/api/projects/[id]/route.js", "app/api/contests/route.js"];
    for (const r of routes) {
      const src = readFileSync(r, "utf8");
      expect(src, r).not.toMatch(/if \(\w+\.tenant_id && tenant\?\.id &&/);
    }
  });
});

describe("request context fails closed without a tenant", () => {
  const src = readFileSync("lib/auth-server.js", "utf8");

  // Roughly forty queries rely on `tenant` being a real uuid, because they use
  // the `(tenant_id = $tid OR $tid IS NULL)` idiom. That idiom is only safe
  // while the precondition holds, so it is enforced once, centrally, instead of
  // being audited at every call site.
  it("returns TENANT_UNRESOLVED rather than a null tenant", () => {
    expect(src).toContain('"TENANT_UNRESOLVED"');
  });

  it("guards before the tenant is used to scope anything", () => {
    const guard = src.indexOf("TENANT_UNRESOLVED");
    const phase2 = src.indexOf("const db = enforce");
    expect(guard).toBeGreaterThan(-1);
    expect(phase2).toBeGreaterThan(-1);
    expect(guard, "the guard must come before Phase 2 scoping").toBeLessThan(phase2);
  });

  it("no longer has the scoped-but-unset fallback branch", () => {
    expect(src).not.toContain("enforce && tenant");
  });

  it("logs why it refused, so this is diagnosable", () => {
    expect(src).toMatch(/\[auth\] refusing to build a request context/);
  });
});

describe("no tenant-escape hatch on tenant-strict tables", () => {
  // The single legitimate exception is open_source_projects: a curated global
  // catalogue whose rows are tenant-less by design, with an RLS policy of
  // literally `tenant_id IS NULL OR tenant_id = ...`. Everything else must be
  // plain equality.
  const GLOBAL_TABLE = "open_source_projects";

  function walk(dir) {
    const out = [];
    for (const entry of require("node:fs").readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(p));
      else if (/\.(js|jsx)$/.test(entry.name)) out.push(p);
    }
    return out;
  }

  it("leaves no OR tenant_id IS NULL arm on a strict table", () => {
    const offenders = [];
    for (const file of [...walk("app"), ...walk("lib")]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/tenant_id\s+IS\s+NULL\s+OR\s+\w*\.?tenant_id\s*=/.test(line)) return;
        // Look back for the table this predicate belongs to.
        const ctx = lines.slice(Math.max(0, i - 3), i + 1).join(" ");
        if (ctx.includes(GLOBAL_TABLE)) return; // legitimate
        offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders, `strict tables must use plain tenant equality:\n${offenders.join("\n")}`)
      .toEqual([]);
  }, 20_000);

  it("still scopes open_source_profiles to the global catalogue", () => {
    // Guards against "fixing" the one legitimate exception by accident.
    const projects = readFileSync("app/api/opensource/projects/route.js", "utf8");
    expect(projects).toMatch(/tenant_id IS NULL OR tenant_id =/);
  });

  it("documents the rule where queries are written", () => {
    const db = readFileSync("lib/db.js", "utf8");
    expect(db).toContain("TENANT SCOPING");
    expect(db).toContain("open_source_projects");
  });
});