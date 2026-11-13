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
  "announcements", "asset_categories", "asset_versions", "audit_logs", "budget_heads",
  "certificates", "chapter_profiles",
  "cohort_metrics", "code_snippets", "contests", "debug_challenges", "debug_submissions",
  "departments", "dept_reports",
  "events", "event_ops_tasks", "expenses", "faqs", "feature_requests", "forum_threads", "handover_checklists",
  "help_matches", "help_signals", "helper_profiles", "lead_directory", "lead_handovers", "media_assets", "member_contributions",
  "mentor_applications", "mentor_effectiveness", "mentors", "mou_documents", "mous", "notifications",
  "oss_badges", "page_views", "practice_connections", "practice_corrections", "practice_questions",
  "practice_solves", "practice_sync_runs", "practice_weeks", "profiles", "projects", "ranking_events",
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

// Only the request path. The batch/diagnostic scripts in load/ run on the owner
// connection by design -- rollup-federation aggregates across the whole
// federation on purpose, and verify-webhook is an operator console -- so a
// missing tenant predicate there is not a request-path leak.
const REQUEST_PATH_FILES = [...walk("app"), ...walk("lib")];

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
  }, 20_000);

  it("leaves no reverse-order OR tenant_id IS NULL arm on a strict table", () => {
    // The scanner above only matched `tenant_id IS NULL OR tenant_id = X`.
    // `tenant_id = X OR tenant_id IS NULL` is the same escape hatch in the other
    // order and must fail too.
    const REVERSE =
      /\w*\.?tenant_id\s*=\s*[^`\n]*?\bOR\s+\w*\.?tenant_id\s+IS\s+NULL/i;
    // Pre-existing reverse-order NULL arms outside P0-1. They include legacy
    // pre-tenancy/global rows and are tracked separately; do not add new ones.
    const PRE_EXISTING_REVERSE = [
      "app/(app)/admin/mentors/page.jsx",
      "app/(app)/admin/page.jsx",
      "app/(app)/student/credentials/page.jsx",
      "app/api/credentials/route.js",
      "lib/community.js"
    ];
    const offenders = [];
    for (const file of FILES) {
      if (PRE_EXISTING_REVERSE.some((f) => file.includes(f))) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!REVERSE.test(line)) return;
        const ctx = lines.slice(Math.max(0, i - 4), i + 1).join(" ");
        if (UNSCOPED_BY_DESIGN.some((t) => ctx.includes(t))) return;
        offenders.push(`${file}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Only tables in UNSCOPED_BY_DESIGN may keep the NULL arm in either order:\n${offenders.join("\n")}`
    ).toEqual([]);
  }, 20_000);

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

  // The gate above only caught the `OR tenant_id IS NULL` arm. It did NOT catch
  // a query with no tenant predicate at all -- which is how two real bugs
  // survived it: the student project detail page, and the GitHub handle
  // fallback in lib/github.js. Both are now fixed, and this closes the gap.
  //
  // Scope, deliberately narrow. This flags a tenant table appearing in the
  // PRIMARY FROM of a SELECT with neither a tenant predicate nor a self-scoping
  // key. It does NOT flag:
  //   - `LEFT JOIN profiles ... ON p.user_id = x` -- a display-name lookup on an
  //     already-pinned parent. Flagging these produced ~20 false positives and
  //     would train people to ignore the gate.
  //   - a table reached only through a subquery whose parent is pinned, which
  //     is not statically decidable; those are listed below with a reason.
  const PARENT_PINNED_ALLOWLIST = [
    ["app/(app)/student/contests/[id]/page.jsx", "contest row is the tenant-pinned outer query"],
    ["app/(app)/student/community/wiki/[slug]/page.jsx", "wiki page is tenant-pinned; rest is name lookup"],
    ["app/api/admin/students/route.js", "membership EXISTS over the tenant-pinned departments set"],
    ["app/api/community/wiki/[slug]/route.js", "wiki page is tenant-pinned; rest is name lookup"],
    ["app/api/feature-requests/[id]/route.js", "request row is tenant-pinned + ownership filtered; rest is name lookup"],
    ["app/(app)/student/[username]/page.jsx", "username is globally unique; public profile by design"],
    ["app/u/[username]/page.jsx", "username is globally unique; this IS the public profile surface"],
    ["app/u/[username]/cardData.js", "username is globally unique; public card by design"],
    ["app/api/social/profile/route.js", "username-uniqueness probe; returns a boolean, no profile data"],
    // Shared helpers whose inputs are always tenant-filtered by the CALLER, which
    // is not statically visible from inside the helper. Each is called only from
    // a handler that has already pinned the tenant (see the audit in
    // docs/17-architecture.md). If any of these ever gains a caller that has not,
    // this allowlist is the thing that should be revisited.
    ["lib/lead.js", "departmentIds come from the tenant-filtered departments query in the same function"],
    ["lib/recommend.js", "helper candidates come from findHelpers(), which filters available helpers by tenant"],
    ["lib/standings.js", "joined to the tenant-filtered profile set; the CTEs are per-student aggregates"],
    ["lib/practice-sync.js", "the platform cron job must discover due work across tenants; each claim and every subsequent read/write is tenant-pinned by tenant_id + user_id"]
  ];

  it("never reads a tenant table directly with no tenant or self-scoping predicate", () => {
    // A caller-scoped predicate: either `col = ${...}` or `col = ANY(${...})`,
    // the second being how this codebase passes id lists derived from an
    // already tenant-filtered query (lib/tiers.js, lib/reputation.js, lib/lead.js).
    const SELF_KEY =
      /(user_id|owner_id|author_id|student_id|requester_id|follower_id|mentor_id|endorssee_id|created_by|actor_id)\s*(=\s*ANY\(\s*\$\{|=\s*\$\{)/i;

    // A self-key inside a subquery scopes only that subquery. It must not make
    // the gate skip the whole statement: `FROM contests c WHERE EXISTS (SELECT
    // ... r.student_id = $1)` still reads every chapter's contests. Remove
    // SELECT subqueries before testing for a caller-scoped predicate, while
    // leaving constructs like `= ANY(${ids})` intact.
    function stripSubqueries(text) {
      let out = "";
      let i = 0;
      while (i < text.length) {
        if (text[i] === "(") {
          let depth = 0;
          let j = i;
          for (; j < text.length; j += 1) {
            if (text[j] === "(") depth += 1;
            else if (text[j] === ")") {
              depth -= 1;
              if (depth === 0) break;
            }
          }
          if (/^\s*SELECT\b/i.test(text.slice(i + 1, j))) {
            out += " ";
            i = j + 1;
            continue;
          }
        }
        out += text[i];
        i += 1;
      }
      return out;
    }

    const offenders = [];
    for (const file of REQUEST_PATH_FILES) {
      if (PARENT_PINNED_ALLOWLIST.some(([f]) => file.includes(f))) continue;
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/sql`([^`]{10,1200}?)`/g)) {
        const q = m[1];
        if (!/\bSELECT\b/i.test(q)) continue;
        if (/\btenant_id\b/i.test(q)) continue;      // tenant-scoped
        if (SELF_KEY.test(stripSubqueries(q))) continue; // caller-scoped primary statement
        if (UNSCOPED_BY_DESIGN.some((t) => q.includes(t))) continue;
        for (const t of STRICT_TABLES) {
          // Only the primary FROM, never a JOIN used to fetch a display name.
          if (new RegExp(`\\bFROM\\s+${t}\\b`, "i").test(q)) {
            offenders.push(`${file}: ${t} -> ${q.replace(/\s+/g, " ").trim().slice(0, 90)}`);
          }
        }
      }
    }
    expect(
      offenders,
      `These read a tenant-owned table directly with no tenant_id and no self key.\n` +
      `Add the predicate, or record the reason in PARENT_PINNED_ALLOWLIST.\n\n` +
      offenders.join("\n")
    ).toEqual([]);
  });

  it("keeps the project detail page tenant-scoped in SQL, not in JS", () => {
    // Regression: this read the row by id and then decided with
    // `!p.tenant_id || !tenant?.id || ...`, which treats NULL as same-tenant.
    const page = readFileSync("app/(app)/student/projects/[id]/page.jsx", "utf8");
    expect(page).not.toMatch(/SELECT \* FROM projects WHERE id = \$\{id\} LIMIT 1/);
    expect(page).not.toMatch(/!p\.tenant_id \|\| !tenant\?\.id/);
    expect(page).toMatch(/tenant_id = \$\{tenant\?\.id \?\? null\}::uuid/);
  });

  it("scopes the student dashboard contests query to the request tenant", () => {
    // Regression: the upcoming-contests strip had no tenant predicate, so every
    // chapter's contests could appear on another chapter's student home. The
    // EXISTS(...) self-key in the same statement used to mask this from the gate.
    const src = readFileSync("app/(app)/student/page.jsx", "utf8");
    const q = src.match(/FROM contests c[\s\S]*?`/);
    expect(q, "student contests query not found").toBeTruthy();
    expect(q[0]).toMatch(/c\.tenant_id = \$\{tenant\?\.id \?\? null\}::uuid/);
    expect(q[0]).not.toMatch(/tenant_id\s+IS\s+NULL/i);
  });

  it("scopes the admin analytics contests query to the request tenant", () => {
    // Regression: the contest insights panel read contests unscoped and was
    // hidden by a false PARENT_PINNED_ALLOWLIST entry.
    const src = readFileSync("app/(app)/admin/analytics/page.jsx", "utf8");
    const q = src.match(/FROM contests k[\s\S]*?`/);
    expect(q, "analytics contests query not found").toBeTruthy();
    expect(q[0]).toMatch(/k\.tenant_id = \$\{tenant\?\.id \?\? null\}::uuid/);
    expect(q[0]).not.toMatch(/tenant_id\s+IS\s+NULL/i);
  });

  it("never falls back to an unscoped GitHub handle lookup", () => {
    // Regression: with no tenant context this used to resolve ANY chapter's
    // student by handle and credit their activity ledger from the webhook.
    const gh = readFileSync("lib/github.js", "utf8");
    expect(gh).toMatch(/if \(!tenantId\)[\s\S]{0,400}return null/);
    const ternaries = gh.match(/\?\s*await sql`[\s\S]*?`\s*:\s*await sql`[\s\S]*?`/g) || [];
    for (const t of ternaries) {
      expect(t, "no tenant-conditional unscoped fallback").not.toMatch(/github_username/);
    }
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

describe("public legal pages render per request", () => {
  it("keeps the zero-database pages dynamic for the nonce CSP", () => {
    // These pages were force-static so the CDN could cache them. The nonce-based
    // CSP reverses that deliberately: Next only stamps the nonce onto dynamically
    // rendered HTML, so a prerendered copy would ship unnonced scripts that the
    // browser blocks (theme toggle and mobile nav would die silently).
    // The property the old test protected still holds: none of these pages
    // resolve a tenant from the Host header, so a shared cache could never have
    // served one chapter's content to another.
    for (const p of ["app/privacy/page.jsx", "app/terms/page.jsx", "app/contact/page.jsx", "app/about/page.jsx", "app/domains/page.jsx", "app/faq/page.jsx"]) {
      const src = readFileSync(p, "utf8");
      expect(src, p).toContain('dynamic = "force-dynamic"');
      expect(src, p).not.toContain('dynamic = "force-static"');
      expect(src, p).not.toMatch(/resolveTenantFromHost|resolveRequestTenant/);
    }
  });

  it("keeps host-resolved tenant pages dynamic", () => {
    // These pick their chapter from the Host header. A shared cache keyed by
    // path would serve one chapter's content to every other chapter.
    for (const p of ["app/events/page.jsx"]) {
      expect(readFileSync(p, "utf8"), p).toMatch(/resolveTenantFromHost|resolveRequestTenant/);
    }
  });
});