import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { isAdmin } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  amount: z.number().min(0).max(1000000000).default(0),
  status: z.enum(["pipeline", "committed", "received"]).default("pipeline"),
  contact: z.string().max(300).nullable().optional()
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(200).optional(),
  amount: z.number().min(0).max(1000000000).optional(),
  status: z.enum(["pipeline", "committed", "received"]).optional(),
  contact: z.string().max(300).nullable().optional()
});

// Sponsorship pipeline: admin only, both create and update.
export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  if (!isAdmin({ role: profile.role })) return fail("FORBIDDEN", "Admin only", 403);
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [row] = await sql`
    INSERT INTO sponsorships (tenant_id, name, amount, status, contact)
    VALUES (${tenant?.id ?? null}, ${body.name}, ${body.amount}, ${body.status}, ${body.contact || null})
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
  if (!isAdmin({ role: profile.role })) return fail("FORBIDDEN", "Admin only", 403);
  let body;
  try {
    body = updateSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  const [row] = await sql`
    UPDATE sponsorships SET
      name = COALESCE(${body.name ?? null}, name),
      amount = COALESCE(${body.amount ?? null}, amount),
      status = COALESCE(${body.status ?? null}, status),
      contact = COALESCE(${body.contact ?? null}, contact)
    WHERE id = ${body.id} AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    RETURNING *
  `;
  if (!row) return fail("NOT_FOUND", "Sponsorship not found", 404);
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "updated_sponsorship",
    resource: "sponsorship", resourceId: body.id, after: { status: row.status }
  });
  return ok({ sponsorship: row });
}
