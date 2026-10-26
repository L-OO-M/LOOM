import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { StatusPill, ActionLink } from "@/components/loom/primitives";
import { WorkspaceMasthead, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { initialsFor } from "@/lib/chapters";
import { DiscoverTabs } from "@/components/student/SectionRails";

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
  const isMine = chapter.tenant_id === tenant?.id;

  const [{ members = 0 } = {}] = await sql`SELECT COUNT(*)::int AS members FROM profiles WHERE tenant_id = ${chapter.tenant_id}`;
  const [{ oss = 0 } = {}] = await sql`SELECT COUNT(*)::int AS oss FROM student_oss_contributions WHERE tenant_id = ${chapter.tenant_id} AND status = 'verified'`;
  const [{ projects = 0 } = {}] = await sql`SELECT COUNT(*)::int AS projects FROM projects WHERE tenant_id = ${chapter.tenant_id}`;
  // Recent activity, anonymized: verified merges in the last 30 days.
  const [{ recentMerges = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS "recentMerges" FROM student_oss_contributions
    WHERE tenant_id = ${chapter.tenant_id} AND status = 'verified' AND COALESCE(merged_at, verified_at, created_at) >= now() - interval '30 days'
  `;
  // Domains & org units: active departments are public org data
  // (same source as /domains). Member counts are anonymized aggregates.
  const departments = await sql`
    SELECT d.name, d.slug, d.vertical,
           (SELECT COUNT(*)::int FROM department_memberships m WHERE m.department_id = d.id) AS members
    FROM departments d
    WHERE d.tenant_id = ${chapter.tenant_id} AND d.is_active = true
    ORDER BY d.vertical, d.name
    LIMIT 12
  `;
  // Top contributors: verified merges per student (names only, no contact info).
  // Usernames link to public profiles only for the viewer's own chapter,
  // where same-chapter visibility already applies — never cross-tenant.
  const leaders = await sql`
    SELECT p.name, COUNT(*)::int AS merges,
           CASE WHEN ${isMine} THEN up.username ELSE NULL END AS username,
           CASE WHEN ${isMine} THEN COALESCE(up.is_public, false) ELSE false END AS linkable
    FROM student_oss_contributions o
    JOIN profiles p ON p.user_id = o.student_id
    LEFT JOIN user_profiles up ON up.user_id = o.student_id
    WHERE o.tenant_id = ${chapter.tenant_id} AND o.status = 'verified'
    GROUP BY p.name, up.username, up.is_public ORDER BY merges DESC LIMIT 5
  `;
  const partnerships = await sql`
    SELECT ca.public_name AS a_name, cb.public_name AS b_name,
           ca.slug AS a_slug, cb.slug AS b_slug, p.collaboration_type
    FROM chapter_partnerships p
    JOIN chapter_profiles ca ON ca.tenant_id = p.tenant_a_id
    JOIN chapter_profiles cb ON cb.tenant_id = p.tenant_b_id
    WHERE (p.tenant_a_id = ${chapter.tenant_id} OR p.tenant_b_id = ${chapter.tenant_id}) AND p.status = 'active'
    LIMIT 10
  `;
  const links = chapter.social_links || {};

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Link href="/student/network" prefetch={false} className="meta hover:underline" style={{ color: "var(--accent)" }}>← All chapters</Link>

        <WorkspaceMasthead
          kicker={isMine ? "Network / your chapter" : "Network / chapter profile"}
          title={chapter.public_name}
          lede={chapter.mission || undefined}
          meta={`Folio ${initialsFor(chapter.public_name)} / ${isMine ? "your chapter" : "public chapter"}`}
          tone="paper"
          art="/domains-art/domain-creative.png"
          artAlt=""
          stats={[
            { value: members, label: "members learning" },
            { value: oss, label: "verified merges" },
            { value: projects, label: "projects shipped" }
          ]}
          actions={
            <>
              {isMine && <StatusPill tone="live">your chapter</StatusPill>}
              {chapter.is_featured && <StatusPill>featured</StatusPill>}
            </>
          }
        />

        <DiscoverTabs active="/student/network" />

        {departments.length > 0 && (
          <WorkspaceSection index="01" title="Domains & departments" note={`${departments.length} active in this chapter.`}>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {departments.map((d) => (
                <li key={d.slug} className="rounded-2xl border px-4 py-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <Link href={`/domains/${d.slug}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--text)" }}>
                      {d.name}
                    </Link>
                    <span className="meta shrink-0">{d.members} members</span>
                  </div>
                  <p className="meta mt-1">{d.vertical === "technical" ? "Technical" : "Non-technical"}</p>
                </li>
              ))}
            </ul>
          </WorkspaceSection>
        )}

        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          <WorkspaceSection index="02" title="Top contributors" note="Verified merges, names only.">
            {leaders.length === 0 ? (
              <p className="narrative mt-3">No verified merges yet — the first name here could be yours.</p>
            ) : (
              <ol className="mt-3">
                {leaders.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="flex items-baseline justify-between gap-3 border-b py-2.5" style={{ borderColor: "var(--line)" }}>
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      <span className="index-num mr-3">{i + 1}</span>
                      {l.linkable && l.username ? (
                        <Link href={`/student/${l.username}`} prefetch={false} className="hover:underline">@{l.username}</Link>
                      ) : (
                        l.name
                      )}
                    </span>
                    <span className="figure-mono shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>{l.merges} merges</span>
                  </li>
                ))}
              </ol>
            )}
            {isMine && (
              <p className="mt-4">
                <ActionLink href="/student/discover">Meet the builders</ActionLink>
              </p>
            )}
          </WorkspaceSection>

          <div className="space-y-10">
            <WorkspaceSection title="Activity" note="Last 30 days.">
              {oss === 0 && projects === 0 ? (
                <p className="narrative mt-3">Quiet so far — no shipped projects or verified merges yet.</p>
              ) : (
                <ul className="mt-3 space-y-2.5 text-sm" style={{ color: "var(--text-muted)" }}>
                  <li><strong style={{ color: "var(--text)" }}>{recentMerges}</strong> verified merge{recentMerges === 1 ? "" : "s"} in the last 30 days</li>
                  <li><strong style={{ color: "var(--text)" }}>{projects}</strong> project{projects === 1 ? "" : "s"} shipped all-time</li>
                </ul>
              )}
              {isMine && (
                <div className="mt-4 flex flex-col gap-2.5 text-sm">
                  <ActionLink href="/student/projects">Explore chapter projects</ActionLink>
                  <ActionLink href="/student/events">View chapter events</ActionLink>
                  <ActionLink href="/student/community">Join the conversation</ActionLink>
                </div>
              )}
              {!isMine && (
                <p className="narrative mt-5">
                  Racing this chapter? <Link href="/student/leaderboard" prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--accent)" }}>Climb your board →</Link>
                </p>
              )}
            </WorkspaceSection>

            <WorkspaceSection title="Connect" note="Public links shared by the chapter.">
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
            </WorkspaceSection>
          </div>
        </div>

        {partnerships.length > 0 && (
          <WorkspaceSection index="03" title="Partnerships" note={`${partnerships.length} active ${partnerships.length === 1 ? "collaboration" : "collaborations"}.`}>
            <ul className="mt-3 space-y-2.5 text-sm" style={{ color: "var(--text-muted)" }}>
              {partnerships.map((p, i) => {
                const otherName = p.a_name === chapter.public_name ? p.b_name : p.a_name;
                const otherSlug = p.a_name === chapter.public_name ? p.b_slug : p.a_slug;
                return (
                  <li key={i}>
                    <Link href={`/student/network/${otherSlug}`} prefetch={false} className="font-semibold hover:underline" style={{ color: "var(--text)" }}>
                      {otherName}
                    </Link>{" "}
                    · {(p.collaboration_type || "collaboration").replace(/-/g, " ")}
                  </li>
                );
              })}
            </ul>
          </WorkspaceSection>
        )}
      </main>
    </AppShell>
  );
}
