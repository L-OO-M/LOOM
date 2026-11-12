// Scheduled jobs, in one place for the cron endpoint.
//
// The load/*.js scripts are the operator-facing versions of the same work. This
// module holds the callable forms so a cron request (or a queued rollup event)
// can run them without spawning a second process or opening another pool. Every
// job is written to be safe to run twice: markers, upserts and terminal statuses
// carry the idempotency, not a run ledger.

import { timingSafeEqual } from "node:crypto";
import { MOU_REMINDER_DAYS, TASK_REMINDER_HOURS, mouNotice, taskNotice } from "./deadline-notices";
import { drainOutbox, pruneOutbox } from "./outbox";
import { syncDueConnections } from "./practice-sync";

export const JOB_NAMES = [
  "deadline-reminders",
  "analytics-rollup",
  "federation-rollup",
  "retention-prune",
  "term-expiry",
  "practice-sync",
  "outbox-drain"
];

function secretEquals(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

/**
 * Cron authentication. The secret is read from the environment rather than
 * lib/env so a deployment can enable the scheduler without editing the central
 * env contract. When unset the endpoint is closed (503), never open.
 */
export function authorizeCron(request, expected = process.env.CRON_SECRET) {
  if (!expected) {
    return { ok: false, status: 503, code: "CRON_NOT_CONFIGURED", message: "Scheduler is not configured" };
  }
  const authorization = request?.headers?.get?.("authorization") || "";
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() || "";
  const headerSecret = request?.headers?.get?.("x-cron-secret") || "";
  const provided = bearer || headerSecret;
  if (!provided || !secretEquals(provided, expected)) {
    return { ok: false, status: 401, code: "UNAUTHORIZED", message: "Invalid cron credentials" };
  }
  return { ok: true };
}

async function remindDeadlines(sql, { apply = true } = {}) {
  let mous = 0;
  let tasks = 0;

  const dueMous = await sql`
    SELECT m.id, m.tenant_id, m.title, m.partner_name, m.ends_on, m.owner_id
    FROM mous m
    WHERE m.is_active
      AND m.status = 'active'
      AND m.ends_on IS NOT NULL
      AND m.ends_on <= (CURRENT_DATE + make_interval(days => ${MOU_REMINDER_DAYS}))
      AND m.expiry_notified_at IS NULL
      AND m.owner_id IS NOT NULL
  `;
  for (const mou of dueMous) {
    if (!apply) { mous += 1; continue; }
    const notice = mouNotice(mou);
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        VALUES (${mou.tenant_id}, ${mou.owner_id}, ${notice.type}, ${notice.title}, ${notice.body}, ${notice.link})
      `;
      await tx`UPDATE mous SET expiry_notified_at = NOW() WHERE id = ${mou.id} AND expiry_notified_at IS NULL`;
    });
    mous += 1;
  }

  const dueTasks = await sql`
    SELECT t.id, t.tenant_id, t.title, t.due_at, t.owner_id
    FROM event_ops_tasks t
    WHERE t.is_active
      AND t.status <> 'done'
      AND t.due_at IS NOT NULL
      AND t.due_at <= (NOW() + make_interval(hours => ${TASK_REMINDER_HOURS}))
      AND t.reminded_at IS NULL
      AND t.owner_id IS NOT NULL
  `;
  for (const task of dueTasks) {
    if (!apply) { tasks += 1; continue; }
    const notice = taskNotice(task);
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        VALUES (${task.tenant_id}, ${task.owner_id}, ${notice.type}, ${notice.title}, ${notice.body}, ${notice.link})
      `;
      await tx`UPDATE event_ops_tasks SET reminded_at = NOW() WHERE id = ${task.id} AND reminded_at IS NULL`;
    });
    tasks += 1;
  }

  return { mous, tasks, applied: apply };
}

