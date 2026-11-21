// Chapter display helpers (pure, no React). Shared by the student
// Chapters list (/student/network) and chapter detail (/student/network/[slug]).

/**
 * Initials for a chapter avatar circle: first letters of the first two
 * significant words. Falls back to "?" for empty input. Never throws.
 */
export function initialsFor(name) {
  if (!name || typeof name !== "string") return "?";
  const words = name
    .replace(/^(the|a|an)\s+/i, "")
    .split(/[\s\-_/|]+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Institution -> chapter.
//
// A chapter is a tenant. Which one a member belongs to is an isolation
// boundary, so this file only ever *answers questions* - it never writes. The
// one place a chapter can change is /api/profile, under the guard documented
// there (first-run onboarding, no leadership position held).
//
// Matching is deliberately forgiving about punctuation and case, because a
// student types "IIT Delhi" and an operator typed "Indian Institute of
// Technology Delhi" long before anyone met. normalizeInstitution() and the
// regexp_replace() beside it apply the same rule; keep them in step.

/**
 * "Indian Institute of Technology, Delhi" -> "indian institute of technology delhi"
 *
 * Lowercase, strip accents, collapse every run of non-alphanumerics into one
 * space. Empty or whitespace-only input normalises to "" and matches nothing.
 */
export function normalizeInstitution(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Every institution alias an active chapter answers to, for the onboarding
 * picker. Public information: it is a list of colleges, not a list of members.
 */
export async function listInstitutions(sql, { limit = 200 } = {}) {
  const rows = await sql`
    SELECT ti.name, t.slug, t.name AS chapter_name, t.city
    FROM tenant_institutions ti
    JOIN tenants t ON t.id = ti.tenant_id
    WHERE t.status = 'active'
    ORDER BY lower(btrim(ti.name)) ASC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    name: row.name,
    city: row.city ?? null,
    chapter: { slug: row.slug, name: row.chapter_name }
  }));
}

/**
 * The chapter that serves an institution, or null when nobody has claimed it.
 *
 * A chapter matches through its own `institution` column or through any alias
 * in tenant_institutions, so an operator can add a second spelling without
 * touching the primary value.
 */
export async function matchChapterForInstitution(sql, institution) {
  const key = normalizeInstitution(institution);
  if (!key) return null;

  const [match] = await sql`
    SELECT t.id, t.slug, t.name
    FROM tenants t
    WHERE t.status = 'active'
      AND (
        regexp_replace(lower(btrim(coalesce(t.institution, t.name))), '[^a-z0-9]+', ' ', 'g') = ${key}
        OR EXISTS (
          SELECT 1 FROM tenant_institutions ti
          WHERE ti.tenant_id = t.id
            AND regexp_replace(lower(btrim(ti.name)), '[^a-z0-9]+', ' ', 'g') = ${key}
        )
      )
    ORDER BY t.created_at ASC
    LIMIT 1
  `;
  return match ? { id: match.id, slug: match.slug, name: match.name } : null;
}
