// Seeds the society's departments for every tenant (idempotent).
// Usage: node load/seed-departments.js
// Slugs match the skill-domain taxonomy so roadmaps/resources/OSS catalogs
// line up with org units. Non-technical departments ship active too: the public
// directory (/domains, the homepage grid) and the admin list both filter on
// is_active, so shipping them inactive hid publicity/design/sponsorship from the
// website entirely. An admin can still archive any department by hand.
//
// Technical departments (6): align with PRIMARY_DOMAINS in lib/domains.js
// Non-technical departments (7): functional units for society operations
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";

const DATABASE_URL = databaseUrl();

const DEPARTMENTS = [
  // Technical vertical (6) — maps 1:1 with PRIMARY_DOMAINS
  { name: "AI / ML", slug: "ai_ml", vertical: "technical", description: "Machine learning fundamentals, paper reading, dataset contests, applied projects." },
  { name: "Web Development", slug: "web", vertical: "technical", description: "Modern web fundamentals, frameworks, Git workflow, deployment — including this very site." },
  { name: "Cybersecurity", slug: "cybersecurity", vertical: "technical", description: "Ethical hacking within legal boundaries, CTFs, cryptography, secure coding." },
  { name: "DSA & Problem Solving", slug: "dsa", vertical: "technical", description: "Weekly problem-solving, contests, interview prep, mock assessments." },
  { name: "Blockchain", slug: "blockchain", vertical: "technical", description: "Distributed ledgers, smart contracts, and Web3 mini-projects." },
  { name: "Embedded & Hardware", slug: "embedded", vertical: "technical", description: "Microcontrollers, Arduino, Raspberry Pi, sensors and firmware — build things you can hold." },

  // Non-technical vertical (7) — functional departments
  { name: "Design", slug: "design", vertical: "non_technical", description: "Visual identity, posters, banners, merch, slide systems, media assets, brand templates." },
  { name: "Documentation", slug: "documentation", vertical: "non_technical", description: "Event records, reports, minutes, budgets, post-event analysis, official documentation templates." },
  { name: "SMM & Content Creation", slug: "smm_content", vertical: "non_technical", description: "Social media content calendars, video editing, photography, reels, content archives, publishing workflows." },
  { name: "Publicity", slug: "publicity", vertical: "non_technical", description: "Promotional campaigns, event awareness, campus presence, campaign effectiveness tracking, distribution coordination." },
  { name: "Sponsorship", slug: "sponsorship", vertical: "non_technical", description: "Sponsor pipeline, outreach, proposals, commitments, deliverables, sponsorship agreements." },
  { name: "Management", slug: "management", vertical: "non_technical", description: "Event execution, logistics, task assignment, interdepartmental coordination, schedules, event-day operations." },
  { name: "Public Relations", slug: "public_relations", vertical: "non_technical", description: "External institutional contacts, outreach records, collaborations, partnerships, external communication follow-ups." }
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