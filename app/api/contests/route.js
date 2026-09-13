import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";

export async function GET() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const contests = await sql`
    SELECT * FROM contests
    WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY starts_at NULLS LAST, created_at DESC LIMIT 50
  `;
  const regs = await sql`SELECT contest_id FROM contest_registrations WHERE student_id = ${user.id}`;
  const regSet = new Set(regs.map((r) => r.contest_id));
  return ok({ contests: contests.map((c) => ({ ...c, registered: regSet.has(c.id) })) });
}

const registerSchema = z.object({ contestId: z.string().uuid() });
const submitSchema = z.object({ contestId: z.string().uuid(), url: z.string().url().optional().nullable(), note: z.string().max(2000).optional().nullable() });

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action") || "register";
  const raw = await request.json().catch(() => ({}));

  if (action === "submit") {
    let body;
    try {
      body = submitSchema.parse(raw);
    } catch (e) {
      return validationError(e);
    }
    const [contest] = await sql`SELECT * FROM contests WHERE id = ${body.contestId} LIMIT 1`;
    if (!contest) return fail("NOT_FOUND", "Contest not found", 404);
    if (tenant?.id && contest.tenant_id && contest.tenant_id !== tenant.id) return fail("FORBIDDEN", "Wrong college", 403);
    const [reg] = await sql`SELECT id FROM contest_registrations WHERE contest_id = ${body.contestId} AND student_id = ${user.id} LIMIT 1`;
    if (!reg) return fail("NOT_REGISTERED", "Register for the contest first", 403);
    const [sub] = await sql`
      INSERT INTO contest_submissions (contest_id, student_id, url, note)
      VALUES (${body.contestId}, ${user.id}, ${body.url || null}, ${body.note || null})
      RETURNING *
    `;
    await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "submitted_contest", resource: "contest", resourceId: body.contestId, after: { submissionId: sub.id } });
    return ok({ submission: sub }, { status: 201 });
  }

  let body;
  try {
    body = registerSchema.parse(raw);
  } catch (e) {
    return validationError(e);
  }
  const [contest] = await sql`SELECT * FROM contests WHERE id = ${body.contestId} LIMIT 1`;
  if (!contest) return fail("NOT_FOUND", "Contest not found", 404);
  if (tenant?.id && contest.tenant_id && contest.tenant_id !== tenant.id) return fail("FORBIDDEN", "Wrong college", 403);
  if (contest.status !== "published" && contest.status !== "active" && contest.status !== "open") {
    return fail("NOT_OPEN", "Contest is not open for registration", 403);
  }
  await sql`
    INSERT INTO contest_registrations (contest_id, student_id, status)
    VALUES (${body.contestId}, ${user.id}, 'registered')
    ON CONFLICT (contest_id, student_id) DO NOTHING
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "registered_contest", resource: "contest", resourceId: body.contestId, after: {} });
  await notify({ sql, tenantId: tenant?.id, userId: user.id, type: "contest", title: `Registered: ${contest.title}`, link: `/student/contests/${contest.id}` });
  return ok({ registered: true });
}
