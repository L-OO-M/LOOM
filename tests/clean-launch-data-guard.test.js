import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// clean-launch-data deletes hardcoded test accounts and auth.users rows. The
// guard must hold in production without needing a database, and --confirm must
// remain the only way to commit. Asserted against the source and by spawning
// the script, so the refusal is proven before any destructive work.

const SCRIPT = path.join("load", "clean-launch-data.js");
const read = () => readFileSync(path.join(process.cwd(), SCRIPT), "utf8");

function run(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "", VERCEL_ENV: "", ...env },
    encoding: "utf8"
  });
}

describe("clean-launch-data production guard", () => {
  const src = read();

  it("refuses with NODE_ENV=production before connecting", () => {
    const result = run({ NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/clean-launch-data refuses to run in production/);
  });

  it("refuses with VERCEL_ENV=production before connecting", () => {
    const result = run({ VERCEL_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/clean-launch-data refuses to run in production/);
  });

  it("places the guard ahead of the client and the transaction", () => {
    const guard = src.indexOf('process.env.NODE_ENV === "production"');
    expect(guard).toBeGreaterThan(-1);
    expect(src.indexOf("VERCEL_ENV")).toBeGreaterThan(guard);
    expect(src.indexOf("postgres(databaseUrl()")).toBeGreaterThan(guard);
    expect(src.indexOf("sql.begin(")).toBeGreaterThan(guard);
  });
});

describe("clean-launch-data confirmation", () => {
  const src = read();

  it("still requires --confirm to commit", () => {
    expect(src).toMatch(/const CONFIRM = process\.argv\.includes\("--confirm"\)/);
    expect(src).toMatch(/if \(!CONFIRM\) throw new DryRun\(\)/);
    expect(src).toMatch(/mode: DRY RUN \(will roll back\)/);
  });
});
