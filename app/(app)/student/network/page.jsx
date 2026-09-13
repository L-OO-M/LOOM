import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";

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

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader
          kicker="Federation"
          title="Chapter network"
          desc="Every college chapter, its builders, and how your chapter compares."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Chapters" value={latest?.total_chapters ?? chapters.length} />
          <Stat label="Students" value={latest?.total_students ?? "—"} />
          <Stat label="Verified OSS merges" value={latest?.total_oss_contributions ?? 0} />
          <Stat label="My chapter rank" value={mine ? `#${chapters.findIndex((c) => c.tenant_id === mine.tenant_id) + 1}` : "—"} />
        </div>

        {partnerships.length > 0 && (
          <Card className="mt-6">
            <h2 className="font-medium" style={{ color: "var(--text)" }}>My chapter's partnerships</h2>
            <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {partnerships.map((p, i) => (
                <li key={i}>{p.a_name} ⇄ {p.b_name} <span style={{ color: "var(--accent)" }}>· {p.collaboration_type}</span></li>
              ))}
            </ul>
          </Card>
        )}

        <h2 className="mt-8 font-medium" style={{ color: "var(--text)" }}>All chapters</h2>
        {chapters.length === 0 ? (
          <div className="mt-4"><EmptyState title="No public chapters yet" body="Chapter profiles appear here once colleges publish them." /></div>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {chapters.map((c) => (
              <li key={c.id}>
                <Link href={`/student/network/${c.slug}`}>
                  <Card className="transition hover:-translate-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium" style={{ color: "var(--text)" }}>{c.public_name}</p>
                      {c.tenant_id === tenant?.id && (
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>yours</span>
                      )}
                    </div>
                    {c.mission && <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--text-muted)" }}>{c.mission}</p>}
                    <p className="mt-3 font-mono text-sm" style={{ color: "var(--text)" }}>
                      {c.members} <span style={{ color: "var(--text-muted)" }} className="font-sans text-xs">members · {c.oss_merges} merges · {c.projects} projects</span>
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
