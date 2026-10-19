import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { getEntry } from "@/lib/directory";
import { canAccessVertical } from "@/lib/scope";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE).nullable().optional();

const patchSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  title: z.string().min(2).max(80).optional(),
  userId: z.string().max(64).nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
  email: z.string().email().max(160).nullable().optional(),
  linkedinUrl: z.string().url().max(300).nullable().optional(),
  bio: z.string().max(600).optional(),
  tenureStart: dateField,
  tenureEnd: dateField,
  isCurrent: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  isActive: z.boolean().optional()
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
}

async function departmentInTenant(sql, tenantId, departmentId) {
  const [row] = await sql`
    SELECT id, vertical FROM departments
    WHERE id = ${departmentId}::uuid AND tenant_id = ${tenantId}::uuid LIMIT 1`;
  return row || null;
}

async function accountInTenant(sql, tenantId, userId) {
  const [row] = await sql`
    SELECT user_id FROM profiles
    WHERE user_id = ${userId} AND tenant_id = ${tenantId}::uuid LIMIT 1`;
  return !!row;
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
  if (!UUID.test(id)) return fail("NOT_FOUND", "Directory entry not found", 404);
  const entry = await getEntry(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!entry) return fail("NOT_FOUND", "Directory entry not found", 404);
  if (entry.vertical != null && !canAccessVertical(ctx.profile, entry.vertical)) {
    return fail("FORBIDDEN", "That leader belongs to another domain", 403);
  }
  return ok({ entry });
}

export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_leads");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Directory entry not found", 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const existing = await getEntry(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "Directory entry not found", 404);
  if (!canAccessVertical(ctx.profile, existing.vertical)) {
    return fail("FORBIDDEN", "That leader belongs to another domain", 403);
  }

  let department = null;
  if (body.departmentId !== undefined && body.departmentId !== null) {
    department = await departmentInTenant(sql, tenant.id, body.departmentId);
    if (!department) return fail("VALIDATION_ERROR", "Unknown department", 400);
  }
  if (body.userId !== undefined && body.userId !== null
      && !(await accountInTenant(sql, tenant.id, body.userId))) {
    return fail("VALIDATION_ERROR", "That account is not in this chapter", 400);
  }

  const next = {
    name: body.name ?? existing.name,
    title: body.title ?? existing.title,
    userId: body.userId === undefined ? existing.user_id : body.userId,
    departmentId: body.departmentId === undefined ? existing.department_id : body.departmentId,
    vertical: body.vertical === undefined ? existing.vertical : body.vertical,
    email: body.email === undefined ? existing.email : body.email,
    linkedinUrl: body.linkedinUrl === undefined ? existing.linkedin_url : body.linkedinUrl,
    bio: body.bio ?? existing.bio,
    tenureStart: body.tenureStart === undefined ? existing.tenure_start : body.tenureStart,
    tenureEnd: body.tenureEnd === undefined ? existing.tenure_end : body.tenureEnd,
    isCurrent: body.isCurrent === undefined ? existing.is_current : body.isCurrent,
    sortOrder: body.sortOrder === undefined ? existing.sort_order : body.sortOrder,
    isActive: body.isActive === undefined ? existing.is_active : body.isActive
  };
  if (next.tenureStart && next.tenureEnd && next.tenureEnd < next.tenureStart) {
    return fail("VALIDATION_ERROR", "Tenure end cannot be before tenure start", 400);
  }
  if (department?.vertical) {
    if (next.vertical && next.vertical !== department.vertical) {
      return fail("VALIDATION_ERROR", "The entry's vertical must match its department", 400);
    }
    next.vertical = department.vertical;
  }
  if (!canAccessVertical(ctx.profile, next.vertical)) {
    return fail("FORBIDDEN", "You can only move a leader within your own domain", 403);
  }

  const [entry] = await sql`
    UPDATE lead_directory SET
      name = ${next.name}, title = ${next.title}, user_id = ${next.userId},
      department_id = ${next.departmentId}, vertical = ${next.vertical}, email = ${next.email},
      linkedin_url = ${next.linkedinUrl}, bio = ${next.bio}, tenure_start = ${next.tenureStart},
      tenure_end = ${next.tenureEnd}, is_current = ${next.isCurrent}, sort_order = ${next.sortOrder},
      is_active = ${next.isActive}, updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    RETURNING id, name, title, department_id, vertical, email, linkedin_url, bio,
              tenure_start, tenure_end, is_current, sort_order, is_active, created_at, updated_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "directory.update", resource: "lead_directory", resourceId: id,
    before: { title: existing.title, isCurrent: existing.is_current },
    after: { title: entry.title, isCurrent: entry.is_current }
  });
  return ok({ entry });
}

export async function DELETE(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_leads");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "Directory entry not found", 404);

  const existing = await getEntry(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "Directory entry not found", 404);
  if (!canAccessVertical(ctx.profile, existing.vertical)) {
    return fail("FORBIDDEN", "That leader belongs to another domain", 403);
  }

  const [entry] = await sql`
    UPDATE lead_directory SET is_active = false, updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND is_active
    RETURNING id, name
  `;
  if (!entry) return fail("NOT_FOUND", "Directory entry not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "directory.archive", resource: "lead_directory", resourceId: id,
    before: { name: entry.name }, after: { isActive: false }
  });
  return ok({ archived: true, id });
}
