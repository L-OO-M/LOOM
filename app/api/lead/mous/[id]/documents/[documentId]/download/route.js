import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { createSignedUrl } from "@/lib/storage";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Raw anchor download — see AGENTS.md §3.2. Redirects to a short-lived signed
// URL; the private bucket never exposes a permanent object URL.
export async function GET(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
  } catch (e) {
    const g = toGuardResponse(e);
    if (g) return fail(g.error.code, g.error.message, g.status);
    throw e;
  }
  const { id, documentId } = await params;
  if (!UUID.test(id) || !UUID.test(documentId)) return fail("NOT_FOUND", "Document not found", 404);

  const [doc] = await ctx.sql`
    SELECT id, storage_path FROM mou_documents
    WHERE id = ${documentId}::uuid AND mou_id = ${id}::uuid AND tenant_id = ${ctx.tenant.id}::uuid
    LIMIT 1
  `;
  if (!doc) return fail("NOT_FOUND", "Document not found", 404);

  const url = await createSignedUrl(doc.storage_path);
  return NextResponse.redirect(url, 302);
}
