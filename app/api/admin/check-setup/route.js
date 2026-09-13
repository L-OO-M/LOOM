import { getSql } from "@/lib/db";
import { ok } from "@/lib/api";

export async function GET() {
  const sql = getSql();
  const [row] = await sql`SELECT COUNT(*)::int AS c FROM platform_admins`;
  return ok({ needsSetup: (row?.c ?? 0) === 0 });
}