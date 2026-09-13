import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const rows = await sql`
    SELECT * FROM notifications WHERE user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 30
  `;
  const [unread] = await sql`
    SELECT COUNT(*)::int AS c FROM notifications WHERE user_id = ${user.id} AND read_at IS NULL
  `;
  return ok({ notifications: rows, unread: unread?.c ?? 0 });
}
