import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";

const createSchema = z.object({
  title: z.string().min(3).max(120),
  code: z.string().min(1).max(8000),
  language: z.string().min(1).max(30).default("javascript"),
  domain: z.string().min(1).max(40).default("general"),
  description: z.string().max(500).default(""),
  tags: z.array(z.string().max(30)).max(5).default([])
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const language = (searchParams.get("language") || "").trim().slice(0, 30);
  const domain = (searchParams.get("domain") || "").trim().slice(0, 40);
  const snippets = await sql`
    SELECT s.*, p.name AS author_name FROM code_snippets s
    LEFT JOIN profiles p ON p.user_id = s.author_id
    WHERE (s.tenant_id IS NULL OR s.tenant_id = ${tenant?.id ?? null}::uuid) AND s.status = 'visible'
      AND (${language} = '' OR s.language = ${language})
      AND (${domain} = '' OR s.domain = ${domain})
      AND (${q} = '' OR (s.title ILIKE ${`%${q}%`} OR s.code ILIKE ${`%${q}%`} OR s.description ILIKE ${`%${q}%`}))
    ORDER BY s.upvote_count DESC, s.created_at DESC LIMIT 50
  `;
  return ok({ snippets });
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
  const [snippet] = await sql`
    INSERT INTO code_snippets (tenant_id, author_id, domain, language, title, code, description, tags)
    VALUES (${tenant?.id ?? null}, ${user.id}, ${body.domain}, ${body.language}, ${body.title}, ${body.code}, ${body.description}, ${body.tags})
    RETURNING *
  `;
  return ok({ snippet }, { status: 201 });
}
