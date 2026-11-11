import { scope } from "@/lib/tenant-scope";
import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  amount: z.number().min(0).max(1000000000).default(0),
  status: z.enum(["pipeline", "committed", "received"]).default("pipeline"),
  contact: z.string().max(300).nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional()
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(200).optional(),
  amount: z.number().min(0).max(1000000000).optional(),
  status: z.enum(["pipeline", "committed", "received"]).optional(),
  contact: z.string().max(300).nullable().optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional()
});

// Sponsorship pipeline: admins edit everything; vertical leads may edit rows
// inside their own vertical (never society-wide rows or another vertical).
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const admin = isAdmin({ role: profile.role });
  if (!admin && profile.role !== "vertical_lead") {
    return fail("FORBIDDEN", "Only admins and vertical leads can create sponsorships", 403);
  }
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (!admin && body.vertical !== profile.vertical) {
    return fail("FORBIDDEN", "Vertical leads must create sponsorships inside their own vertical", 403);
  }
  const [row] = await sql`
    INSERT INTO sponsorships (tenant_id, name, amount, status, contact, vertical, updated_by)
    VALUES (${tenant?.id ?? null}, ${body.name}, ${body.amount}, ${body.status},
      ${body.contact || null}, ${body.vertical ?? null}, ${user.id})
    RETURNING *
  `;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "created_sponsorship",
    resource: "sponsorship", resourceId: row.id, after: { name: body.name, amount: body.amount }
  });
  return ok({ sponsorship: row }, { status: 201 });
}

export async function PUT(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const admin = isAdmin({ role: profile.role });
  if (!admin && profile.role !== "vertical_lead") {
    return fail("FORBIDDEN", "Only admins and vertical leads can update sponsorships", 403);
  }
  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (!admin && body.vertical && body.vertical !== profile.vertical) {
    return fail("FORBIDDEN", "You can only move sponsorships inside your own vertical", 403);
  }
  const tid = tenant?.id ?? null;
  const [row] = await sql`
    UPDATE sponsorships SET
      name = COALESCE(${body.name ?? null}, name),
      amount = COALESCE(${body.amount ?? null}, amount),
      status = COALESCE(${body.status ?? null}, status),
      contact = COALESCE(${body.contact ?? null}, contact),
      vertical = COALESCE(${body.vertical ?? null}, vertical),
      updated_at = now(),
      updated_by = ${user.id}
    WHERE id = ${body.id} AND tenant_id = ${scope(tid)}::uuid
      AND (${admin ? sql`TRUE` : sql`vertical = ${profile.vertical}`})
    RETURNING *
  `;
  if (!row) return fail("NOT_FOUND", "Sponsorship not found", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "updated_sponsorship",
    resource: "sponsorship", resourceId: body.id, after: { status: row.status }
  });
  return ok({ sponsorship: row });
}
