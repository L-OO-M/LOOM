import postgres from "postgres";

const DATABASE_URL = "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [tenant] = await sql`
    INSERT INTO tenants (id, slug, name, status)
    VALUES ('550e8400-e29b-41d4-a716-446655440000', 'demo-college', 'Demo College', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `;

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
  console.log("Next: create a Supabase Auth user via the dashboard, then run load/seed-profiles.js with their user ID");
} catch (e) {
  console.error("Seed failed:", e.message);
} finally {
  await sql.end();
}