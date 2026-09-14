import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";

const createSchema = z.object({
  slug: z.string().min(1).max(80).optional(),
  question: z.string().min(8).max(300),
  answer: z.string().min(8).max(4000),
  sortOrder: z.number().int().min(0).default(0),
  isPublished: z.boolean().default(true)
});

const patchSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(80).optional(),
  question: z.string().min(8).max(300).optional(),
  answer: z.string().min(8).max(4000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isPublished: z.boolean().optional()
});

// Tiny FAQ manager backing store: list published + drafts for the admin's
// own tenant. Admin only.
export async function GET() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const faqs = await sql`
    SELECT * FROM faqs
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY sort_order ASC, created_at ASC
  `;
  return ok({ faqs });
}

export async function POST(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const slug = body.slug || `faq-${Date.now().toString(36)}`;
  const [faq] = await sql`
    INSERT INTO faqs (tenant_id, slug, question, answer, sort_order, is_published, created_by)
    VALUES (${tenant?.id ?? null}, ${slug}, ${body.question}, ${body.answer}, ${body.sortOrder}, ${body.isPublished}, ${user.id})
    ON CONFLICT (tenant_id, slug) DO UPDATE SET
      question = EXCLUDED.question, answer = EXCLUDED.answer,
      sort_order = EXCLUDED.sort_order, is_published = EXCLUDED.is_published,
      updated_at = now()
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "upserted_faq", resource: "faq", resourceId: faq.id, after: { slug, question: body.question } });
  return ok({ faq }, { status: 201 });
}

export async function PATCH(request) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error) return fail(ctx.error, ctx.error === "FORBIDDEN" ? "Admin only" : "Auth required", ctx.error === "FORBIDDEN" ? 403 : 401);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = patchSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const tid = tenant?.id ?? null;
  const [before] = await sql`
    SELECT * FROM faqs
    WHERE id = ${body.id} AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    LIMIT 1
  `;
  if (!before) return fail("NOT_FOUND", "FAQ not found", 404);
  const [faq] = await sql`
    UPDATE faqs SET
      slug = COALESCE(${body.slug ?? null}, slug),
      question = COALESCE(${body.question ?? null}, question),
      answer = COALESCE(${body.answer ?? null}, answer),
      sort_order = COALESCE(${body.sortOrder ?? null}, sort_order),
      is_published = COALESCE(${body.isPublished ?? null}, is_published),
      updated_at = now()
    WHERE id = ${body.id}
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "updated_faq", resource: "faq", resourceId: faq.id, before: { question: before.question, is_published: before.is_published }, after: { question: faq.question, is_published: faq.is_published } });
  return ok({ faq });
}
