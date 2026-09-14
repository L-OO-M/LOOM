import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { OnboardingState } from "@/components/loom/States";

export const dynamic = "force-dynamic";

export default async function NetworkPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/network");
  const { tenant, user, sql } = ctx;

  const chapters = await sql`
    SELECT c.*, t.name AS tenant_name,
           (SELECT COUNT(*)::int FROM profiles p WHERE p.tenant_id = c.tenant_id) AS members,
           (SELECT COUNT(*)::int FROM student_oss_contributions o WHERE o.tenant_id = c.tenant_id AND o.status = 'verified') AS oss_merges,
           (SELECT COUNT(*)::int FROM projects pr WHERE pr.tenant_id = c.tenant_id) AS projects
    FROM chapter_profiles c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.is_public = true
    ORDER BY members DESC
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

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Discover · one society, many campuses</Meta>
        <Display size="lg" className="mt-3">Chapters, compared honestly.</Display>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <PlainStat value={latest?.total_chapters ?? chapters.length} unit="chapters" label="public in the federation" />
          <PlainStat value={latest?.total_students ?? chapters.reduce((s, c) => s + (c.members || 0), 0)} unit="students" label="learning across campuses" />
          <PlainStat value={latest?.total_oss_contributions ?? chapters.reduce((s, c) => s + (c.oss_merges || 0), 0)} unit="merges" label="verified open-source work" />
        </div>

        {mine && (
          <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Your chapter — <strong style={{ color: "var(--text)" }}>{mine.public_name}</strong> — sits{" "}
            <strong className="font-mono" style={{ color: "var(--accent)" }}>#{myRank}</strong> by members.
            {partnerships.length > 0 && <> Partnered with {partnerships.map((p) => (p.a_name === mine.public_name ? p.b_name : p.a_name)).join(", ")}.</>}
          </p>
        )}

        {chapters.length === 0 ? (
          <OnboardingState
            eyebrow="Federation"
            title="No public chapters yet."
            why="Chapter profiles appear here once colleges publish them — with members, merges, and projects, all comparable."
          />
        ) : (
          <ol className="mt-8">
            {chapters.map((c, i) => (
              <li key={c.id} className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
                <Link href={`/student/network/${c.slug}`} className="row-link flex items-baseline gap-4 px-2 py-1">
                  <span className="index-num w-8 shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>
                      {c.public_name}
                      {c.tenant_id === tenant?.id && <span className="meta ml-2" style={{ color: "var(--accent)" }}>yours</span>}
                    </span>
                    {c.mission && <span className="mt-0.5 block truncate text-sm" style={{ color: "var(--text-muted)" }}>{c.mission}</span>}
                  </span>
                  <span className="meta shrink-0 text-right">{c.members} members · {c.oss_merges} merges · {c.projects} projects</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </main>
    </AppShell>
  );
}
