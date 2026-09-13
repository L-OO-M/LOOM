import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ChapterPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/network");
  const { tenant, user, sql } = ctx;
  const { slug } = await params;

  const [chapter] = await sql`
    SELECT c.*, t.name AS tenant_name FROM chapter_profiles c
    JOIN tenants t ON t.id = c.tenant_id
    WHERE c.slug = ${slug} AND c.is_public = true
    LIMIT 1
  `;
  if (!chapter) notFound();

  const [{ members = 0 } = {}] = await sql`SELECT COUNT(*)::int AS members FROM profiles WHERE tenant_id = ${chapter.tenant_id}`;
  const [{ oss = 0 } = {}] = await sql`SELECT COUNT(*)::int AS oss FROM student_oss_contributions WHERE tenant_id = ${chapter.tenant_id} AND status = 'verified'`;
  const [{ projects = 0 } = {}] = await sql`SELECT COUNT(*)::int AS projects FROM projects WHERE tenant_id = ${chapter.tenant_id}`;
  // Top contributors: verified merges per student (names only, no contact info).
  const leaders = await sql`
    SELECT p.name, COUNT(*)::int AS merges
    FROM student_oss_contributions o
    JOIN profiles p ON p.user_id = o.student_id
    WHERE o.tenant_id = ${chapter.tenant_id} AND o.status = 'verified'
    GROUP BY p.name ORDER BY merges DESC LIMIT 5
  `;
  const links = chapter.social_links || {};
  const isMine = chapter.tenant_id === tenant?.id;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/student/network" style={{ color: "var(--accent)" }}>← All chapters</Link>
        </p>
        <PageHeader
          kicker={isMine ? "Your chapter" : "Chapter profile"}
          title={chapter.public_name}
          desc={chapter.mission || undefined}
        />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Members" value={members} />
          <Stat label="OSS merges" value={oss} />
          <Stat label="Projects" value={projects} />
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Top contributors</h2>
            {leaders.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No verified merges yet — be the first.</p>
            ) : (
              <ol className="mt-3 space-y-2 text-sm">
                {leaders.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span style={{ color: "var(--text)" }}>{i + 1}. {l.name}</span>
                    <span className="font-mono" style={{ color: "var(--text-muted)" }}>{l.merges} merges</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Connect</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {chapter.website_url && <li><a href={chapter.website_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Website ↗</a></li>}
              {chapter.contact_email && <li><a href={`mailto:${chapter.contact_email}`} style={{ color: "var(--accent)" }}>{chapter.contact_email}</a></li>}
              {Object.entries(links).map(([k, v]) => (
                <li key={k}><a href={v} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }} className="capitalize">{k} ↗</a></li>
              ))}
              {!chapter.website_url && !chapter.contact_email && Object.keys(links).length === 0 && (
                <li style={{ color: "var(--text-muted)" }}>No public links yet.</li>
              )}
            </ul>
            {!isMine && (
              <p className="mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                Competing with this chapter? Climb your own leaderboard: <Link href="/student/leaderboard" style={{ color: "var(--accent)" }}>Board →</Link>
              </p>
            )}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