async function analyticsRollup(sql) {
  const [{ nodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;

  const students = await sql`SELECT user_id, tenant_id, primary_domain FROM profiles WHERE role = 'student'`;
  for (const s of students) {
    const [act] = await sql`
      SELECT COALESCE(SUM(commits),0)::int AS commits, COALESCE(SUM(pull_requests),0)::int AS prs,
             COALESCE(SUM(reviews),0)::int AS reviews,
             COUNT(DISTINCT CASE WHEN (commits + pull_requests + reviews) > 0 THEN day END)::int AS active_days
      FROM student_daily_activity
      WHERE student_id = ${s.user_id} AND tenant_id = ${s.tenant_id} AND day >= CURRENT_DATE - 30
    `;
    const [{ done = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS done FROM student_roadmap_progress
      WHERE student_id = ${s.user_id} AND tenant_id = ${s.tenant_id} AND status = 'completed'
    `;
    const [{ oss = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS oss FROM student_oss_contributions
      WHERE student_id = ${s.user_id} AND tenant_id = ${s.tenant_id} AND status = 'verified'
    `;
    const [{ ach = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS ach FROM student_achievements
      WHERE student_id = ${s.user_id} AND tenant_id = ${s.tenant_id}
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
          WHERE student_id = q.student_id AND tenant_id = ${t.id}
          ORDER BY snapshot_date DESC LIMIT 1
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

  return { students: students.length, tenants: tenants.length };
}

async function federationRollup(sql) {
  const chapters = await sql`SELECT tenant_id, slug FROM chapter_profiles`;
  const perTenant = [];
  for (const c of chapters) {
    const [{ members = 0 } = {}] = await sql`SELECT COUNT(*)::int AS members FROM profiles WHERE tenant_id = ${c.tenant_id}`;
    const [{ oss = 0 } = {}] = await sql`SELECT COUNT(*)::int AS oss FROM student_oss_contributions WHERE tenant_id = ${c.tenant_id} AND status = 'verified'`;
    const [{ projects = 0 } = {}] = await sql`SELECT COUNT(*)::int AS projects FROM projects WHERE tenant_id = ${c.tenant_id}`;
    const [{ contests = 0 } = {}] = await sql`
      SELECT COUNT(DISTINCT contest_id)::int AS contests
      FROM contest_registrations r
      JOIN contests k ON k.id = r.contest_id
      WHERE k.tenant_id = ${c.tenant_id}
        AND r.student_id IN (SELECT user_id FROM profiles WHERE tenant_id = ${c.tenant_id})
    `;
    const stats = { members, oss_merges: oss, projects, contests };
    await sql`UPDATE chapter_profiles SET public_stats = ${sql.json(stats)}, updated_at = now() WHERE tenant_id = ${c.tenant_id}`;
    perTenant.push({ tenant_id: c.tenant_id, slug: c.slug, ...stats });
  }
  perTenant.sort((a, b) => b.members - a.members);
  const [{ students = 0 } = {}] = await sql`SELECT COUNT(*)::int AS students FROM profiles WHERE tenant_id IS NOT NULL`;
  // Federation-wide total by design: count every tenant-owned contribution,
  // never a row that has lost its tenant.
  const [{ ossTotal = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS ossTotal FROM student_oss_contributions
    WHERE tenant_id IS NOT NULL AND status = 'verified'
  `;
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
  return { chapters: chapters.length, students, ossTotal };
}

const RETENTION_PLAN = [
  { table: "github_events", column: "received_at", days: 90, readOnly: false },
  { table: "audit_logs", column: "created_at", days: 730, readOnly: false },
  { table: "notifications", column: "created_at", days: 180, readOnly: true }
];

async function retentionPrune(sql, { days = null } = {}) {
  const results = [];
  for (const item of RETENTION_PLAN) {
    const windowDays = days ?? item.days;
    const exists = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${item.table} AND column_name = ${item.column}
    `;
    if (!exists.length) {
      results.push({ table: item.table, skipped: true });
      continue;
    }
    const cutoff = sql`make_interval(days => ${windowDays})`;
    const where = item.readOnly
      ? sql`SELECT count(*)::int AS n FROM ${sql(item.table)}
           WHERE ${sql(item.column)} < NOW() - ${cutoff} AND read_at IS NOT NULL`
      : sql`SELECT count(*)::int AS n FROM ${sql(item.table)}
           WHERE ${sql(item.column)} < NOW() - ${cutoff}`;
    const [{ n }] = await where;
    if (!n) {
      results.push({ table: item.table, deleted: 0, windowDays });
      continue;
    }
    let deleted;
    if (item.readOnly) {
      deleted = await sql`
        DELETE FROM ${sql(item.table)}
        WHERE ${sql(item.column)} < NOW() - ${cutoff} AND read_at IS NOT NULL
        RETURNING id`;
    } else {
      deleted = await sql`
        DELETE FROM ${sql(item.table)}
        WHERE ${sql(item.column)} < NOW() - ${cutoff}
        RETURNING id`;
    }
    results.push({ table: item.table, deleted: deleted.length, windowDays });
  }

  // Outbox has two windows (done 7d, dead 30d), which the single-window plan
  // above cannot express, so it prunes itself. Dead rows outlive successes
  // because they are the evidence for a side effect that never landed.
  results.push({ table: "outbox", ...(await pruneOutbox(sql)) });
  return { results };
}

async function termExpiry(sql) {
  const rows = await sql`
    SELECT t.id, t.tenant_id, t.user_id, t.role, t.vertical, t.department_id,
           t.starts_on, t.ends_on, p.name, d.name AS department_name
    FROM leadership_terms t
    JOIN profiles p ON p.user_id = t.user_id
    LEFT JOIN departments d ON d.id = t.department_id
    WHERE t.status = 'active'
      AND t.ends_on IS NOT NULL
      AND t.ends_on < CURRENT_DATE
    ORDER BY t.ends_on ASC
  `;

  for (const t of rows) {
    const label = t.role === "dept_lead"
      ? `Head / Co-Head - ${t.department_name || "department"}`
      : t.role === "vertical_lead"
        ? `Vertical Lead - ${t.vertical || "vertical"}`
        : t.role === "admin"
          ? "Super Admin"
          : "Core Member";

    await sql.begin(async (tx) => {
      const [expired] = await tx`
        UPDATE leadership_terms SET status = 'expired', notified_at = NOW()
        WHERE id = ${t.id} AND status = 'active'
        RETURNING id
      `;
      if (!expired) return;

      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        VALUES (
          ${t.tenant_id}, ${t.user_id}, 'term_expired',
          ${`Your ${label} term has ended`},
          ${"Your leadership term ended on " + t.ends_on + ". You keep your history; reappointment or extension is required before you can act in that role again."},
          '/student/settings'
        )
      `;

      await tx`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        SELECT ${t.tenant_id}, p.user_id, 'term_expired',
               ${`Term ended: ${t.name || t.user_id} - ${label}`},
               ${"Reappoint, extend, or complete the handover. Authority in the old term is already suspended."},
               '/admin/handover'
        FROM profiles p
        WHERE p.role = 'admin' AND p.tenant_id = ${t.tenant_id}::uuid AND p.user_id <> ${t.user_id}
      `;

      const title = `Reappoint or hand over: ${label}`;
      const [existing] = await tx`
        SELECT id FROM handover_checklists
        WHERE title = ${title} AND tenant_id = ${t.tenant_id}::uuid
        LIMIT 1
      `;
      if (!existing) {
        await tx`
          INSERT INTO handover_checklists (tenant_id, title, category, detail, owner_id)
          VALUES (
            ${t.tenant_id}, ${title}, 'leadership',
            ${`Term ended ${t.ends_on}. Holder: ${t.name || t.user_id}. Reappoint or transfer ownership.`},
            ${t.user_id}
          )
        `;
      }

      await tx`
        INSERT INTO audit_logs (actor_id, tenant_id, action, resource, resource_id, after, metadata)
        VALUES (
          ${t.user_id}, ${t.tenant_id}, 'term_expired', 'leadership_terms', ${t.id},
          ${tx.json({ role: t.role, ends_on: t.ends_on })},
          ${tx.json({ tenant_id: t.tenant_id })}
        )
      `;
    });
  }

  return { expired: rows.length };
}

export const JOBS = Object.freeze({
  "deadline-reminders": remindDeadlines,
  "analytics-rollup": analyticsRollup,
  "federation-rollup": federationRollup,
  "retention-prune": retentionPrune,
  "term-expiry": termExpiry,
  "practice-sync": (sql, options = {}) => syncDueConnections(sql, options),
  // Drains the durable outbox (migration 066). Named last so the other jobs run
  // first: a run that fails midway still delivers what it queued.
  "outbox-drain": (sql, options = {}) => drainOutbox(sql, options)
});

export async function runJob(sql, job, options = {}) {
  const handler = JOBS[job];
  if (!handler) {
    return { error: "UNKNOWN_JOB", message: `Unknown job: ${job}` };
  }
  const result = await handler(sql, options);
  return { job, ...result };
}
