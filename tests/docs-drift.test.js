import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Offline drift guard for the documents this workstream owns. It cannot compare
// against a live database (PR CI has no production schema), but it catches the
// two failures that actually happened: a duplicate migration number, and docs
// pointing at migration files that no longer exist.

const MIGRATIONS = path.resolve("load/migrations");
const DOC14 = fs.readFileSync(path.resolve("docs/14-database-reference.md"), "utf8");
const DOC15 = fs.readFileSync(path.resolve("docs/15-deploy-and-operations.md"), "utf8");
const DOC17 = fs.readFileSync(path.resolve("docs/17-architecture.md"), "utf8");
const README = fs.readFileSync(path.resolve("README.md"), "utf8");
const AGENTS = fs.readFileSync(path.resolve("AGENTS.md"), "utf8");

const files = fs
  .readdirSync(MIGRATIONS)
  .filter((name) => name.endsWith(".sql"))
  .sort();

describe("migration and documentation drift", () => {
  it("has no duplicate migration prefix", () => {
    // 036 and 036b are intentionally distinct; two bare 036 files are not.
    const seen = new Map();
    for (const file of files) {
      const match = /^(\d{3}[a-z]?)_/.exec(file);
      expect(match, `${file} must start with NNN_name or NNNx_name`).not.toBeNull();
      const prefix = match[1];
      expect(seen.has(prefix), `${prefix} is used by ${seen.get(prefix)} and ${file}`).toBe(false);
      seen.set(prefix, file);
    }
  });

  it("never documents a migration file that does not exist", () => {
    const referenced = [...DOC14.matchAll(/`(\d{3}[a-z]?_[a-z0-9_]+\.sql)`/g)].map((m) => m[1]);
    expect(referenced.length).toBeGreaterThan(20);
    const missing = [...new Set(referenced)].filter((name) => !files.includes(name));
    expect(missing, `docs/14 references removed migrations: ${missing.join(", ")}`).toEqual([]);
  });

  it("keeps docs/17 honest about the data layer and department count", () => {
    expect(DOC17).not.toMatch(/drizzle/i);
    expect(DOC17).not.toMatch(/8 departments|eight departments/i);
    expect(DOC17).toMatch(/11 seeded/);
    expect(DOC17).toMatch(/no ORM or schema mirror/i);
  });

  it("documents the PR CI and staging E2E split", () => {
    const ciDocs = `${DOC15}\n${README}\n${AGENTS}`;
    expect(ciDocs).toMatch(/apply-twice|apply twice/i);
    expect(ciDocs).toMatch(/nightly/i);
    expect(ciDocs).toMatch(/staging/i);
  });

  it("documents the deploy-time environment check", () => {
    expect(DOC15).toMatch(/deploy-env-check|assertDeployEnv/);
  });
});
