import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { slugify } from "@/lib/community";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  content: z.string().max(20000).default(""),
  domain: z.string().min(1).max(40).default("general")
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const pages = await sql`
    SELECT w.*, p.name AS author_name FROM wiki_pages w
    LEFT JOIN profiles p ON p.user_id = w.author_id
    WHERE w.tenant_id = ${tenant?.id ?? null}::uuid AND w.status = 'published'
      AND (${q} = '' OR (w.title ILIKE ${`%${q}%`} OR w.content ILIKE ${`%${q}%`}))
    ORDER BY w.updated_at DESC LIMIT 50
  `;
  return ok({ pages });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const slug = slugify(body.title);
  const [page] = await sql`
    INSERT INTO wiki_pages (tenant_id, slug, title, content, domain, author_id)
    VALUES (${tenant?.id ?? null}, ${slug}, ${body.title}, ${body.content}, ${body.domain}, ${user.id})
    ON CONFLICT (tenant_id, slug) DO NOTHING
    RETURNING *
  `;
  if (!page) return fail("DUPLICATE", "A page with this title already exists", 409);
  return ok({ page }, { status: 201 });
}
