import { ok, fail } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

// Volunteer signup: any authenticated member may take a seat or release it.
// Capacity is enforced against a live count; re-signup is idempotent.
export async function POST(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  const tid = tenant?.id ?? null;
  const [slot] = await sql`
    SELECT * FROM volunteer_slots WHERE id = ${id}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!slot) return fail("NOT_FOUND", "Volunteer slot not found", 404);
  const [existing] = await sql`SELECT * FROM volunteer_signups WHERE slot_id = ${id} AND user_id = ${user.id} LIMIT 1`;
  if (existing) return ok({ signup: existing, already: true });
  const enrolled = await sql.begin(async (tx) => {
    const [locked] = await tx`SELECT capacity FROM volunteer_slots WHERE id = ${id} FOR UPDATE`;
    if (!locked) return null;
    const [{ count }] = await tx`SELECT COUNT(*)::int AS count FROM volunteer_signups WHERE slot_id = ${id} FOR UPDATE`;
    if (count >= locked.capacity) return "FULL";
    const [row] = await tx`
      INSERT INTO volunteer_signups (slot_id, user_id)
      VALUES (${id}, ${user.id})
      ON CONFLICT (slot_id, user_id) DO NOTHING
      RETURNING *
    `;
    return row || "EXISTS";
  });
  if (enrolled === null) return fail("NOT_FOUND", "Volunteer slot not found", 404);
  if (enrolled === "FULL") return fail("EVENT_FULL", "This volunteer slot is full", 409);
  const signup = enrolled === "EXISTS" ? existing : enrolled;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "volunteer_signup",
    resource: "volunteer_slot", resourceId: id, after: { slotId: id }
  });
  return ok({ signup: signup || existing }, { status: 201 });
}

export async function DELETE(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { id } = await params;
  const tid = tenant?.id ?? null;
  const [slot] = await sql`
    SELECT id FROM volunteer_slots WHERE id = ${id}
      AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) LIMIT 1
  `;
  if (!slot) return fail("NOT_FOUND", "Volunteer slot not found", 404);
  await sql`DELETE FROM volunteer_signups WHERE slot_id = ${id} AND user_id = ${user.id}`;
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id, action: "volunteer_cancel",
    resource: "volunteer_slot", resourceId: id
  });
  return ok({ cancelled: true });
}
