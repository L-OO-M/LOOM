import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";

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
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/network" className="meta hover:underline" style={{ color: "var(--accent)" }}>← All chapters</Link>
        <Meta className="mt-4">{isMine ? "Your chapter" : "Chapter profile"}</Meta>
        <Display size="lg" className="mt-3">{chapter.public_name}</Display>
        {chapter.mission && <p className="lede mt-4">{chapter.mission}</p>}

        <div className="mt-8 grid gap-8 border-y py-7 sm:grid-cols-3" style={{ borderColor: "var(--line)" }}>
          <PlainStat value={members} unit="members" label="learning together" />
          <PlainStat value={oss} unit="merges" label="verified open-source work" />
          <PlainStat value={projects} unit="projects" label="shipped and counting" />
        </div>

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <section aria-label="Top contributors">
            <Meta>Top contributors</Meta>
            {leaders.length === 0 ? (
              <p className="narrative mt-3">No verified merges yet — the first name here could be yours.</p>
            ) : (
              <ol className="mt-3">
                {leaders.map((l, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 border-b py-2.5" style={{ borderColor: "var(--line)" }}>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      <span className="index-num mr-3">{i + 1}</span>{l.name}
                    </span>
                    <span className="figure-mono text-sm" style={{ color: "var(--text-muted)" }}>{l.merges} merges</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Connect">
            <Meta>Connect</Meta>
            <ul className="mt-3 space-y-2.5 text-sm">
              {chapter.website_url && <li><a href={chapter.website_url} target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Website ↗</a></li>}
              {chapter.contact_email && <li><a href={`mailto:${chapter.contact_email}`} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>{chapter.contact_email}</a></li>}
              {Object.entries(links).map(([k, v]) => (
                <li key={k}><a href={v} target="_blank" rel="noreferrer" className="font-semibold capitalize hover:underline" style={{ color: "var(--accent)" }}>{k} ↗</a></li>
              ))}
              {!chapter.website_url && !chapter.contact_email && Object.keys(links).length === 0 && (
                <li style={{ color: "var(--text-muted)" }}>No public links yet.</li>
              )}
            </ul>
            {!isMine && (
              <p className="narrative mt-5">
                Racing this chapter? <Link href="/student/leaderboard" className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Climb your board →</Link>
              </p>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
