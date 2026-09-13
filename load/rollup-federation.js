// Daily federation rollup: refreshes chapter_profiles.public_stats and writes
// today's federation_metrics row. Run via cron/scheduler once a day.
// Usage: DATABASE_URL=... node load/rollup-federation.js
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const chapters = await sql`SELECT tenant_id, slug FROM chapter_profiles`;
  const perTenant = [];
  for (const c of chapters) {
    const [{ members = 0 } = {}] = await sql`SELECT COUNT(*)::int AS members FROM profiles WHERE tenant_id = ${c.tenant_id}`;
    const [{ oss = 0 } = {}] = await sql`SELECT COUNT(*)::int AS oss FROM student_oss_contributions WHERE tenant_id = ${c.tenant_id} AND status = 'verified'`;
    const [{ projects = 0 } = {}] = await sql`SELECT COUNT(*)::int AS projects FROM projects WHERE tenant_id = ${c.tenant_id}`;
    const [{ contests = 0 } = {}] = await sql`SELECT COUNT(DISTINCT contest_id)::int AS contests FROM contest_registrations r JOIN contests k ON k.id = r.contest_id WHERE r.student_id IN (SELECT user_id FROM profiles WHERE tenant_id = ${c.tenant_id})`.catch(() => [{ contests: 0 }]);
    const stats = { members, oss_merges: oss, projects, contests };
    await sql`UPDATE chapter_profiles SET public_stats = ${sql.json(stats)}, updated_at = now() WHERE tenant_id = ${c.tenant_id}`;
    perTenant.push({ tenant_id: c.tenant_id, slug: c.slug, ...stats });
  }
  perTenant.sort((a, b) => b.members - a.members);
  const [{ students = 0 } = {}] = await sql`SELECT COUNT(*)::int AS students FROM profiles WHERE tenant_id IS NOT NULL`;
  const [{ ossTotal = 0 } = {}] = await sql`SELECT COUNT(*)::int AS ossTotal FROM student_oss_contributions WHERE status = 'verified'`;
  await sql`
    INSERT INTO federation_metrics (metric_date, total_students, total_chapters, total_oss_contributions, top_tenant_id, per_tenant)
    VALUES (CURRENT_DATE, ${students}, ${chapters.length}, ${ossTotal}, ${perTenant[0]?.tenant_id ?? null}, ${sql.json(perTenant)})
    ON CONFLICT (metric_date) DO UPDATE SET
      total_students = EXCLUDED.total_students,
      total_chapters = EXCLUDED.total_chapters,
      total_oss_contributions = EXCLUDED.total_oss_contributions,
      top_tenant_id = EXCLUDED.top_tenant_id,
      per_tenant = EXCLUDED.per_tenant
  `;
  console.log(`Rolled up ${chapters.length} chapters, ${students} students, ${ossTotal} verified OSS merges`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
