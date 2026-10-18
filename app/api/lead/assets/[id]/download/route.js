import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { getAsset } from "@/lib/assets";
import { createSignedUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Files are raw anchors (/api/...), never <Link> — see AGENTS.md §3.2.
// This redirects to a short-lived signed URL; a private bucket never exposes
// a permanent public object URL.
export async function GET(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_assets");
  } catch (e) {
    const g = toGuardResponse(e);
    if (g) return fail(g.error.code, g.error.message, g.status);
    throw e;
  }
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Asset not found", 404);

  const asset = await getAsset(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!asset) return fail("NOT_FOUND", "Asset not found", 404);
  if (asset.external_url) return NextResponse.redirect(asset.external_url, 302);
  if (!asset.storage_path) return fail("NOT_FOUND", "No file attached to this asset", 404);

  const url = await createSignedUrl(asset.storage_path);
  return NextResponse.redirect(url, 302);
}
