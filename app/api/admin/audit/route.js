import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { sql } = ctx;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);
  const rows = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ${limit}`;
  return ok({ audit: rows });
}
