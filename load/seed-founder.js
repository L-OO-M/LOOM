// Seed a permanent founder seat in platform_admins.
//
// Founder seats are the only accounts that never rotate. They cannot be
// created through the UI after the first claim, precisely so a yearly
// committee cannot promote itself into permanence. This script is the
// deliberate, audited path for adding a co-founder.
//
// Usage:
//   node load/seed-founder.js --user-id <profiles.user_id> --label "Founder"
//   node load/seed-founder.js --email founder@example.com --label "Co-founder"
//
// Idempotent: re-running updates the label but never duplicates the seat.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const userIdArg = arg("--user-id");
const emailArg = arg("--email");
const label = arg("--label") || "Founder";

if (!userIdArg && !emailArg) {
  console.error("Usage: node load/seed-founder.js --user-id <id> [--label Founder]");
  console.error("   or: node load/seed-founder.js --email <email> [--label Founder]");
  process.exit(1);
}

const sql = postgres(databaseUrl(), { max: 1 });

try {
  let userId = userIdArg;
  if (!userId && emailArg) {
    const [identity] = await sql`
      SELECT user_id FROM public.user_identities
      WHERE lower(email) = lower(${emailArg})
      ORDER BY updated_at DESC LIMIT 1
    `;
    userId = identity?.user_id || null;
  }
  if (!userId) {
    console.error("No canonical user id found. Sign in once, then pass --user-id from profiles.");
    process.exit(1);
  }

  const [profile] = await sql`
    SELECT user_id, name, role, tenant_id FROM public.profiles WHERE user_id = ${userId} LIMIT 1
  `;
  if (!profile) {
    console.error(`No profile row for ${userId}. The account must sign in before it can hold a seat.`);
    process.exit(1);
  }

  const [seat] = await sql`
    INSERT INTO public.platform_admins (user_id, is_founder, locked, label)
    VALUES (${userId}, true, true, ${label})
    ON CONFLICT (user_id) DO UPDATE
      SET is_founder = true, locked = true, label = EXCLUDED.label
    RETURNING user_id, is_founder, locked, label
  `;

  if (profile.role !== "admin") {
    await sql`UPDATE public.profiles SET role = 'admin', role_term_start = NULL, role_term_end = NULL WHERE user_id = ${userId}`;
  }

  await sql`
    INSERT INTO public.audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
    VALUES (
      ${userId}, ${profile.tenant_id ?? null}, 'admin.seed_founder', 'platform_admins', ${userId},
      ${sql.json({ label, is_founder: true, locked: true })},
      ${sql.json({ tenant_id: profile.tenant_id ?? null })}
    )
  `;

  console.log(`Founder seat ready: ${profile.name || userId} (${seat.label}) — permanent, locked.`);
} finally {
  await sql.end();
}
