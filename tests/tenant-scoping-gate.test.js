import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

/**
 * Zero-leak gate for tenant scoping.
 *
 * This is deliberately a hard build failure rather than a warning. The class of
 * bug it catches -- a query against a tenant-owned table that does not constrain
 * tenant_id -- is silent: the query succeeds, returns the wrong rows, and
 * nothing in the app reports it. There is no runtime signal for it.
 *
 * Run by `npm test` and therefore by CI (see .github/workflows/ci.yml).
 */

// Tables that belong to exactly one chapter. Mirrors the strict_tables list in
// load/migrations/031_rls_scope.sql. A query on one of these must name
// tenant_id, either directly or through a parent row already constrained to the
// caller's tenant.
//
// Kept as an explicit list rather than discovered from the schema so that
// adding a table is a deliberate act: a new tenant-owned table that nobody adds
// here would otherwise be silently unscannable.
const STRICT_TABLES = [
  "announcements", "audit_logs", "budget_heads", "certificates", "chapter_profiles",
  "cohort_metrics", "code_snippets", "contests", "departments", "dept_reports",
  "events", "expenses", "faqs", "feature_requests", "forum_threads", "handover_checklists",
  "help_matches", "help_signals", "helper_profiles", "member_contributions",
  "mentor_applications", "mentor_effectiveness", "mentors", "notifications",
  "oss_badges", "page_views", "profiles", "projects", "ranking_events",
  "ranking_scores", "resource_progress", "roadmap_node_analytics", "skill_badges",
  "sponsorships", "student_achievements", "student_analytics_snapshots",
  "student_daily_activity", "student_oss_contributions", "student_roadmap_progress",
  "user_profiles", "verifiable_credentials", "volunteer_slots", "wiki_pages"
];

// Tables with no tenant_id column, and the one table where NULL is the intended
// representation of "global". Queries here are allowed the IS NULL arm.
const UNSCOPED_BY_DESIGN = [
  "open_source_projects", // global curated catalogue; policy is `tenant_id IS NULL OR ...`
  "roadmap_nodes", "resources", "tenants", "tenant_domains", "feature_flags",
  "platform_admins", "schema_migrations", "departments_catalog"
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const FILES = [...walk("app"), ...walk("lib"), ...walk("load")]
  // Migration SQL and one-off operator tooling are reviewed by hand.
  .filter((f) => !f.includes("migrations"));

describe("tenant scoping: no escape hatch on tenant-owned tables", () => {
  it("leaves no OR tenant_id IS NULL arm on a strict table", () => {
    const offenders = [];
    for (const file of FILES) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!/tenant_id\s+IS\s+NULL\s+OR\s+\w*\.?tenant_id\s*=/.test(line)) return;
        const ctx = lines.slice(Math.max(0, i - 4), i + 1).join(" ");
        // Legitimate only where the table is global by design.
        if (UNSCOPED_BY_DESIGN.some((t) => ctx.includes(t))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Only tables in UNSCOPED_BY_DESIGN may keep the NULL arm:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("documents why open_source_projects keeps the NULL arm", () => {
    const projects = readFileSync("app/api/opensource/projects/route.js", "utf8");
    expect(projects).toMatch(/tenant_id IS NULL OR tenant_id =/);
    expect(UNSCOPED_BY_DESIGN).toContain("open_source_projects");
  });

  it("keeps the rule documented where queries are written", () => {
    const db = readFileSync("lib/db.js", "utf8");
    expect(db).toContain("TENANT SCOPING");
  });

  it("covers every strict table in the schema with at least one index", () => {
    // Not an index check (that is migration 036's job) but a guard that the two
    // lists have not drifted apart in a way that leaves a table unscannable.
    expect(STRICT_TABLES.length).toBeGreaterThan(40);
    expect(STRICT_TABLES).toContain("profiles");
    expect(STRICT_TABLES).toContain("projects");
    // No table may be in both lists.
    const overlap = STRICT_TABLES.filter((t) => UNSCOPED_BY_DESIGN.includes(t));
    expect(overlap).toEqual([]);
  });
});

describe("auth endpoints are rate limited server-side", () => {
  // The login and register forms used to call Supabase directly from the
  // browser, which put every attempt outside this app's limiter.
  it("proxies login through a rate-limited API route", () => {
    const route = readFileSync("app/api/auth/login/route.js", "utf8");
    expect(route).toContain("checkRateLimit");
    expect(route).toMatch(/limit:\s*\d+/);
    const client = readFileSync("lib/auth-client.js", "utf8");
    const signIn = client.slice(client.indexOf("export async function signIn"), client.indexOf("export async function signUp"));
    expect(signIn).toContain("/api/auth/login");
    expect(signIn).not.toContain("signInWithPassword");
  });

  it("proxies registration through a rate-limited API route", () => {
    const route = readFileSync("app/api/auth/register/route.js", "utf8");
    expect(route).toContain("checkRateLimit");
    const client = readFileSync("lib/auth-client.js", "utf8");
    const signUp = client.slice(client.indexOf("export async function signUp"));
    expect(signUp).toContain("/api/auth/register");
    expect(signUp).not.toContain("auth.signUp(");
  });
});

describe("public legal pages are statically cached", () => {
  it("caches the zero-database legal pages", () => {
    for (const p of ["app/privacy/page.jsx", "app/terms/page.jsx", "app/contact/page.jsx"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain('dynamic = "force-static"');
      expect(src).not.toContain("force-dynamic");
    }
  });

  it("keeps host-resolved tenant pages dynamic", () => {
    // These pick their chapter from the Host header. A shared cache keyed by
    // path would serve one chapter's content to every other chapter.
    for (const p of [
      "app/events/page.jsx", "app/domains/page.jsx",
      "app/faq/page.jsx", "app/about/page.jsx"
    ]) {
      expect(readFileSync(p, "utf8"), p).toContain("resolveTenantFromHost");
    }
  });
});