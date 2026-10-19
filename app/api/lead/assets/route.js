import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { ASSET_KINDS, listAssets, normalizeTags, categoryBelongsToTenant } from "@/lib/assets";
import { validateUpload, buildStoragePath } from "@/lib/media";
import { uploadObject, removeObjects } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = (v) => (UUID.test(String(v || "").trim()) ? String(v).trim() : null);

const linkSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(600).default(""),
  kind: z.enum(ASSET_KINDS).default("link"),
  categoryId: z.string().uuid().nullable().optional(),
  tags: z.union([z.array(z.string().max(30)), z.string().max(400)]).optional(),
  externalUrl: z.string().url().max(600)
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

export async function GET(request) {
  let ctx;
  try {
    ctx = await requireCan("view_assets");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const categoryId = asUuid(searchParams.get("category"));
  const kindParam = (searchParams.get("kind") || "").trim();
  const kind = ASSET_KINDS.includes(kindParam) ? kindParam : null;
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const assets = await listAssets(sql, { tenantId: tenant.id, categoryId, kind, q });
  return ok({ assets });
}

export async function POST(request) {
  let ctx;
  try {
    ctx = await requireCan("manage_assets");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return createFileAsset({ request, user, tenant, sql });
  }
  return createLinkAsset({ request, user, tenant, sql });
}

async function createFileAsset({ request, user, tenant, sql }) {
  const form = await request.formData();
  const title = String(form.get("title") || "").trim().slice(0, 160);
  const description = String(form.get("description") || "").trim().slice(0, 600);
  const kindRaw = String(form.get("kind") || "document");
  const kind = ASSET_KINDS.includes(kindRaw) ? kindRaw : "document";
  const categoryId = asUuid(form.get("categoryId"));
  const tags = normalizeTags(form.get("tags"));
  const file = form.get("file");

  if (title.length < 2) return fail("VALIDATION_ERROR", "A title is required", 400);
  if (!file || typeof file === "string") return fail("VALIDATION_ERROR", "A file is required", 400);

  const check = validateUpload({ name: file.name, mime: file.type, size: file.size });
  if (!check.ok) return fail(check.code, check.message, 400);
  if (categoryId && !(await categoryBelongsToTenant(sql, tenant.id, categoryId))) {
    return fail("VALIDATION_ERROR", "Unknown category", 400);
  }

  const id = randomUUID();
  const fileId = randomUUID();
  const path = buildStoragePath({
    scope: "assets", tenantId: tenant.id, entityId: id, fileId, version: 1, fileName: file.name
  });

  await uploadObject({ path, body: Buffer.from(await file.arrayBuffer()), contentType: check.mime });
  try {
    await sql`
      INSERT INTO media_assets
        (id, tenant_id, category_id, kind, title, description, tags, storage_path, mime_type, size_bytes, current_version, created_by)
      VALUES
        (${id}::uuid, ${tenant.id}::uuid, ${categoryId}::uuid, ${kind}, ${title}, ${description},
         ${tags}::text[], ${path}, ${check.mime}, ${file.size}, 1, ${user.id})
    `;
    await sql`
      INSERT INTO asset_versions
        (tenant_id, asset_id, version, storage_path, file_name, mime_type, size_bytes, uploaded_by)
      VALUES
        (${tenant.id}::uuid, ${id}::uuid, 1, ${path}, ${String(file.name).slice(0, 200)}, ${check.mime}, ${file.size}, ${user.id})
    `;
  } catch (e) {
    // The object is already uploaded; drop it so a failed insert leaves no orphan.
    await removeObjects(path).catch(() => {});
    throw e;
  }

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "asset.create", resource: "media_assets", resourceId: id,
    after: { title, kind, mime: check.mime }
  });
  return ok({ asset: { id, title, kind } }, { status: 201 });
}

async function createLinkAsset({ request, user, tenant, sql }) {
  let body;
  try {
    body = linkSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const categoryId = body.categoryId ? asUuid(body.categoryId) : null;
  if (categoryId && !(await categoryBelongsToTenant(sql, tenant.id, categoryId))) {
    return fail("VALIDATION_ERROR", "Unknown category", 400);
  }
  const tags = normalizeTags(body.tags);
  const id = randomUUID();
  const [asset] = await sql`
    INSERT INTO media_assets
      (id, tenant_id, category_id, kind, title, description, tags, external_url, current_version, created_by)
    VALUES
      (${id}::uuid, ${tenant.id}::uuid, ${categoryId}::uuid, ${body.kind}, ${body.title}, ${body.description},
       ${tags}::text[], ${body.externalUrl}, 1, ${user.id})
    RETURNING id, title, kind, external_url
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "asset.create", resource: "media_assets", resourceId: id, after: { title: body.title, kind: body.kind }
  });
  return ok({ asset }, { status: 201 });
}
