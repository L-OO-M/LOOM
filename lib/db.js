import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as controlSchema from "@/db/control-plane-schema";
import * as tenantSchema from "@/db/tenant-schema";

let client;

function getClient() {
  if (!client) {
    client = postgres(env.DATABASE_URL, { max: 5, idle_timeout: 10 });
  }
  return client;
}

export function getDb() {
  return drizzle(getClient(), { schema: { ...controlSchema, ...tenantSchema } });
}

export function getSql() {
  return getClient();
}

export async function queryTenant(slug) {
  const sql = getSql();
  const [tenant] = await sql`
    SELECT * FROM tenants WHERE slug = ${slug} LIMIT 1
  `;
  if (!tenant) return null;

  const domains = await sql`
    SELECT * FROM tenant_domains WHERE tenant_id = ${tenant.id}
  `;
  const flags = await sql`
    SELECT * FROM feature_flags WHERE tenant_id = ${tenant.id}
  `;

  return {
    ...tenant,
    domains,
    features: Object.fromEntries(flags.map(f => [f.key, f.enabled]))
  };
}

export async function queryStudentProfile(sql, userId) {
  const [profile] = await sql`
    SELECT * FROM profiles WHERE user_id = ${userId} LIMIT 1
  `;
  return profile || null;
}

export async function queryStudentProgress(sql, userId) {
  const done = await sql`
    SELECT COUNT(*)::int AS count FROM student_roadmap_progress
    WHERE student_id = ${userId} AND status = 'completed'
  `;
  const total = await sql`
    SELECT COUNT(*)::int AS count FROM roadmap_nodes
  `;
  return {
    completed: done[0].count,
    total: total[0].count,
    percent: total[0].count > 0 ? Math.round(done[0].count / total[0].count * 100) : 0
  };
}

export async function queryStudentActivity(sql, userId) {
  return await sql`
    SELECT * FROM student_daily_activity
    WHERE student_id = ${userId}
    ORDER BY day DESC
    LIMIT 30
  `;
}

export async function queryResources(sql, domain, level) {
  const conditions = [];
  if (domain) conditions.push(sql`domain = ${domain}`);
  if (level) conditions.push(sql`level = ${level}`);

  return await sql`
    SELECT * FROM resources
    ${conditions.length > 0 ? sql`WHERE ${conditions.join(" AND ")}` : sql``}
    ORDER BY minutes ASC
    LIMIT 10
  `;
}

export async function queryAdminSummary(sql, tenantId) {
  const active = await sql`
    SELECT COUNT(*)::int AS count FROM profiles
  `;
  const roadmapDone = await sql`
    SELECT COUNT(*)::int AS count FROM student_roadmap_progress WHERE status = 'completed'
  `;
  const events = await sql`
    SELECT COUNT(*)::int AS count FROM github_events
    WHERE received_at > NOW() - INTERVAL '1 day'
  `;

  return {
    activeStudents: active[0].count,
    roadmapCompletion: 0,
    githubEventsToday: events[0].count,
    reviewRecommended: 0
  };
}