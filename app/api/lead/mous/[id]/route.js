import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { requireCan, toGuardResponse } from "@/lib/requirePermission";
import { writeAudit } from "@/lib/auth-server";
import { MOU_PARTNER_TYPES, MOU_STATUSES, getMou } from "@/lib/mou";
import { canAccessVertical } from "@/lib/scope";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateField = z.string().regex(DATE).nullable().optional();

const patchSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  partnerName: z.string().min(2).max(120).optional(),
  partnerType: z.enum(MOU_PARTNER_TYPES).optional(),
  summary: z.string().max(2000).optional(),
  status: z.enum(MOU_STATUSES).optional(),
  vertical: z.enum(["technical", "non_technical"]).nullable().optional(),
  valueAmount: z.number().min(0).max(1_000_000_000_000).nullable().optional(),
  valueCurrency: z.string().min(1).max(8).optional(),
  signedOn: dateField,
  startsOn: dateField,
  endsOn: dateField,
  notes: z.string().max(2000).optional(),
  isActive: z.boolean().optional()
});

function guard(e) {
  const g = toGuardResponse(e);
  return g ? fail(g.error.code, g.error.message, g.status) : null;
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
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);
  const mou = await getMou(ctx.sql, { tenantId: ctx.tenant.id, id });
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);
  if (mou.vertical != null && !canAccessVertical(ctx.profile, mou.vertical)) {
    return fail("FORBIDDEN", "That MoU belongs to another domain", 403);
  }
  return ok({ mou });
}

export async function PATCH(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);

  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }

  const existing = await getMou(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "MoU not found", 404);
  if (!canAccessVertical(ctx.profile, existing.vertical)) {
    return fail("FORBIDDEN", "That MoU belongs to another domain", 403);
  }

  const next = {
    title: body.title ?? existing.title,
    partnerName: body.partnerName ?? existing.partner_name,
    partnerType: body.partnerType ?? existing.partner_type,
    summary: body.summary ?? existing.summary,
    status: body.status ?? existing.status,
    vertical: body.vertical === undefined ? existing.vertical : body.vertical,
    valueAmount: body.valueAmount === undefined ? existing.value_amount : body.valueAmount,
    valueCurrency: body.valueCurrency ?? existing.value_currency,
    signedOn: body.signedOn === undefined ? existing.signed_on : body.signedOn,
    startsOn: body.startsOn === undefined ? existing.starts_on : body.startsOn,
    endsOn: body.endsOn === undefined ? existing.ends_on : body.endsOn,
    notes: body.notes ?? existing.notes,
    isActive: body.isActive === undefined ? existing.is_active : body.isActive
  };
  if (next.startsOn && next.endsOn && next.endsOn < next.startsOn) {
    return fail("VALIDATION_ERROR", "The end date cannot be before the start date", 400);
  }
  if (!canAccessVertical(ctx.profile, next.vertical)) {
    return fail("FORBIDDEN", "You can only move a MoU within your own domain", 403);
  }
  // A moved end date resets the reminder so the new date can be announced.
  const endsChanged = String(next.endsOn || "") !== String(existing.ends_on || "");

  const [mou] = await sql`
    UPDATE mous SET
      title = ${next.title}, partner_name = ${next.partnerName}, partner_type = ${next.partnerType},
      summary = ${next.summary}, status = ${next.status}, vertical = ${next.vertical},
      value_amount = ${next.valueAmount}, value_currency = ${next.valueCurrency},
      signed_on = ${next.signedOn}, starts_on = ${next.startsOn}, ends_on = ${next.endsOn},
      notes = ${next.notes}, is_active = ${next.isActive},
      expiry_notified_at = CASE WHEN ${endsChanged} THEN NULL ELSE expiry_notified_at END,
      updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid
    RETURNING id, title, partner_name, partner_type, summary, status, vertical, value_amount,
              value_currency, signed_on, starts_on, ends_on, notes, owner_id, is_active, created_at, updated_at
  `;

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.update", resource: "mous", resourceId: id,
    before: { status: existing.status, endsOn: existing.ends_on },
    after: { status: mou.status, endsOn: mou.ends_on }
  });
  return ok({ mou });
}

export async function DELETE(request, { params }) {
  let ctx;
  try {
    ctx = await requireCan("manage_mou");
  } catch (e) {
    const r = guard(e);
    if (r) return r;
    throw e;
  }
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  if (!UUID.test(id)) return fail("NOT_FOUND", "MoU not found", 404);

  const existing = await getMou(sql, { tenantId: tenant.id, id });
  if (!existing) return fail("NOT_FOUND", "MoU not found", 404);
  if (!canAccessVertical(ctx.profile, existing.vertical)) {
    return fail("FORBIDDEN", "That MoU belongs to another domain", 403);
  }

  const [mou] = await sql`
    UPDATE mous SET is_active = false, updated_at = NOW()
    WHERE id = ${id}::uuid AND tenant_id = ${tenant.id}::uuid AND is_active
    RETURNING id, title
  `;
  if (!mou) return fail("NOT_FOUND", "MoU not found", 404);

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "mou.archive", resource: "mous", resourceId: id,
    before: { title: mou.title }, after: { isActive: false }
  });
  return ok({ archived: true, id });
}
