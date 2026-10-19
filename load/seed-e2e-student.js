// Provision a dedicated, login-able LOCAL student for the authenticated
// end-to-end audit (e2e/student-audit.spec.js) and give it enough real rows
// that every data-bearing student surface renders populated, not empty.
//
// WHY THIS EXISTS
// e2e/login.spec.js and every authenticated spec skip themselves unless
// E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD are set, so the whole student area had
// no runtime coverage. This script creates that account and its data so the
// audit can log in and click through for real.
//
// Usage:
//   1. add to .env.local (never committed):
//        E2E_LOGIN_EMAIL=e2e.student@example.com
//        E2E_LOGIN_PASSWORD=<a throwaway dev password>
//   2. node load/seed-e2e-student.js
//   3. npx playwright test e2e/student-audit.spec.js
//
// Dev-only and idempotent: refuses to run in production, creates the auth user
// once, and every data row is guarded by an existence check. Secrets come from
// env / .env.local only.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DOMAIN = process.env.E2E_STUDENT_DOMAIN || "ai_ml";
const NAME = process.env.E2E_STUDENT_NAME || "E2E Student";
const USERNAME = "e2e-student";
const ROLL = "E2E-0001";
const BRANCH = "CSE";

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

async function ensureAuthUser(supabase, email, password) {
  const meta = { name: NAME, roll_number: ROLL, branch: BRANCH, year: 3, domains: [DOMAIN] };

  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta
  });
  if (!created.error) {
    console.log(`auth user: created ${email} (${created.data.user.id})`);
    return created.data.user.id;
  }

  if (!/already|registered|exists/i.test(created.error.message)) {
    throw new Error(`createUser failed: ${created.error.message}`);
  }

  // Already there — find it and (re)set the password + metadata so the local
  // creds in .env.local always match, even after a rotation.
  const list = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (list.error) throw new Error(`listUsers failed: ${list.error.message}`);
  const found = list.data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`user ${email} reported as existing but not found`);

  const updated = await supabase.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
    user_metadata: meta
  });
  if (updated.error) throw new Error(`updateUserById failed: ${updated.error.message}`);
  console.log(`auth user: reused ${email} (${found.id})`);
  return found.id;
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    fail("seed-e2e-student refuses to run in production.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.E2E_LOGIN_EMAIL;
  const password = process.env.E2E_LOGIN_PASSWORD;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  if (!email || !password) {
    fail("E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD not set. Add them to .env.local, then re-run.");
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const userId = await ensureAuthUser(supabase, email, password);

  const sql = postgres(databaseUrl(), { max: 1, prepare: false });
  try {
    const [tenant] = await sql`SELECT id, slug FROM tenants WHERE slug = ${process.env.DEV_TENANT_SLUG || "demo-college"} LIMIT 1`;
    if (!tenant) fail("demo-college tenant missing — run node load/seed-control-plane.js first.");
    const tid = tenant.id;

    // --- profile (the row every student page resolves on) -------------------
    await sql`
      INSERT INTO profiles (user_id, name, role, primary_domain, tenant_id, roll_number, branch, year, onboarding_completed)
      VALUES (${userId}, ${NAME}, 'student', ${DOMAIN}, ${tid}, ${ROLL}, ${BRANCH}, 3, true)
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name, role = 'student', primary_domain = EXCLUDED.primary_domain,
        tenant_id = EXCLUDED.tenant_id, roll_number = EXCLUDED.roll_number,
        branch = EXCLUDED.branch, year = EXCLUDED.year, onboarding_completed = true`;
    console.log(`profiles: ${DOMAIN} / onboarding complete`);

    // --- public social card (profile, discover, follow) ----------------------
    await sql`
      INSERT INTO user_profiles (user_id, tenant_id, username, bio, location, primary_domain, is_public, social_links)
      VALUES (${userId}, ${tid}, ${USERNAME}, 'End-to-end audit account. Safe to delete.', 'Delhi, India', ${DOMAIN}, true, '{}'::jsonb)
      ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username, is_public = true`;
    console.log(`user_profiles: @${USERNAME}`);

    // --- department membership ----------------------------------------------
    const [dept] = await sql`SELECT id FROM departments WHERE tenant_id = ${tid} AND slug = ${DOMAIN} LIMIT 1`;
    if (dept) {
      await sql`INSERT INTO department_memberships (user_id, department_id, level)
                VALUES (${userId}, ${dept.id}, 'general')
                ON CONFLICT (user_id, department_id) DO NOTHING`;
      console.log(`department_memberships: ${DOMAIN}`);
    } else {
      console.warn(`department ${DOMAIN} not found — skipped membership`);
    }

    // --- one completed roadmap node (roadmap progress + dashboard) ----------
    const [node] = await sql`SELECT id, title FROM roadmap_nodes WHERE domain = ${DOMAIN} ORDER BY sort_order LIMIT 1`;
    if (node) {
      const [done] = await sql`SELECT id FROM student_roadmap_progress WHERE student_id = ${userId} AND node_id = ${node.id} LIMIT 1`;
      if (!done) {
        await sql`INSERT INTO student_roadmap_progress (student_id, node_id, status, tenant_id, evidence_state, completed_at)
                  VALUES (${userId}, ${node.id}, 'completed', ${tid}, 'verified', NOW())`;
      }
      console.log(`roadmap: completed "${node.title}"`);
    }

    // --- one project (projects list + detail) -------------------------------
    const repoFull = "e2e-student/loom-audit-fixture";
    const [proj] = await sql`SELECT id FROM projects WHERE owner_id = ${userId} AND title = 'E2E fixture project' LIMIT 1`;
    if (!proj) {
      await sql`INSERT INTO projects (tenant_id, owner_id, title, description, status, repo_url, repo_full_name, tags, evidence_state)
                VALUES (${tid}, ${userId}, 'E2E fixture project', 'Fixture row for the student audit.', 'active',
                        ${"https://github.com/" + repoFull}, ${repoFull}, ${["e2e", DOMAIN]}, 'provisional')`;
    }
    console.log("projects: fixture row");

    // --- one contribution ---------------------------------------------------
    const [contrib] = await sql`SELECT id FROM member_contributions WHERE student_id = ${userId} AND title = 'E2E fixture contribution' LIMIT 1`;
    if (!contrib) {
      await sql`INSERT INTO member_contributions (student_id, tenant_id, department_id, kind, title, description, logged_by)
                VALUES (${userId}, ${tid}, ${dept?.id ?? null}, 'project', 'E2E fixture contribution', 'Fixture.', ${userId})`;
    }
    console.log("member_contributions: fixture row");

    // --- one unread notification --------------------------------------------
    const [note] = await sql`SELECT id FROM notifications WHERE user_id = ${userId} AND title = 'Welcome to LOOM (e2e)' LIMIT 1`;
    if (!note) {
      await sql`INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
                VALUES (${tid}, ${userId}, 'system', 'Welcome to LOOM (e2e)', 'This is an audit fixture notification.', '/student')`;
    }
    console.log("notifications: fixture row (unread)");

    // --- one certificate (public /student/certificates/[code] + verify) ------
    const code = "E2E-STUDENT-CERT";
    const [cert] = await sql`SELECT id FROM certificates WHERE student_id = ${userId} AND verification_code = ${code} LIMIT 1`;
    if (!cert) {
      await sql`INSERT INTO certificates (student_id, tenant_id, title, verification_code)
                VALUES (${userId}, ${tid}, 'E2E Audit Certificate', ${code})`;
    }
    console.log(`certificates: ${code}`);

    // --- one achievement (credentials page + share link) --------------------
    const [ach] = await sql`SELECT id FROM student_achievements WHERE student_id = ${userId} AND source_type = 'manual' LIMIT 1`;
    if (!ach) {
      await sql`INSERT INTO student_achievements (student_id, tenant_id, source_type, level, earned_at)
                VALUES (${userId}, ${tid}, 'manual', 'gold', NOW())`;
    }
    console.log("student_achievements: fixture row");

    console.log("\nDone. Login with E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD from .env.local.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
