// Seeds the society's departments for every tenant (idempotent).
// Usage: node load/seed-departments.js
// Slugs match the skill-domain taxonomy so roadmaps/resources/OSS catalogs
// line up with org units. Non-technical departments ship inactive — a Super
// Admin activates them when the chapter staffs those verticals.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();

const DEPARTMENTS = [
  { name: "AI / ML", slug: "ai_ml", vertical: "technical", description: "Machine learning fundamentals, paper reading, dataset contests, applied projects." },
  { name: "Web Development", slug: "web", vertical: "technical", description: "Modern web fundamentals, frameworks, Git workflow, deployment — including this very site." },
  { name: "Cybersecurity", slug: "cybersecurity", vertical: "technical", description: "Ethical hacking within legal boundaries, CTFs, cryptography, secure coding." },
  { name: "DSA & Problem Solving", slug: "dsa", vertical: "technical", description: "Weekly problem-solving, contests, interview prep, mock assessments." },
  { name: "Blockchain", slug: "blockchain", vertical: "technical", description: "Distributed ledgers, smart contracts, and Web3 mini-projects." },
  { name: "PR & Outreach", slug: "pr_outreach", vertical: "non_technical", description: "Socials, campus presence, event promotions, external communications.", active: false },
  { name: "Design", slug: "design", vertical: "non_technical", description: "Visual identity, posters, merch, slide systems, media assets.", active: false },
  { name: "Sponsorship & EVM", slug: "sponsorship_evm", vertical: "non_technical", description: "Sponsor pipeline, budget coordination, event logistics and venue management.", active: false }
];

const sql = postgres(DATABASE_URL, { max: 1 });

try {
  const tenants = await sql`SELECT id, slug FROM tenants`;
  if (!tenants.length) {
    console.error("No tenants found. Run seed-control-plane first.");
    process.exit(1);
  }
  let count = 0;
  for (const t of tenants) {
    for (const d of DEPARTMENTS) {
      await sql`
        INSERT INTO departments (tenant_id, name, slug, vertical, description, is_active)
        VALUES (${t.id}, ${d.name}, ${d.slug}, ${d.vertical}, ${d.description}, ${d.active !== false})
        ON CONFLICT (tenant_id, slug) DO UPDATE SET
          name = EXCLUDED.name, vertical = EXCLUDED.vertical, description = EXCLUDED.description
      `;
      count++;
    }
  }
  console.log(`Seeded ${count} department rows across ${tenants.length} tenant(s)`);
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
