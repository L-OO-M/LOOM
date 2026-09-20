import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";

const schema = z.object({
  available: z.boolean(),
  topics: z.array(z.string().max(40)).max(10).optional(),
});

export async function GET() {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  const [row] = await sql`SELECT * FROM helper_profiles WHERE user_id=${user.id} LIMIT 1`;
  return ok({ profile: row || { user_id: user.id, tenant_id: tenant?.id, available: true, topics: [], last_active_at: new Date().toISOString() } });
}

export async function PATCH(request) {
  let ctx;
  try { ctx = await requireCan("help:request"); } catch (e) { const g = toGuardResponse(e); if (g) return fail(g.error.code, g.error.message, g.status); throw e; }
  const { user, tenant, sql } = ctx;
  let body;
  try { body = schema.parse(await request.json()); } catch (e) { return validationError(e); }
  const topics = body.topics ? `{${body.topics.map(t=>`"${t.replace(/"/g,'')}"`).join(",")}}` : null;
  const [row] = await sql`
    INSERT INTO helper_profiles (user_id, tenant_id, available, topics, last_active_at, updated_at)
    VALUES (${user.id}, ${tenant?.id ?? null}::uuid, ${body.available}, ${topics}::text[] , now(), now())
    ON CONFLICT (user_id) DO UPDATE SET available=EXCLUDED.available, topics=COALESCE(EXCLUDED.topics, helper_profiles.topics), updated_at=now(), last_active_at=now()
    RETURNING *
  `;
  return ok({ profile: row });
}
