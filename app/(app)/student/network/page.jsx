import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";
import { ChapterCard, FeaturedChapterCard } from "./_components/ChapterCard";

export const dynamic = "force-dynamic";

const SORTS = [
  { value: "members", label: "Most members" },
  { value: "active", label: "Most active" },
  { value: "name", label: "A–Z" }
];

export default async function NetworkPage({ searchParams }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/network");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").toString().trim().slice(0, 60);
  const sort = SORTS.some((s) => s.value === sp?.sort) ? sp.sort : "members";
  const filtering = q.length > 0 || sort !== "members";

  // One query: public chapters + anonymized counts + active department
  // names as the domain signal. No member identities cross tenants.
  // Ordering stays deterministic (featured → key → slug); fragments mirror
  // the conditional-ORDER pattern used by the events page.
  const orderBy =
    sort === "active"
      ? sql`c.is_featured DESC, oss_merges DESC, members DESC, c.slug ASC`
      : sort === "name"
        ? sql`c.is_featured DESC, c.public_name ASC, c.slug ASC`
        : sql`c.is_featured DESC, members DESC, c.slug ASC`;
  const searchFilter = q
    ? sql`AND (c.public_name ILIKE ${"%" + q + "%"} OR c.mission ILIKE ${"%" + q + "%"} OR c.slug ILIKE ${"%" + q + "%"})`
    : sql``;
  const chapters = await sql`
    SELECT c.*, t.name AS tenant_name,
           (SELECT COUNT(*)::int FROM profiles p WHERE p.tenant_id = c.tenant_id) AS members,
           (SELECT COUNT(*)::int FROM student_oss_contributions o WHERE o.tenant_id = c.tenant_id AND o.status = 'verified') AS oss_merges,
           (SELECT COUNT(*)::int FROM projects pr WHERE pr.tenant_id = c.tenant_id) AS projects,
           (SELECT COALESCE(array_agg(d.name ORDER BY d.name), '{}') FROM departments d WHERE d.tenant_id = c.tenant_id AND d.is_active = true) AS domains
    FROM chapter_profiles c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.is_public = true ${searchFilter}
    ORDER BY ${orderBy}
    LIMIT 50
  `;

  const partnerships = tenant ? await sql`
    SELECT ca.public_name AS a_name, cb.public_name AS b_name, p.collaboration_type
    FROM chapter_partnerships p
    JOIN chapter_profiles ca ON ca.tenant_id = p.tenant_a_id
    JOIN chapter_profiles cb ON cb.tenant_id = p.tenant_b_id
    WHERE (p.tenant_a_id = ${tenant.id} OR p.tenant_b_id = ${tenant.id}) AND p.status = 'active'
    LIMIT 20
  ` : [];
  const [latest] = await sql`SELECT * FROM federation_metrics ORDER BY metric_date DESC LIMIT 1`;

  const mine = chapters.find((c) => c.tenant_id === tenant?.id);
  const myRank = mine ? chapters.findIndex((c) => c.tenant_id === mine.tenant_id) + 1 : null;
  const featured = !filtering ? chapters.filter((c) => c.is_featured).slice(0, 3) : [];
  const featuredIds = new Set(featured.map((c) => c.id));
  const rest = filtering ? chapters : chapters.filter((c) => !featuredIds.has(c.id));
  const partnerNames = mine
    ? partnerships.map((p) => (p.a_name === mine.public_name ? p.b_name : p.a_name))
    : [];

  const sortHref = (value) =>
    `/student/network${q || value !== "members" ? `?${new URLSearchParams({ ...(q ? { q } : {}), ...(value !== "members" ? { sort: value } : {}) }).toString()}` : ""}`;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <Meta>Discover · one society, many campuses</Meta>
        <Display size="lg" className="mt-3">Find your chapter.</Display>
        <p className="narrative mt-4 max-w-2xl">
          Chapters are where builders learn, build, and contribute together. Each one runs its own
          domains, projects, and open-source work — discover where you fit.
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <PlainStat value={latest?.total_chapters ?? chapters.length} unit="chapters" label="public in the federation" />
          <PlainStat value={latest?.total_students ?? chapters.reduce((s, c) => s + (c.members || 0), 0)} unit="students" label="learning across campuses" />
          <PlainStat value={latest?.total_oss_contributions ?? chapters.reduce((s, c) => s + (c.oss_merges || 0), 0)} unit="merges" label="verified open-source work" />
        </div>

        {mine && (
          <section
            aria-label="Your chapter"
            className="mt-8 flex flex-wrap items-baseline justify-between gap-3 rounded-2xl border px-5 py-4"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Your chapter —{" "}
              <Link href={`/student/network/${mine.slug}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>
                {mine.public_name}
              </Link>{" "}
              — sits{" "}
              <strong className="font-mono" style={{ color: "var(--accent)" }}>#{myRank}</strong> by members.
              {partnerNames.length > 0 && <> Partnered with {partnerNames.join(", ")}.</>}
            </p>
            <Link href={`/student/network/${mine.slug}`} prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
              Open your chapter →
            </Link>
          </section>
        )}

        {featured.length > 0 && (
          <section className="mt-12" aria-label="Featured chapters">
            <Meta style={{ color: "var(--accent)" }}>Featured · start here</Meta>
            <div className="mt-4 grid gap-4">
              {featured.map((c) => (
                <FeaturedChapterCard key={c.id} chapter={c} isMine={c.tenant_id === tenant?.id} rank={chapters.findIndex((x) => x.id === c.id) + 1} />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12" aria-label="All chapters">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Meta>{filtering ? `${chapters.length} result${chapters.length === 1 ? "" : "s"}` : "All chapters"}</Meta>
              <h2 className="h-product mt-2">{q ? `Matching “${q}”` : "Every public chapter"}</h2>
            </div>
            {(q || sort !== "members") && (
              <Link href="/student/network" prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Reset filters
              </Link>
            )}
          </div>

          <form method="get" action="/student/network" role="search" aria-label="Search chapters" className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <label htmlFor="chapter-search" className="sr-only">Search chapters</label>
            <input
              id="chapter-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={60}
              placeholder="Search by name, mission, or campus…"
              autoComplete="off"
              className="min-w-0 flex-1"
              style={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--bg-muted)",
                color: "var(--text)",
                padding: "9px 12px",
                fontSize: 14
              }}
            />
            {sort !== "members" && <input type="hidden" name="sort" value={sort} />}
            <button type="submit" className="btn-ink shrink-0">Search</button>
          </form>

          <div className="seg mt-4 w-fit" role="group" aria-label="Sort chapters">
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={sortHref(s.value)}
                prefetch={false}
                aria-pressed={sort === s.value ? "true" : "false"}
                className={sort === s.value ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
                style={sort === s.value ? undefined : { color: "var(--text-muted)" }}
              >
                {s.label}
              </Link>
            ))}
          </div>

          {chapters.length === 0 && !q ? (
            <OnboardingState
              eyebrow="Federation"
              title="No public chapters yet."
              why="Chapter profiles appear here once colleges publish them — with members, merges, and projects, all comparable."
            />
          ) : rest.length === 0 ? (
            <div className="mx-auto max-w-xl py-10 text-center">
              <p className="meta" style={{ color: "var(--accent)" }}>No matches</p>
              <p className="display display-md mt-3">No chapters match your search.</p>
              <p className="narrative mx-auto mt-3 text-center">
                Try a shorter term — a campus, a chapter name, or a word from its mission.
              </p>
              <div className="mt-6">
                <Link href="/student/network" prefetch={false} className="btn-ink">Show all chapters</Link>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {rest.map((c) => (
                <ChapterCard key={c.id} chapter={c} isMine={c.tenant_id === tenant?.id} />
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
