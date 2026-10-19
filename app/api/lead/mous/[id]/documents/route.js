import { randomUUID } from "node:crypto";
import { ok, fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { getMou, nextDocumentVersion } from "@/lib/mou";
import { validateUpload, buildStoragePath } from "@/lib/media";
import { uploadObject, removeObjects } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

export async function GET(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);
  const mou = await getMou(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);
  return ok({ documents: mou.documents });
}

export async function POST(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);

  const mou = await getMou(sql, { tenantId: tenant.id, id });
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "Expected a multipart form with a file", 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return fail("VALIDATION_ERROR", "A file is required", 400);
  const label = String(form.get("label") || "Agreement").trim().slice(0, 80) || "Agreement";

  const check = validateUpload({ name: file.name, mime: file.type, size: file.size });
  if (!check.ok) return fail(check.code, check.message, 400);

  const version = await nextDocumentVersion(sql, { tenantId: tenant.id, mouId: id, label });
  const path = buildStoragePath({
    scope: "mou", tenantId: tenant.id, entityId: id, fileId: randomUUID(), version, fileName: file.name
  });

  await uploadObject({ path, body: Buffer.from(await file.arrayBuffer()), contentType: check.mime });
  let document;
  try {
    [document] = await sql`
      INSERT INTO mou_documents
        (tenant_id, mou_id, label, version, storage_path, file_name, mime_type, size_bytes, uploaded_by)
      VALUES
        (${tenant.id}::uuid, ${id}::uuid, ${label}, ${version}, ${path}, ${String(file.name).slice(0, 200)},
         ${check.mime}, ${file.size}, ${user.id})
      RETURNING id, label, version, file_name, mime_type, size_bytes, uploaded_by, created_at
    `;
  } catch (e) {
    await removeObjects(path).catch(() => {});
    throw e;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.document", resource: "mou_documents", resourceId: document.id,
    after: { mouId: id, label, version, name: document.file_name }
  });
  return ok({ document }, { status: 201 });
}
