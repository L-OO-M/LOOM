import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";

const createSchema = z.object({
  title: z.string().min(5).max(160),
  body: z.string().max(8000).default(""),
  domain: z.string().min(1).max(40).default("general"),
  tags: z.array(z.string().max(30)).max(5).default([])
});

export async function GET(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { tenant, sql } = ctx;
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const domain = searchParams.get("domain") || "";
  const sort = searchParams.get("sort") === "top" ? "top" : "recent";
  const rawState = searchParams.get("state") || "all";
  const state = ["all", "unsolved", "unanswered"].includes(rawState) ? rawState : "all";
  const order = sort === "top"
    ? sql`ORDER BY t.pinned DESC, t.upvote_count DESC, t.updated_at DESC`
    : sql`ORDER BY t.pinned DESC, t.updated_at DESC`;
  const threads = await sql`
    SELECT t.*, p.name AS author_name FROM forum_threads t
    LEFT JOIN profiles p ON p.user_id = t.author_id
    WHERE t.tenant_id = ${tenant?.id ?? null}::uuid AND t.status = 'visible'
      AND (${domain} = '' OR t.domain = ${domain})
      AND (${state} = 'all' OR (${state} = 'unsolved' AND t.solved = false) OR (${state} = 'unanswered' AND t.reply_count = 0))
      AND (${q} = '' OR (t.title ILIKE ${`%${q}%`} OR t.body ILIKE ${`%${q}%`}))
    ${order}
    LIMIT 50
  `;
  return ok({ threads });
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, tenant, sql } = ctx;
  const limited = checkRateLimit(`threads:${user.id}`, { limit: 10, windowMs: 60000 });
  if (!limited.ok) return fail("RATE_LIMITED", "Too many threads — slow down", 429);
  let body;
  try {
    body = createSchema.parse(await request.json());
  } catch (e) {
    return validationError(e);
  }
  const [thread] = await sql`
    INSERT INTO forum_threads (tenant_id, domain, author_id, title, body, tags)
    VALUES (${tenant?.id ?? null}, ${body.domain}, ${user.id}, ${body.title}, ${body.body}, ${body.tags})
    RETURNING *
  `;
  return ok({ thread }, { status: 201 });
}
