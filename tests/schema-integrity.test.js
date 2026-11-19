import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(path, "utf8");

describe("schema integrity migrations", () => {
  it("makes planner ownership match the text account key and guards project claims", () => {
    const migration = read("load/migrations/058_schema_integrity.sql");
    expect(migration).toMatch(/owner_user_id TYPE text/i);
    expect(migration).toMatch(/projects_tenant_owner_repo_unique/);
  });

  it("allows a retired project's repo to be claimed again", () => {
    const migration = read("load/migrations/059_project_repo_unique_active.sql");
    expect(migration).toMatch(/DROP INDEX IF EXISTS public\.projects_tenant_owner_repo_unique/i);
    expect(migration).toMatch(/status <> 'archived'/i);
  });

  it("never casts planner ownership back to uuid in application code", () => {
    // 058 made owner_user_id text because account keys are not always UUIDs
    // (`auth0|...`). A stray ::uuid on that column throws at runtime and aborts
    // whatever transaction wraps it, so scan the source instead of trusting the
    // migration alone. regress: handover planner reassignment and the planner
    // ownership route both carried the cast after 058 landed.
    const files = [];
    for (const root of ["app", "lib"]) {
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith(".js")) files.push(path);
        }
      };
      walk(root);
    }

    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) =>
      /owner_user_id[^\n]*::uuid/.test(read(file))
    );
    expect(offenders).toEqual([]);
  });
});

describe("columns the schema actually has", () => {
  // Three production 500s traced to SELECTs naming columns that do not exist.
  // Each one rendered HTML (a page) or an empty body (a CSV export) instead of a
  // number, so only a runtime sweep found it. This scan fails the unit suite the
  // moment one comes back.
  //
  //   profiles.email        -> moved to user_identities.email (047); profiles
  //                            only has email_verified_at / _verification_source
  //   student_roadmap_progress.created_at -> the column is updated_at
  const BANNED = [
    { pattern: /\bp\.email\b/, why: "profiles has no email column; join user_identities" },
    { pattern: /\bsrp\.created_at\b/, why: "student_roadmap_progress only has updated_at" }
  ];

  it("never selects a column the schema dropped", () => {
    const files = [];
    for (const root of ["app", "lib", "components"]) {
      const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) walk(path);
          else if (entry.name.endsWith(".js") || entry.name.endsWith(".jsx")) files.push(path);
        }
      };
      walk(root);
    }

    // Strip line comments first: the fixes for these three bugs explain
    // themselves by naming the column, and prose must not fail the scan.
    const codeOnly = (text) =>
      text
        .split("\n")
        .filter((line) => {
          const trimmed = line.trimStart();
          return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
        })
        .join("\n");

    expect(files.length).toBeGreaterThan(200);
    const offenders = [];
    for (const file of files) {
      const text = codeOnly(read(file));
      for (const { pattern, why } of BANNED) {
        if (pattern.test(text)) offenders.push(`${file}: ${why}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
