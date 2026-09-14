// Dev-only dummy seed. REFUSES to run in production.
// Usage: node load/seed-dev.js
// Idempotent: fixed seed-* ids + ON CONFLICT, safe to re-run.
// Requires: base seeds (tenants demo-college, roadmap nodes, resources) already applied.
const fs = require("fs");
const path = require("path");

function loadEnvLocal() {
  try {
    const envPath = path.join(__dirname, "..", ".env.local");
    const raw = fs.readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch { /* ignore */ }
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
    console.error("seed-dev refuses to run in production.");
    process.exit(1);
  }
  loadEnvLocal();
  const { default: postgres } = await import("postgres");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked env + .env.local).");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    const [tenant] = await sql`SELECT id FROM tenants WHERE slug = 'demo-college' LIMIT 1`;
    if (!tenant) {
      console.error("demo-college tenant missing. Run node load/seed-control-plane.js first.");
      process.exit(1);
    }
    const tid = tenant.id;

    // Re-run safe: clear prior seed-linked rows first (seed-* only, never real users)
    await sql.unsafe("DELETE FROM public.contest_submissions WHERE student_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.contest_registrations WHERE student_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.notifications WHERE user_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.projects WHERE owner_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.github_events WHERE idempotency_key LIKE 'seed-%'");
    await sql.unsafe("DELETE FROM public.mentor_sessions WHERE student_id LIKE 'seed-user-%' OR mentor_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.student_roadmap_progress WHERE student_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.student_daily_activity WHERE student_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.repositories WHERE id LIKE 'seed-repo-%'");
    await sql.unsafe("DELETE FROM public.github_connections WHERE user_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.contests WHERE title LIKE 'Seed%'");
    await sql.unsafe("DELETE FROM public.mentors WHERE user_id LIKE 'seed-user-%'");
    await sql.unsafe("DELETE FROM public.audit_logs WHERE actor_id = 'seed'");
    console.log("cleared prior seed rows");

    // --- dummy students (fake auth ids; real users replace them) ---
    const students = [
      ["seed-user-aarav", "Aarav Sharma", "web", "aarav-dev", 3],
      ["seed-user-priya", "Priya Nair", "backend", "priya-codes", 2],
      ["seed-user-rahul", "Rahul Verma", "web", "rahulv", 2],
      ["seed-user-sneha", "Sneha Iyer", "devops", null, 3],
      ["seed-user-kabir", "Kabir Singh", "backend", "kabirbuilds", 1]
    ];
    for (const [uid, name, domain, gh, year] of students) {
      await sql`
        INSERT INTO profiles (user_id, name, role, tenant_id, primary_domain, year, github_username, onboarding_completed)
        VALUES (${uid}, ${name}, 'student', ${tid}, ${domain}, ${year}, ${gh}, true)
        ON CONFLICT (user_id) DO UPDATE SET name = EXCLUDED.name, tenant_id = EXCLUDED.tenant_id,
          primary_domain = EXCLUDED.primary_domain, github_username = EXCLUDED.github_username,
          onboarding_completed = true
      `;
    }
    // dummy mentor (promote one seed student)
    await sql`
      INSERT INTO mentors (user_id, tenant_id, expertise, bio, available)
      VALUES ('seed-user-sneha', ${tid}, 'React, Node.js, CI/CD', 'Seed mentor. Final-year student who ships.', true)
      ON CONFLICT (user_id) DO UPDATE SET expertise = EXCLUDED.expertise, bio = EXCLUDED.bio, available = true
    `;
    await sql`UPDATE profiles SET role = 'core' WHERE user_id = 'seed-user-sneha' AND role = 'student'`;
    console.log("seeded 5 students + 1 mentor");

    // --- roadmap progress (staggered so leaderboard has shape) ---
    const nodeRows = await sql`SELECT id FROM roadmap_nodes ORDER BY sort_order ASC`;
    const completions = { "seed-user-aarav": 5, "seed-user-priya": 3, "seed-user-rahul": 4, "seed-user-kabir": 1 };
    for (const [uid, n] of Object.entries(completions)) {
      for (const node of nodeRows.slice(0, n)) {
        await sql`
          INSERT INTO student_roadmap_progress (student_id, node_id, status, completed_at)
          VALUES (${uid}, ${node.id}, 'completed', NOW() - (INTERVAL '1 day' * ${nodeRows.indexOf(node)}))
          ON CONFLICT (student_id, node_id) DO UPDATE SET status = 'completed'
        `;
      }
    }
    console.log("seeded roadmap progress");

    // --- github activity: 14 days trailing for 3 students ---
    for (const [uid, base] of [["seed-user-aarav", 4], ["seed-user-rahul", 3], ["seed-user-priya", 2]]) {
      for (let d = 0; d < 14; d++) {
        const commits = Math.max(0, base - (d % 4));
        const prs = d % 5 === 0 ? 1 : 0;
        await sql`
          INSERT INTO student_daily_activity (student_id, day, commits, pull_requests, reviews)
          VALUES (${uid}, (CURRENT_DATE - ${d}::int), ${commits}, ${prs}, ${d % 7 === 0 ? 2 : 0})
          ON CONFLICT (student_id, day) DO UPDATE SET commits = EXCLUDED.commits,
            pull_requests = EXCLUDED.pull_requests, reviews = EXCLUDED.reviews
        `;
      }
      await sql`
        INSERT INTO github_events (idempotency_key, event_name, delivery_id, actor_login, payload)
        VALUES (${"seed-push-" + uid}, 'push', ${"seed-delivery-" + uid}, ${uid}, ${sql.json({ commits: base, seed: true })})
        ON CONFLICT (idempotency_key) DO NOTHING
      `;
      await sql`
        INSERT INTO repositories (id, owner, name, full_name, student_id)
        VALUES (${"seed-repo-" + uid}, ${uid}, 'loom-project', ${uid + "/loom-project"}, ${uid})
        ON CONFLICT (id) DO NOTHING
      `;
      await sql`
        INSERT INTO github_connections (user_id, github_username)
        VALUES (${uid}, ${uid.replace("seed-user-", "") + "-dev"})
        ON CONFLICT (user_id) DO NOTHING
      `;
    }
    console.log("seeded github activity");

    // --- projects ---
    const projects = [
      ["Aarav Sharma", "seed-user-aarav", "Campus dashboard", "React dashboard for attendance tracking.", "node_react", "https://github.com/aarav-dev/loom-project"],
      ["Priya Nair", "seed-user-priya", "API starter", "Express + Drizzle starter with Zod validation.", "node_node", null],
      ["Rahul Verma", "seed-user-rahul", "CSS art gallery", "Pure-CSS illustrations and layouts.", "node_html_css", null]
    ];
    for (const [, owner, title, desc, nodeId, repo] of projects) {
      const [node] = await sql`SELECT id FROM roadmap_nodes WHERE id = ${nodeId} LIMIT 1`;
      await sql`
        INSERT INTO projects (tenant_id, owner_id, title, description, roadmap_node_id, status, repo_url)
        VALUES (${tid}, ${owner}, ${title}, ${desc}, ${node ? node.id : null}, 'active', ${repo})
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("seeded projects");

    // --- contests (published + draft) + registrations + submission ---
    const [c1] = await sql`
      INSERT INTO contests (tenant_id, title, description, status, starts_at, ends_at)
      VALUES (${tid}, 'Seed Sprint #1', 'Build a dashboard in 48 hours.', 'published', NOW() - INTERVAL '1 day', NOW() + INTERVAL '2 days')
      RETURNING id
    `.catch(async () => {
      const [ex] = await sql`SELECT id FROM contests WHERE tenant_id = ${tid} AND title = 'Seed Sprint #1' LIMIT 1`;
      return [ex];
    });
    await sql`
      INSERT INTO contests (tenant_id, title, description, status)
      VALUES (${tid}, 'Seed Draft Cup', 'Draft contest for admins to publish.', 'draft')
      ON CONFLICT DO NOTHING
    `;
    if (c1) {
      for (const uid of ["seed-user-aarav", "seed-user-priya", "seed-user-rahul"]) {
        await sql`
          INSERT INTO contest_registrations (contest_id, student_id, status)
          VALUES (${c1.id}, ${uid}, 'registered')
          ON CONFLICT (contest_id, student_id) DO NOTHING
        `;
      }
      await sql`
        INSERT INTO contest_submissions (contest_id, student_id, url, note)
        VALUES (${c1.id}, 'seed-user-aarav', 'https://github.com/aarav-dev/loom-project', 'Seed submission.')
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("seeded contests");

    // --- mentorship sessions ---
    await sql`
      INSERT INTO mentor_sessions (mentor_id, student_id, status, scheduled_at)
      VALUES ('seed-user-sneha', 'seed-user-kabir', 'requested', NOW() + INTERVAL '2 days')
      ON CONFLICT DO NOTHING
    `;
    console.log("seeded mentorship");

    // --- notifications for seed users ---
    for (const uid of ["seed-user-aarav", "seed-user-kabir"]) {
      await sql`
        INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
        VALUES (${tid}, ${uid}, 'roadmap', 'Keep your streak going', 'Seed notification. Complete your next roadmap node today.', '/student/roadmap')
        ON CONFLICT DO NOTHING
      `;
    }
    console.log("seeded notifications");

    // --- audit sample ---
    await sql`
      INSERT INTO audit_logs (actor_id, action, resource, resource_id, after, metadata)
      VALUES ('seed', 'seeded_dev_data', 'college', ${tid}, ${sql.json({ by: "load/seed-dev.js" })}, ${sql.json({ tenant_id: tid })})
      ON CONFLICT DO NOTHING
    `;
    console.log("done. Dummy data prefixed seed-* (except generated uuid rows linked to seed users).");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
