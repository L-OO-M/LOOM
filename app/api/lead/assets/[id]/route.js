import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { ASSET_KINDS, getAsset, normalizeTags, categoryBelongsToTenant } from "@/lib/assets";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(600).optional(),
  kind: z.enum(ASSET_KINDS).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.union([z.array(z.string().max(30)), z.string().max(400)]).optional(),
  externalUrl: z.string().url().max(600).nullable().optional(),
  isActive: z.boolean().optional()
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

export async function GET(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_assets");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Asset not found", 404);
  const asset = await getAsset(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!asset) return fail("NOT_FOUND", "Asset not found", 404);
  return ok({ asset });
}

export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_assets");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Asset not found", 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const existing = await getAsset(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "Asset not found", 404);

  if (body.categoryId !== undefined && body.categoryId !== null) {
    if (!(await categoryBelongsToTenant(sql, tenant.id, body.categoryId))) {
      return fail("VALIDATION_ERROR", "Unknown category", 400);
    }
  }

  const next = {
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    kind: body.kind ?? existing.kind,
    categoryId: body.categoryId === undefined ? existing.category_id : body.categoryId,
    tags: body.tags === undefined ? existing.tags : normalizeTags(body.tags),
    externalUrl: body.externalUrl === undefined ? existing.external_url : body.externalUrl,
    isActive: body.isActive === undefined ? existing.is_active : body.isActive
  };

  const [updated] = await sql`
    UPDATE media_assets SET
      title = ${next.title},
      description = ${next.description},
      kind = ${next.kind},
      category_id = ${next.categoryId}::uuid,
      tags = ${next.tags}::text[],
      external_url = ${next.externalUrl},
      is_active = ${next.isActive},
      updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    RETURNING id, title, description, kind, category_id, tags, storage_path, external_url, mime_type,
              size_bytes, current_version, is_active, created_at, updated_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "asset.update", resource: "media_assets", resourceId: id,
    before: { title: existing.title, kind: existing.kind, isActive: existing.is_active },
    after: { title: updated.title, kind: updated.kind, isActive: updated.is_active }
  });
  return ok({ asset: updated });
}

export async function DELETE(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_assets");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Asset not found", 404);

  const [updated] = await sql`
    UPDATE media_assets SET is_active = false, updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND is_active
    RETURNING id, title
  `;
  if (!updated) return fail("NOT_FOUND", "Asset not found", 404);

  // Soft delete keeps file versions for recovery; objects are left in storage.
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "asset.archive", resource: "media_assets", resourceId: id,
    before: { title: updated.title }, after: { isActive: false }
  });
  return ok({ archived: true, id });
}
