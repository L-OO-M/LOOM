import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  // NOTE: name is insert-only — reruns never clobber a renamed chapter.
  await sql`
    INSERT INTO tenants (id, slug, name, status)
    VALUES ('550e8400-e29b-41d4-a716-446655440000', 'demo-college', 'MSIT', 'active')
    ON CONFLICT (slug) DO NOTHING
  `;
  const [tenant] = await sql`SELECT id FROM tenants WHERE slug = 'demo-college' LIMIT 1`;

  await sql`
    INSERT INTO tenant_domains (tenant_id, domain, is_primary)
    VALUES (${tenant.id}, 'localhost', true)
    ON CONFLICT (domain) DO NOTHING
  `;

  const flags = [
    { key: "github_integration", enabled: false },
    { key: "contests", enabled: true },
    { key: "mentorship", enabled: true },
    { key: "leaderboards", enabled: true },
    { key: "ai_assistant", enabled: false }
  ];

  for (const flag of flags) {
    await sql`
      INSERT INTO feature_flags (tenant_id, key, enabled)
      VALUES (${tenant.id}, ${flag.key}, ${flag.enabled})
      ON CONFLICT DO NOTHING
    `;
  }

  console.log("Seed complete — tenant:", tenant.id);
  console.log("Next: register at /register, sign in at /login, then claim the first admin at /setup");
} catch (e) {
  console.error("Seed failed:", e.message);
} finally {
  await sql.end();
}