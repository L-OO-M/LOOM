import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  const projects = await sql`SELECT pr.*, p.name as owner_name FROM projects pr LEFT JOIN profiles p ON p.user_id = pr.owner_id WHERE pr.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY pr.created_at DESC LIMIT 50`;
  return ok({ projects });
}
