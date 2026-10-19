import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Release-path contracts for the roadmap_node_resources rollout. These are the
// things that break a deploy: a migration that never runs, a seed that cannot
// rebuild a clean database, or a build hook that silently mutates a shared
// database. They are asserted against the source so they hold in CI without
// touching any database.

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const pkg = JSON.parse(read("package.json"));

describe("migration runner", () => {
  const src = read("load/migrate.js");

  it("applies each file atomically and records it in the same transaction", () => {
    // A file that half-applies leaves the schema in a state no later run can
    // reason about. DDL + its tracking row must commit together.
    expect(src).toMatch(/sql\.begin\(/);
    expect(src).toMatch(/tx`INSERT INTO public\.schema_migrations/);
  });

  it("serialises concurrent runs with an advisory lock", () => {
    expect(src).toMatch(/pg_advisory_lock/);
  });

  it("skips files already recorded, so existing databases are untouched", () => {
    expect(src).toMatch(/WHERE name = \$\{file\}/);
    expect(src).toMatch(/skip\s+\$\{file\}/);
  });

  it("never prints the connection string", () => {
    // The URL carries the password.
    expect(src).not.toMatch(/console\.log\([^)]*\$\{url\}/);
    expect(src).not.toMatch(/console\.log\([^)]*url\b/);
  });

  it("refuses to run without an explicit DATABASE_URL", () => {
    expect(src).toMatch(/Refusing to run migrations/);
  });
});

describe("migration 036", () => {
  const sql = read("load/migrations/036_roadmap_node_resources.sql");

  it("is idempotent so re-running against an existing table is a no-op", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.roadmap_node_resources/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS roadmap_node_resources_node_idx/);
  });

  it("guarantees no duplicate node/resource pairs", () => {
    expect(sql).toMatch(/PRIMARY KEY \(node_id, resource_id\)/);
  });

  it("cannot orphan rows — both sides cascade", () => {
    expect(sql.match(/ON DELETE CASCADE/g) ?? []).toHaveLength(2);
  });

  it("ships the exact migration file the roadmap shelf depends on", () => {
    // Upstream added migrations after this one (036_tenant_leading_indexes,
    // 037, 038, 039), so "highest numbered" is no longer true — and must not
    // be: what matters is that this exact file exists and is applied.
    const files = fs
      .readdirSync(path.join(process.cwd(), "load/migrations"))
      .filter((f) => f.endsWith(".sql"));
    expect(files).toContain("036_roadmap_node_resources.sql");
  });

  it("is applied in the runner's lexicographic order, ahead of later migrations", () => {
    // load/migrate.js enumerates load/migrations/*.sql and sorts them, so files
    // apply in lexicographic filename order rather than in whatever order the
    // filesystem lists them.
    const files = fs
      .readdirSync(path.join(process.cwd(), "load/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const at = (name) => files.indexOf(name);

    expect(files[0]).toMatch(/^\d{3}_/);
    expect(at("036_roadmap_node_resources.sql")).toBeGreaterThan(-1);
    // The shelf table must exist before any migration that could depend on it.
    expect(at("036_roadmap_node_resources.sql")).toBeLessThan(at("039_endorsement_controls.sql"));

    // And the runner really sorts — it does not trust directory order.
    const runner = read("load/migrate.js");
    expect(runner).toMatch(/readdirSync[\s\S]{0,160}\.sort\(\)/);
  });
});

describe("node-resource seed", () => {
  const src = read("load/seed-node-resources.js");

  it("writes the shelf atomically", () => {
    expect(src).toMatch(/sql\.begin\(/);
  });

  it("upserts catalogue rows BEFORE checking that referenced ids exist", () => {
    // Ordering bug: on a clean database the check aborted every run, because
    // most referenced resources are created by this same script.
    const upsertAt = src.indexOf("ON CONFLICT (id) DO UPDATE SET title");
    const checkAt = src.indexOf("foundNodes");
    expect(upsertAt).toBeGreaterThan(-1);
    expect(checkAt).toBeGreaterThan(-1);
    expect(upsertAt).toBeLessThan(checkAt);
  });

  it("refuses to run against an unmigrated database, with the remedy", () => {
    expect(src).toMatch(/to_regclass\('public\.roadmap_node_resources'\)/);
    expect(src).toMatch(/node load\/migrate\.js/);
  });

  it("fails loudly if it produced orphans or duplicates", () => {
    expect(src).toMatch(/orphan rows/);
    expect(src).toMatch(/duplicate pairs/);
  });

  it("names the target host but never the password", () => {
    expect(src).toMatch(/new URL\(url\)\.host/);
    expect(src).not.toMatch(/console\.(log|error)\([^)]*\$\{url\}/);
  });
});

describe("deploy wiring", () => {
  it("exposes migrate / seed / verify as documented scripts", () => {
    expect(pkg.scripts["db:migrate"]).toBe("node load/migrate.js");
    expect(pkg.scripts["db:seed:roadmaps"]).toContain("seed-node-resources.js");
    expect(pkg.scripts["db:verify"]).toBe("node load/verify-roadmap-shelf.js");
  });

  it("never runs migrations from the build or install", () => {
    // Every Vercel preview points at the same shared database; a build-time
    // migration would apply production DDL from any branch.
    for (const hook of ["prebuild", "postinstall", "predeploy", "deploy", "postbuild"]) {
      expect(pkg.scripts[hook], hook).toBeUndefined();
    }
  });

  it("ships a read-only verifier that cannot write", () => {
    const verify = read("load/verify-roadmap-shelf.js");
    expect(verify).toMatch(/readonly: true/);
    // Strip prose: line comments and double-quoted strings (which contain the
    // human-readable remedy, e.g. "ALTER DEFAULT PRIVILEGES"). What remains is
    // executable code, including template-literal SQL.
    const code = verify
      .replace(/\/\/.*$/gm, "")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const verb of ["INSERT INTO", "UPDATE ", "DELETE FROM", "ALTER ", "CREATE ", "DROP ", "TRUNCATE"]) {
      expect(code, verb).not.toContain(verb);
    }
  });

  it("documents the Vercel ordering constraint in the runbook", () => {
    const docs = read("docs/15-deploy-and-operations.md");
    expect(docs).toMatch(/roadmap_node_resources/);
    expect(docs).toMatch(/db:verify/);
    expect(docs).toMatch(/schema before code|Schema before code/i);
  });
});