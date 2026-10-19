import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { MOU_PARTNER_TYPES, MOU_STATUSES, listMous } from "@/lib/mou";
import { canAccessVertical, ownedVerticals } from "@/lib/scope";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE).nullable().optional();

const createSchema = z.object({
  title: z.string().min(2).max(160),
  partnerName: z.string().min(2).max(120),
  partnerType: z.enum(MOU_PARTNER_TYPES).default("other"),
  summary: z.string().max(2000).default(""),
  status: z.enum(MOU_STATUSES).default("draft"),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
  valueAmount: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
  valueCurrency: z.string().min(1).max(8).default("INR"),
  signedOn: dateField,
  startsOn: dateField,
  endsOn: dateField,
  notes: z.string().max(2000).default("")
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
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
  const { profile, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const statusParam = (searchParams.get("status") || "").trim();
  const status = MOU_STATUSES.includes(statusParam) ? statusParam : null;
  const expiring = searchParams.get("expiring") === "1";
  const q = (searchParams.get("q") || "").trim().slice(0, 80);
  const mous = await listMous(sql, { tenantId: tenant.id, status, expiring, q });
  // Domain non-interference: leads see their own domain's MoUs (plus
  // society-wide ones); admins see everything.
  const owned = ownedVerticals(profile);
  const scoped = owned.all
    ? mous
    : mous.filter((m) => m.vertical == null || owned.has(m.vertical));
  return ok({ mous: scoped });
}

export async function POST(request) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, profile, tenant, sql } = ctx;

  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  if (body.startsOn && body.endsOn && body.endsOn < body.startsOn) {
    return fail("VALIDATION_ERROR", "The end date cannot be before the start date", 400);
  }
  // Domain non-interference: a lead may only file MoUs for their own domain;
  // society-wide MoUs are admin-only.
  let vertical = body.vertical ?? null;
  if (vertical == null) {
    const owned = ownedVerticals(profile);
    if (!owned.all && owned.size === 1) vertical = [...owned][0];
  }
  if (!canAccessVertical(profile, vertical)) {
    if (vertical == null) {
      return fail("FORBIDDEN", "Only an admin can file a society-wide MoU", 403);
    }
    return fail("FORBIDDEN", "You can only file MoUs for your own domain", 403);
  }

  const [mou] = await sql`
    INSERT INTO mous
      (tenant_id, title, partner_name, partner_type, summary, status, vertical,
       value_amount, value_currency, signed_on, starts_on, ends_on, owner_id, notes)
    VALUES
      (${tenant.id}::uuid, ${body.title}, ${body.partnerName}, ${body.partnerType}, ${body.summary},
       ${body.status}, ${vertical}, ${body.valueAmount ?? null}, ${body.valueCurrency},
       ${body.signedOn ?? null}, ${body.startsOn ?? null}, ${body.endsOn ?? null}, ${user.id}, ${body.notes})
    RETURNING id, title, partner_name, partner_type, status, vertical, value_amount, value_currency,
              signed_on, starts_on, ends_on, owner_id, is_active, created_at, updated_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.create", resource: "mous", resourceId: mou.id,
    after: { title: mou.title, partner: mou.partner_name, status: mou.status }
  });
  return ok({ mou }, { status: 201 });
}
