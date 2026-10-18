import { ok, fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { listCategories } from "@/lib/assets";

export async function GET() {
  let ctx;
  try {
    ctx = await requireCan("view_assets");
  } catch (e) {
    const g = toGuardResponse(e);
    if (g) return fail(g.error.code, g.error.message, g.status);
    throw e;
  }
  const categories = await listCategories(ctx.sql, ctx.tenant.id);
  return ok({ categories });
}
