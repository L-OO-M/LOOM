import { readFileSync } from "node:fs";
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
});
