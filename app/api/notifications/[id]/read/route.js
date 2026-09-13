import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

export async function PATCH(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, sql } = ctx;
  const { id } = await params;
  const [row] = await sql`
    UPDATE notifications SET read_at = NOW()
    WHERE id = ${id} AND user_id = ${user.id}
    RETURNING *
  `;
  if (!row) return fail("NOT_FOUND", "Notification not found", 404);
  return ok({ notification: row });
}
