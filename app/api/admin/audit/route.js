import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

const MAX_LIMIT = 200;

function day(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : null;
}

// Paginated, server-filtered audit stream. The page reads the database
// directly for its server-rendered view; this route exists for scripts and
// exports and must honour the same tenant boundary and filters.
export async function GET(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error === "FORBIDDEN") return fail("FORBIDDEN", "Admin only", 403);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const action = (searchParams.get("action") || "").trim();
  const resource = (searchParams.get("resource") || "").trim();
  const from = day(searchParams.get("from"));
  const to = day(searchParams.get("to"));
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10) || 50, 1), MAX_LIMIT);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const offset = (page - 1) * limit;
  const tid = tenant?.id ?? null;

  const [countRow] = await sql`
    SELECT COUNT(*)::int AS total
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE a.tenant_id = ${tid}::uuid
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${action ? sql`a.action = ${action}` : sql`TRUE`})
      AND (${resource ? sql`a.resource = ${resource}` : sql`TRUE`})
      AND (${from ? sql`a.created_at >= ${from}::date` : sql`TRUE`})
      AND (${to ? sql`a.created_at < (${to}::date + INTERVAL '1 day')` : sql`TRUE`})
  `;

  const rows = await sql`
    SELECT a.*, p.name AS actor_name
    FROM audit_logs a
    LEFT JOIN profiles p ON p.user_id = a.actor_id
    WHERE a.tenant_id = ${tid}::uuid
      AND (${q ? sql`(a.action ILIKE ${"%" + q + "%"} OR a.resource ILIKE ${"%" + q + "%"} OR p.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
      AND (${action ? sql`a.action = ${action}` : sql`TRUE`})
      AND (${resource ? sql`a.resource = ${resource}` : sql`TRUE`})
      AND (${from ? sql`a.created_at >= ${from}::date` : sql`TRUE`})
      AND (${to ? sql`a.created_at < (${to}::date + INTERVAL '1 day')` : sql`TRUE`})
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return ok({
    audit: rows,
    total: countRow?.total ?? 0,
    page,
    limit,
    pages: Math.max(1, Math.ceil((countRow?.total ?? 0) / limit))
  });
}
