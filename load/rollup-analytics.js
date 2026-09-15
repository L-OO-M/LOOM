// Daily analytics rollup: per-student snapshots, cohort health, node funnel,
// mentor effectiveness. Run via cron/scheduler once a day.
// Usage: node load/rollup-analytics.js  (needs DATABASE_URL in env or .env.local)
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const [{ nodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;

  // Per-student snapshot (only students with any signal, plus all profiles for pct).
  const students = await sql`SELECT user_id, tenant_id, primary_domain FROM profiles WHERE role = 'student'`;
  for (const s of students) {
    const [act] = await sql`
      SELECT COALESCE(SUM(commits),0)::int AS commits, COALESCE(SUM(pull_requests),0)::int AS prs,
             COALESCE(SUM(reviews),0)::int AS reviews,
             COUNT(DISTINCT CASE WHEN (commits + pull_requests + reviews) > 0 THEN day END)::int AS active_days
      FROM student_daily_activity WHERE student_id = ${s.user_id} AND day >= CURRENT_DATE - 30
    `;
    const [{ done = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS done FROM student_roadmap_progress
      WHERE student_id = ${s.user_id} AND status = 'completed'
    `;
    const [{ oss = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS oss FROM student_oss_contributions
      WHERE student_id = ${s.user_id} AND status = 'verified'
    `;
    const [{ ach = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS ach FROM student_achievements WHERE student_id = ${s.user_id}
    `;
    const pct = nodes > 0 ? Math.round((done / nodes) * 1000) / 10 : 0;
    const consistency = Math.round(((act?.active_days || 0) / 30) * 1000) / 10;
    await sql`
      INSERT INTO student_analytics_snapshots
        (student_id, tenant_id, snapshot_date, total_commits, total_prs, total_reviews,
         roadmap_completion_pct, oss_verified, achievements, consistency_score, active_days_30)
      VALUES (${s.user_id}, ${s.tenant_id}, CURRENT_DATE, ${act?.commits || 0}, ${act?.prs || 0}, ${act?.reviews || 0},
        ${pct}, ${oss}, ${ach}, ${consistency}, ${act?.active_days || 0})
      ON CONFLICT (student_id, snapshot_date) DO UPDATE SET
        total_commits = EXCLUDED.total_commits, total_prs = EXCLUDED.total_prs,
        total_reviews = EXCLUDED.total_reviews, roadmap_completion_pct = EXCLUDED.roadmap_completion_pct,
        oss_verified = EXCLUDED.oss_verified, achievements = EXCLUDED.achievements,
        consistency_score = EXCLUDED.consistency_score, active_days_30 = EXCLUDED.active_days_30
    `;
  }
  console.log(`Snapshots for ${students.length} students`);

  // Cohort health per tenant.
  const tenants = await sql`SELECT id FROM tenants`;
  for (const t of tenants) {
    const [{ total = 0 } = {}] = await sql`SELECT COUNT(*)::int AS total FROM profiles WHERE tenant_id = ${t.id} AND role = 'student'`;
    if (!total) continue;
    const [{ active7 = 0 } = {}] = await sql`
      SELECT COUNT(DISTINCT a.student_id)::int AS active7 FROM student_daily_activity a
      JOIN profiles p ON p.user_id = a.student_id
      WHERE p.tenant_id = ${t.id} AND a.day >= CURRENT_DATE - 7 AND (a.commits + a.pull_requests + a.reviews) > 0
    `;
    const [avg] = await sql`
      SELECT COALESCE(AVG(consistency_score),0)::numeric AS c, COALESCE(AVG(roadmap_completion_pct),0)::numeric AS r
      FROM student_analytics_snapshots WHERE tenant_id = ${t.id} AND snapshot_date = CURRENT_DATE
    `;
    const domains = await sql`
      SELECT COALESCE(primary_domain,'undecided') AS d, COUNT(*)::int AS n FROM profiles
      WHERE tenant_id = ${t.id} AND role = 'student' GROUP BY d
    `;
    await sql`
      INSERT INTO cohort_metrics (tenant_id, cohort_date, total_students, active_students_7d, avg_consistency, avg_roadmap_pct, domain_distribution)
      VALUES (${t.id}, CURRENT_DATE, ${total}, ${active7}, ${avg?.c || 0}, ${avg?.r || 0}, ${sql.json(Object.fromEntries(domains.map((d) => [d.d, d.n])))})
      ON CONFLICT (tenant_id, cohort_date) DO UPDATE SET
        total_students = EXCLUDED.total_students, active_students_7d = EXCLUDED.active_students_7d,
        avg_consistency = EXCLUDED.avg_consistency, avg_roadmap_pct = EXCLUDED.avg_roadmap_pct,
        domain_distribution = EXCLUDED.domain_distribution
    `;

    // Node funnel for this tenant (progress rows joined to profiles for scope).
    const funnel = await sql`
      SELECT n.id AS node_id,
        COUNT(DISTINCT r.student_id)::int AS started,
        COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.student_id END)::int AS completed
      FROM roadmap_nodes n
      LEFT JOIN student_roadmap_progress r ON r.node_id = n.id
      LEFT JOIN profiles p ON p.user_id = r.student_id AND p.tenant_id = ${t.id}
      WHERE r.student_id IS NULL OR p.user_id IS NOT NULL
      GROUP BY n.id
    `;
    for (const f of funnel) {
      const drop = f.started > 0 ? Math.round(((f.started - f.completed) / f.started) * 1000) / 10 : 0;
      await sql`
        INSERT INTO roadmap_node_analytics (node_id, tenant_id, total_started, total_completed, drop_off_pct, last_updated)
        VALUES (${f.node_id}, ${t.id}, ${f.started}, ${f.completed}, ${drop}, now())
        ON CONFLICT (node_id, tenant_id) DO UPDATE SET
          total_started = EXCLUDED.total_started, total_completed = EXCLUDED.total_completed,
          drop_off_pct = EXCLUDED.drop_off_pct, last_updated = now()
      `;
    }

    // Mentor effectiveness (mentor_sessions.mentor_id stores mentors.user_id).
    const mentors = await sql`
      SELECT m.user_id, COUNT(s.id)::int AS sessions, COUNT(DISTINCT s.student_id)::int AS mentees
      FROM mentors m LEFT JOIN mentor_sessions s ON s.mentor_id = m.user_id
      WHERE m.tenant_id = ${t.id} GROUP BY m.user_id
    `;
    for (const m of mentors) {
      const [o] = await sql`
        SELECT COALESCE(AVG(x.roadmap_completion_pct),0)::numeric AS r FROM (
          SELECT DISTINCT s.student_id FROM mentor_sessions s WHERE s.mentor_id = ${m.user_id}
        ) q LEFT JOIN LATERAL (
          SELECT roadmap_completion_pct FROM student_analytics_snapshots
          WHERE student_id = q.student_id ORDER BY snapshot_date DESC LIMIT 1
        ) x ON true
      `;
      await sql`
        INSERT INTO mentor_effectiveness (mentor_id, tenant_id, mentee_count, session_count, avg_mentee_roadmap_pct, last_updated)
        VALUES (${m.user_id}, ${t.id}, ${m.mentees}, ${m.sessions}, ${o?.r || 0}, now())
        ON CONFLICT (mentor_id, tenant_id) DO UPDATE SET
          mentee_count = EXCLUDED.mentee_count, session_count = EXCLUDED.session_count,
          avg_mentee_roadmap_pct = EXCLUDED.avg_mentee_roadmap_pct, last_updated = now()
      `;
    }
  }
  console.log(`Cohort rollup for ${tenants.length} tenants`);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
