import { fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { PLANNER_ENABLED } from "@/lib/feature-flags";
import { loadPlanner } from "@/lib/planner-data";
import { toIcs } from "@/lib/planner";

export async function GET(request) {
  if (!PLANNER_ENABLED) return fail("NOT_FOUND", "Planner is disabled", 404);
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track") || "all";
  const data = await loadPlanner({ sql, tenantId: tenant.id, track });
  const ics = toIcs(data);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="loom-collective-planner-2026-27.ics"',
      "Cache-Control": "no-store",
    },
  });
}
