import { z } from "zod";
import { getSql } from "@/lib/db";
import { ok, fail } from "@/lib/api";

const bodySchema = z.object({
  userId: z.string().min(1),
  email: z.string().email().optional()
});

export async function POST(request) {
  const sql = getSql();

  const [existing] = await sql`SELECT COUNT(*)::int AS c FROM platform_admins`;
  if ((existing?.c ?? 0) > 0) return fail("ALREADY_SETUP", "Platform admin already exists", 403);

  let body;
  try { body = bodySchema.parse(await request.json()); }
  catch (e) { return fail("INVALID", "Invalid request", 400); }

  const [profile] = await sql`
    SELECT id FROM profiles WHERE user_id = ${body.userId} LIMIT 1
  `;

  if (profile) {
    await sql`UPDATE profiles SET role = 'admin' WHERE user_id = ${body.userId}`;
  } else {
    await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain)
      VALUES (${body.userId}, ${body.email?.split("@")[0] ?? "Admin"}, 'admin', 'web')
    `;
  }

  await sql`
    INSERT INTO platform_admins (user_id)
    VALUES (${body.userId})
    ON CONFLICT (user_id) DO NOTHING
  `;

  return ok({ message: "Admin claimed" });
}