import { randomUUID } from "node:crypto";
import { ok, fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { getAsset } from "@/lib/assets";
import { validateUpload, buildStoragePath } from "@/lib/media";
import { uploadObject, removeObjects } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

export async function POST(request, { params }) {
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

  const asset = await getAsset(sql, { tenantId: tenant.id, id });
  if (!asset) return fail("NOT_FOUND", "Asset not found", 404);
  if (!asset.storage_path) return fail("VALIDATION_ERROR", "This asset is a link, not an uploaded file", 400);

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "Expected a multipart form with a file", 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return fail("VALIDATION_ERROR", "A file is required", 400);

  const check = validateUpload({ name: file.name, mime: file.type, size: file.size });
  if (!check.ok) return fail(check.code, check.message, 400);

  const version = Number(asset.current_version || 1) + 1;
  const path = buildStoragePath({
    scope: "assets", tenantId: tenant.id, entityId: id, fileId: randomUUID(), version, fileName: file.name
  });

  await uploadObject({ path, body: Buffer.from(await file.arrayBuffer()), contentType: check.mime });
  try {
    await sql`
      INSERT INTO asset_versions
        (tenant_id, asset_id, version, storage_path, file_name, mime_type, size_bytes, uploaded_by)
      VALUES
        (${tenant.id}::uuid, ${id}::uuid, ${version}, ${path}, ${String(file.name).slice(0, 200)},
         ${check.mime}, ${file.size}, ${user.id})
    `;
    await sql`
      UPDATE media_assets SET
        storage_path = ${path}, mime_type = ${check.mime}, size_bytes = ${file.size},
        current_version = ${version}, updated_at = NOW()
      WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    `;
  } catch (e) {
    await removeObjects(path).catch(() => {});
    throw e;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "asset.version", resource: "media_assets", resourceId: id,
    before: { version: asset.current_version },
    after: { version, name: String(file.name).slice(0, 200) }
  });
  return ok({ asset: { id, version } }, { status: 201 });
}
