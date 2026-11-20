import { getSql } from "@/lib/db";
import { ok } from "@/lib/api";
import { firstAdminSetupEnabled } from "@/lib/first-admin";

// Public probe for /setup. It deliberately reports only two booleans:
// whether a platform admin is still missing, and whether online bootstrap is
// configured at all. It never echoes the code or any part of it.
export async function GET() {
  const sql = getSql();
  const [row] = await sql`SELECT COUNT(*)::int AS c FROM platform_admins`;
  return ok({
    needsSetup: (row?.c ?? 0) === 0,
    setupEnabled: firstAdminSetupEnabled()
  });
}
