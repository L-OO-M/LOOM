// Turn the evidence-based board on for one chapter, and materialise the scores.
//
// Two separate things have to be true before the leaderboard shows a number:
//   1. feature_flags.ranking_verified = true for the tenant (the UI reads it)
//   2. ranking_scores has rows (lib/standings.js reads the materialised score)
//
// Flipping only the flag shows an honest but empty board; flipping only the
// scores leaves the UI on the legacy path. This script does both, in that
// order, and is safe to re-run (upsert + a derived recompute).
//
// Usage:
//   node load/enable-verified-ranking.js                  # dry run, shows the plan
//   node load/enable-verified-ranking.js --apply          # enable + recompute
//   node load/enable-verified-ranking.js --tenant msit    # pick a chapter slug
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const apply = process.argv.includes("--apply");
const tenantArgIndex = process.argv.indexOf("--tenant");
const tenantSlug = tenantArgIndex > -1 ? process.argv[tenantArgIndex + 1] : "demo-college";
const sql = postgres(databaseUrl(), { max: 1 });

try {
  const [tenant] = await sql`
    SELECT id, name, slug FROM tenants WHERE slug = ${tenantSlug} LIMIT 1
  `;
  if (!tenant) {
    console.error(`No tenant with slug "${tenantSlug}". Nothing changed.`);
    process.exitCode = 1;
  } else {
    const [flag] = await sql`
      SELECT enabled, updated_at FROM feature_flags
      WHERE tenant_id = ${tenant.id}::uuid AND key = 'ranking_verified' LIMIT 1
    `;
    const [evidence] = await sql`
      SELECT COUNT(*)::int AS verified_rows,
             COUNT(DISTINCT user_id)::int AS students
      FROM ranking_events
      WHERE tenant_id = ${tenant.id}::uuid AND verified_by IS NOT NULL
    `;
    const [scores] = await sql`
      SELECT COUNT(*)::int AS rows FROM ranking_scores
      WHERE tenant_id = ${tenant.id}::uuid
    `;

    console.log(`TENANT        ${tenant.name} (${tenant.slug}) ${tenant.id}`);
    console.log(`FLAG          ${flag ? (flag.enabled ? "on" : "off") : "missing"}${flag?.updated_at ? ` (since ${String(flag.updated_at).slice(0, 10)})` : ""}`);
    console.log(`EVIDENCE      ${evidence.verified_rows} verified event(s) across ${evidence.students} student(s)`);
    console.log(`SCORES        ${scores.rows} materialised row(s)`);
    console.log(`ACTION        ${apply ? "enable + recompute" : "dry run -- pass --apply to write"}`);

    if (apply) {
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO feature_flags (tenant_id, key, enabled)
          VALUES (${tenant.id}::uuid, 'ranking_verified', true)
          ON CONFLICT (tenant_id, key) DO UPDATE SET enabled = true
        `;
        const [result] = await tx`
          SELECT public.recompute_ranking_scores(${tenant.id}::uuid) AS rows
        `;
        await tx`
          INSERT INTO audit_logs (actor_id, action, resource, resource_id, after, metadata)
          VALUES (
            'system', 'ranking_enabled', 'feature_flags', 'ranking_verified',
            ${tx.json({ enabled: true })},
            ${tx.json({ tenant_id: tenant.id, recomputed: Number(result?.rows ?? 0) })}
          )
        `;
        console.log(`\nRecomputed ${Number(result?.rows ?? 0)} score row(s).`);
      });

      const top = await sql`
        SELECT p.name, rs.score, rs.tier
        FROM ranking_scores rs
        JOIN profiles p ON p.user_id = rs.user_id
        WHERE rs.tenant_id = ${tenant.id}::uuid
        ORDER BY rs.score DESC, p.name ASC
        LIMIT 5
      `;
      if (top.length === 0) {
        console.log("Board is live but empty: no verified evidence yet. That is honest, not broken.");
      } else {
        console.log("Top of the board:");
        for (const row of top) console.log(`  ${String(row.score).padStart(4)}  ${row.name} (${row.tier})`);
      }
    }
  }
} finally {
  await sql.end();
}
