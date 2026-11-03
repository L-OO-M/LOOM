import { scope } from "@/lib/tenant-scope";
import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { pageWindow, paginationMeta, requestPage } from "@/lib/pagination";

// docs/25 §4.4: admin lists page at 50 rows. The SQL LIMIT and the offset
// arithmetic share this constant so the stride can never drift from the page.
const PAGE_SIZE = 50;

export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  // `request` is absent when the route is invoked directly (tests); fall back to
  // a bare URL so defaults apply instead of throwing.
  const url = new URL(request?.url ?? "http://localhost/api/admin/projects");
  const { page, pageSize } = requestPage(url.searchParams, { defaultPageSize: PAGE_SIZE });

  // Same tenant scope as the list query below: the count and the page always
  // describe the same set of rows.
  const [{ total = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS total FROM projects pr
    WHERE pr.tenant_id = ${scope(tenant?.id ?? null)}::uuid
  `;
  const win = pageWindow(total, page, pageSize);

  // An explicit page past the end never replays page 1's rows; it returns an
  // empty list with `outOfRange` so the UI can say so honestly.
  let projects = [];
  if (win.total > 0 && !win.outOfRange) {
    projects = await sql`
      SELECT pr.*, p.name as owner_name
      FROM projects pr
      LEFT JOIN profiles p ON p.user_id = pr.owner_id
      WHERE pr.tenant_id = ${scope(tenant?.id ?? null)}::uuid
      ORDER BY pr.created_at DESC, pr.id DESC
      LIMIT ${pageSize} OFFSET ${win.offset}
    `;
  }
  return ok({ projects, pagination: paginationMeta(win) });
}
