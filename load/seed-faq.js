// Seeds the public FAQ for every tenant (idempotent).
// Usage: node load/seed-faq.js
// (tenant_id, slug) is the upsert key (migration 018) — re-running only
// refreshes copy, never duplicates. Only honest, process-level answers:
// no invented people, dates, or statistics.
import postgres from "postgres";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres.gbkpocjtcnozihvacmtg:LOOMLOBBY1234@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres";

const FAQS = [
  {
    slug: "membership-process",
    question: "How do I join L.O.O.M.?",
    answer:
      "Create an account on the register page and pick the departments that interest you. Joining as a General Member is instant and approval-free — you can start on a learning roadmap the same day. Core membership, which comes with ownership of real work, is granted later by department leads based on sustained contribution.",
    sort_order: 1
  },
  {
    slug: "eligibility",
    question: "Who can join? Do I need prior experience?",
    answer:
      "Any enrolled student of a member college can join, regardless of branch or year. No prior technical experience is required — participation and onboarding are strictly beginner-friendly, and the foundation roadmaps assume you are starting from zero.",
    sort_order: 2
  },
  {
    slug: "domains",
    question: "Which domains can I learn?",
    answer:
      "Active learning tracks cover AI/ML, Web Development, Cybersecurity, DSA & Problem Solving, and Blockchain. Each domain has a structured roadmap, curated resources, workshops, projects, and mentors. Non-technical departments (PR & Outreach, Design, Sponsorship) open as the chapter staffs those verticals.",
    sort_order: 3
  },
  {
    slug: "mentorship",
    question: "How does mentorship work?",
    answer:
      "You learn with seniors through roadmap guidance, workshops, and project teams — not one-off advice. The generational cycle is the point: the ultimate goal of a member is to become a mentor for the next intake, so the culture outlives its founders.",
    sort_order: 4
  },
  {
    slug: "beginner-friendly",
    question: "I am an absolute beginner. Where do I start?",
    answer:
      "Start with a foundation roadmap node in one domain — HTML/CSS or JavaScript if you are unsure — and finish one small thing per week. Join that department's workshops, ask questions in the community, and claim your first project task. Consistency matters far more than starting level.",
    sort_order: 5
  }
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
    for (const f of FAQS) {
      await sql`
        INSERT INTO faqs (tenant_id, slug, question, answer, sort_order, is_published)
        VALUES (${t.id}, ${f.slug}, ${f.question}, ${f.answer}, ${f.sort_order}, true)
        ON CONFLICT (tenant_id, slug) DO UPDATE SET
          question = EXCLUDED.question,
          answer = EXCLUDED.answer,
          sort_order = EXCLUDED.sort_order,
          is_published = true,
          updated_at = now()
      `;
      count++;
    }
  }
  console.log(`Seeded ${count} FAQ rows across ${tenants.length} tenant(s)`);
} catch (e) {
  console.error("Seed failed:", e.message);
  process.exit(1);
} finally {
  await sql.end();
}
