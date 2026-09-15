// Seeds curated OSS projects + demo chapter profile.
// Enriches each repo with LIVE GitHub API data (stars, language, open
// good-first-issues) so nothing is invented; falls back to static values offline.
// Usage: node load/seed-community.js  (needs DATABASE_URL in env or .env.local)
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();

const sql = postgres(DATABASE_URL, { max: 1 });

// Only repos whose existence is certain (long-lived, high-profile).
const CURATED = [
  { owner: "firstcontributions", repo: "first-contributions", difficulty: "beginner", domain: "web" },
  { owner: "freecodecamp", repo: "freecodecamp", difficulty: "beginner", domain: "web" },
  { owner: "facebook", repo: "react", difficulty: "intermediate", domain: "web" },
  { owner: "microsoft", repo: "vscode", difficulty: "intermediate", domain: "web" },
  { owner: "vercel", repo: "next.js", difficulty: "intermediate", domain: "web" },
  { owner: "tensorflow", repo: "tensorflow", difficulty: "advanced", domain: "ai_ml" }
];

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "loom-seed" }
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json();
}

try {
  for (const c of CURATED) {
    const url = `https://github.com/${c.owner}/${c.repo}`;
    let description = "";
    let language = null;
    let stars = 0;
    let goodFirst = 0;
    try {
      const [repo, search] = await Promise.all([
        gh(`/repos/${c.owner}/${c.repo}`),
        gh(`/search/issues?q=repo:${c.owner}/${c.repo}+label:"good+first+issue"+state:open&per_page=1`)
      ]);
      description = (repo.description || "").slice(0, 500);
      language = repo.language || null;
      stars = repo.stargazers_count || 0;
      goodFirst = Math.min(search.total_count || 0, 1000);
      console.log(`live ${c.owner}/${c.repo}: ★${stars} lang=${language} gfi=${goodFirst}`);
    } catch (e) {
      console.log(`offline fallback for ${c.owner}/${c.repo} (${e.message})`);
    }
    await sql`
      INSERT INTO open_source_projects
        (tenant_id, github_repo_url, owner, repo_name, description, difficulty, primary_domain, language, stars, good_first_issues, is_curated)
      VALUES (NULL, ${url}, ${c.owner}, ${c.repo}, ${description}, ${c.difficulty}, ${c.domain}, ${language}, ${stars}, ${goodFirst}, true)
      ON CONFLICT (github_repo_url) DO UPDATE SET
        description = EXCLUDED.description,
        language = EXCLUDED.language,
        stars = EXCLUDED.stars,
        good_first_issues = EXCLUDED.good_first_issues,
        difficulty = EXCLUDED.difficulty,
        primary_domain = EXCLUDED.primary_domain,
        is_curated = true
    `;
  }
  console.log(`Seeded ${CURATED.length} curated OSS projects`);

  // Public chapter profile for the demo tenant (slug must match tenants.slug).
  const [tenant] = await sql`SELECT id, slug, name FROM tenants WHERE slug = 'demo-college' LIMIT 1`;
  if (tenant) {
    const [{ count: members }] = await sql`SELECT COUNT(*)::int AS count FROM profiles WHERE tenant_id = ${tenant.id}`;
    const [{ count: oss }] = await sql`SELECT COUNT(*)::int AS count FROM student_oss_contributions WHERE tenant_id = ${tenant.id}`;
    await sql`
      INSERT INTO chapter_profiles (tenant_id, slug, public_name, mission, public_stats, is_featured, is_public)
      VALUES (
        ${tenant.id}, 'demo-college', ${tenant.name || "Demo College Chapter"},
        'Learn, build, and ship open source — together.',
        ${sql.json({ members, oss_contributions: oss })},
        true, true
      )
      ON CONFLICT (tenant_id) DO UPDATE SET
        public_stats = EXCLUDED.public_stats,
        is_featured = true,
        is_public = true,
        updated_at = now()
    `;
    console.log(`Seeded chapter profile for demo-college (${members} members, ${oss} OSS contributions)`);
  } else {
    console.log("demo-college tenant not found; skipped chapter profile");
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
