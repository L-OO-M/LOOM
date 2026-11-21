import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

const schema = z.object({ reason: z.string().min(5).max(1000) });

export async function POST(request, { params }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin access required", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  let body;
  try {
    body = schema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }
  const { id } = await params;
  const { user, tenant, sql } = ctx;
  const certificate = await sql.begin(async (tx) => {
    const [row] = await tx`
      UPDATE certificates
      SET revoked_at = now(), revoked_by = ${user.id}, revocation_reason = ${body.reason}
      WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND revoked_at IS NULL
      RETURNING *
    `;
    if (!row) return null;
    await tx`
      INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, reason, after, metadata)
      VALUES (
        ${user.id}, ${tenant.id}::uuid, 'certificate.revoked', 'certificate',
        ${id}, ${body.reason}, ${tx.json({ verificationCode: row.verification_code })},
        ${tx.json({ tenant_id: tenant.id })}
      )
    `;
    return row;
  });
  if (!certificate) return fail("NOT_FOUND", "Active certificate not found", 404);
  return ok({ certificate });
}
