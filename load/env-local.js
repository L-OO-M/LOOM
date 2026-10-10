// Shared DATABASE_URL loader for ESM scripts in load/.
// Prefers process.env, falls back to .env.local in the repo root
// (scripts run as `node load/<name>.js` from the root).
// Secrets must NEVER be hardcoded in tracked files.
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    /* no .env.local — env only */
  }
}

loadEnvLocal();

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
  return url;
}

// Used by the region-migration tooling (load/db-transfer.js). Selects the
// Mumbai (ap-south-1) target without disturbing DATABASE_URL, so the app keeps
// talking to Singapore until the cut-over is explicitly performed.
export function targetDatabaseUrl() {
  const url = process.env.DATABASE_URL_TARGET || process.env.DATABASE_URL_MUMBAI;
  if (!url) {
    console.error("DATABASE_URL_TARGET / DATABASE_URL_MUMBAI is not set (checked env + .env.local).");
    process.exit(1);
  }
  return url;
}
