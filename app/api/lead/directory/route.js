import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { listDirectory } from "@/lib/directory";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE).nullable().optional();

const createSchema = z.object({
  name: z.string().min(2).max(120),
  title: z.string().min(2).max(80),
  userId: z.string().max(64).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  linkedinUrl: z.string().url().max(300).nullable().optional(),
  bio: z.string().max(600).default(""),
  tenureStart: dateField,
  tenureEnd: dateField,
  isCurrent: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

async function departmentInTenant(sql, tenantId, departmentId) {
  const [row] = await sql`
    SELECT id FROM departments
    WHERE id = ${departmentId}::uuid AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  return !!row;
}

async function accountInTenant(sql, tenantId, userId) {
  const [row] = await sql`
    SELECT user_id FROM profiles
    WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  return !!row;
}

export async function GET(request) {
  let ctx;
  try {
    ctx = await requireCan("view_lead_tools");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("department") || null;
  const verticalParam = (searchParams.get("vertical") || "").trim();
  const vertical = ["technical", "non_technical"].includes(verticalParam) ? verticalParam : null;
  const current = searchParams.get("current") === "1";
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const entries = await listDirectory(sql, { tenantId: tenant.id, departmentId, vertical, current, q });
  return ok({ entries });
}

export async function POST(request) {
  let ctx;
  try {
    ctx = await requireCan("manage_leads");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.tenureStart && body.tenureEnd && body.tenureEnd < body.tenureStart) {
    return fail("VALIDATION_ERROR", "Tenure end cannot be before tenure start", 400);
  }
  if (body.departmentId && !(await departmentInTenant(sql, tenant.id, body.departmentId))) {
    return fail("VALIDATION_ERROR", "Unknown department", 400);
  }
  if (body.userId && !(await accountInTenant(sql, tenant.id, body.userId))) {
    return fail("VALIDATION_ERROR", "That account is not in this chapter", 400);
  }

  const [entry] = await sql`
    INSERT INTO lead_directory
      (tenant_id, user_id, name, title, department_id, vertical, email, linkedin_url, bio,
       tenure_start, tenure_end, is_current, sort_order, created_by)
    VALUES
      (${tenant.id}::uuid, ${body.userId ?? null}, ${body.name}, ${body.title}, ${body.departmentId ?? null},
       ${body.vertical ?? null}, ${body.email ?? null}, ${body.linkedinUrl ?? null}, ${body.bio},
       ${body.tenureStart ?? null}, ${body.tenureEnd ?? null}, ${body.isCurrent}, ${body.sortOrder}, ${user.id})
    RETURNING id, name, title, department_id, vertical, is_current, sort_order, created_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "directory.create", resource: "lead_directory", resourceId: entry.id,
    after: { name: entry.name, title: entry.title }
  });
  return ok({ entry }, { status: 201 });
}
