// Claim a college for a chapter, or list who claims what.
//
// Usage:
//   node load/add-chapter-institution.js --list
//   node load/add-chapter-institution.js <chapter-slug> "College Name"
//   node load/add-chapter-institution.js <chapter-slug> "College Name" --city Delhi
//   node load/add-chapter-institution.js <chapter-slug> "College Name" --institution "Primary Name"
//
// WHY THIS EXISTS
// Onboarding asks a member which college they attend and, while onboarding is
// unfinished, moves them to the chapter that serves it (app/api/profile). That
// only works for colleges a chapter has claimed: tenants.institution is the
// primary spelling and tenant_institutions holds the aliases. Chapter creation
// is manual (HANDOFF item 14), so claiming a college is too - this is the one
// command that does it without hand-written SQL.
//
// The alias is stored exactly as typed; matching normalises case, accents and
// punctuation on both sides (lib/chapters.js + migration 090). The script
// refuses to create an ambiguous claim: if the same normalised name already
// resolves to a different chapter, two chapters would answer to one college and
// placement would silently pick the older tenant.
import postgres from "postgres";
import { databaseUrl } from "./env-local.js";
import { normalizeInstitution } from "../lib/chapters.js";

const argv = process.argv.slice(2);

const positional = [];
let listMode = false;
let city = null;
let primary = null;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--list") listMode = true;
  else if (arg === "--city") city = argv[++i] ?? null;
  else if (arg === "--institution") primary = argv[++i] ?? null;
  else positional.push(arg);
}

const sql = postgres(databaseUrl(), { max: 1 });

async function loadChapters() {
  const tenants = await sql`
    SELECT id, slug, name, status, institution, city
      FROM tenants
     ORDER BY created_at ASC
  `;
  const aliases = await sql`
    SELECT tenant_id, name FROM tenant_institutions ORDER BY lower(btrim(name)) ASC
  `;
  return tenants.map((tenant) => ({
    ...tenant,
    aliases: aliases.filter((a) => a.tenant_id === tenant.id).map((a) => a.name)
  }));
}

async function list() {
  const chapters = await loadChapters();
  if (!chapters.length) {
    console.log("No chapters exist yet. Create a tenants row first.");
    return;
  }
  for (const chapter of chapters) {
    const seen = new Set();
    const names = [chapter.institution, ...chapter.aliases].filter((name) => {
      if (!name) return false;
      const key = normalizeInstitution(name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(
      `${chapter.slug} (${chapter.name}${chapter.city ? `, ${chapter.city}` : ""})` +
        ` - ${chapter.status}`
    );
    console.log(
      names.length
        ? names.map((n) => `    ${n}`).join("\n")
        : "    no college claimed - members who name one stay where they signed up"
    );
  }
}

async function claim() {
  const [slug, institution] = positional;

  if (!slug || !institution) {
    console.error('Usage: node load/add-chapter-institution.js <chapter-slug> "College Name" [--city City] [--institution "Primary Name"]');
    process.exit(1);
  }

  const chapters = await loadChapters();
  const chapter = chapters.find((c) => c.slug === slug);
  if (!chapter) {
    console.error(
      `No chapter with slug "${slug}". Existing: ${chapters.map((c) => c.slug).join(", ") || "(none)"}`
    );
    process.exit(1);
  }

  // One college, one chapter. Refuse the ambiguous claim instead of letting
  // whichever tenant was created first win at placement time.
  const key = normalizeInstitution(institution);
  const conflict = chapters.find(
    (other) =>
      other.id !== chapter.id &&
      [other.institution, ...other.aliases]
        .filter(Boolean)
        .some((name) => normalizeInstitution(name) === key)
  );
  if (conflict) {
    console.error(
      `"${institution}" is already claimed by ${conflict.slug} as ` +
        `"${[conflict.institution, ...conflict.aliases].find((n) => normalizeInstitution(n) === key)}". ` +
        "Remove that claim first if the college genuinely changed hands."
    );
    process.exit(1);
  }

  if (city) {
    await sql`UPDATE tenants SET city = ${city} WHERE id = ${chapter.id}`;
  }
  if (primary) {
    await sql`UPDATE tenants SET institution = ${primary} WHERE id = ${chapter.id}`;
  }

  const [inserted] = await sql`
    INSERT INTO tenant_institutions (tenant_id, name)
    VALUES (${chapter.id}, ${institution})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;

  console.log(
    inserted
      ? `Claimed "${institution}" for ${chapter.slug} (${chapter.name}).`
      : `${chapter.slug} already claims "${institution}".`
  );
  console.log("Members who name this college now land in this chapter at onboarding.");
}

try {
  if (listMode) await list();
  else await claim();
} catch (error) {
  console.error("Failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
