import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";
import { canViewDepartment } from "@/lib/department-workspace";
import { memberProgress } from "@/lib/member-progress";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Member progress",
  robots: { index: false, follow: false }
};

const ROLE_LABEL = {
  student: "Member",
  core: "Core member",
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Admin",
  platform_admin: "Platform Admin"
};

const LEVEL_LABEL = { dept_lead: "Head / Co-head", core: "Core", general: "General" };

const shortDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

/**
 * One member's progress, as their department head sees it.
 *
 * This is the page a roster row leads to. It answers the only question a head
 * actually has before promoting someone: is this person moving, and on what
 * evidence? So it shows the same tier, chapter position and verified proof the
 * member sees on /student/roles, plus the work behind those numbers.
 *
 * Access is the roster's access. A head may open a member of a department they
 * lead; a vertical lead may open anyone in their vertical; admins anyone. The
 * check is `canViewDepartment` -- the same predicate that decides whether they
 * can open the department workspace at all -- so this page cannot become a
 * wider door than the roster it is reached from.
 */
export default async function LeadMemberPage({ params }) {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/lead/overview");
  const { user, profile, tenant, sql } = ctx;

  const subject = {
    id: user.id,
    tenantId: tenant.id,
    role: profile.role,
    vertical: profile.vertical || null,
    memberships: profile.memberships || [],
    scopedGrants: profile.scopedGrants || [],
    roleTermEnd: profile.roleTermEnd ?? profile.role_term_end ?? null,
    isPlatformAdmin: !!profile.isPlatformAdmin
  };
  if (!can(subject, "manage_handover").ok) redirect("/student");

  const { userId } = await params;
  if (!userId || typeof userId !== "string") notFound();

  const [person] = await sql`
    SELECT p.user_id, p.name, p.role, p.primary_domain, p.year, p.branch,
           p.github_username, p.updated_at,
           up.username, up.bio, up.avatar_url, up.location, up.social_links, up.is_public
    FROM profiles p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE p.user_id = ${userId} AND p.tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!person) notFound();

  const allDepartments = await sql`
    SELECT d.id, d.name, d.slug, d.vertical, m.level, m.term_end, m.joined_at
    FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE m.user_id = ${person.user_id} AND m.tenant_id = ${tenant.id}::uuid
    ORDER BY d.name ASC
  `;
  // Same predicate as the roster and the workspace page. If the head cannot
  // open the department, they cannot read its member's record through here.
  const departments = allDepartments.filter((d) => canViewDepartment(profile, d));
  if (departments.length === 0 && String(person.user_id) !== String(user.id)) notFound();

  const progressMap = await memberProgress(sql, {
    tenantId: tenant.id,
    userIds: [person.user_id]
  });
  const progress = progressMap.get(String(person.user_id)) || null;

  const nodes = await sql`
    SELECT n.title, n.domain, p.completed_at, p.verified_at
    FROM student_roadmap_progress p
    JOIN roadmap_nodes n ON n.id = p.node_id
    WHERE p.student_id = ${person.user_id} AND p.tenant_id = ${tenant.id}::uuid
      AND p.status = 'completed' AND p.evidence_state = 'verified'
    ORDER BY COALESCE(p.verified_at, p.completed_at) DESC NULLS LAST
    LIMIT 12
  `;

  const projects = await sql`
    SELECT id, title, repo_url, verified_at
    FROM projects
    WHERE owner_id = ${person.user_id} AND tenant_id = ${tenant.id}::uuid
      AND evidence_state = 'verified'
    ORDER BY verified_at DESC NULLS LAST
    LIMIT 6
  `;

  const oss = await sql`
    SELECT id, title, repo_url, pr_url, merged_at
    FROM student_oss_contributions
    WHERE student_id = ${person.user_id} AND status = 'verified'
    ORDER BY COALESCE(verified_at, merged_at) DESC NULLS LAST
    LIMIT 6
  `;

  const departmentIds = departments.map((d) => d.id);
  const contributions = departmentIds.length ? await sql`
    SELECT c.id, c.kind, c.title, c.created_at, d.name AS department_name
    FROM member_contributions c
    JOIN departments d ON d.id = c.department_id
    WHERE c.student_id = ${person.user_id} AND c.department_id = ANY(${departmentIds})
    ORDER BY c.created_at DESC
    LIMIT 8
  ` : [];

  const requests = await sql`
    SELECT r.target_role, r.status, r.created_at, r.decided_at, r.decision_reason,
           d.name AS department_name
    FROM role_requests r
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.user_id = ${person.user_id} AND r.tenant_id = ${tenant.id}::uuid
    ORDER BY r.created_at DESC
    LIMIT 5
  `;

  const [attendance] = await sql`
    SELECT COUNT(*)::int AS n FROM event_registrations
    WHERE student_id = ${person.user_id} AND tenant_id = ${tenant.id}::uuid
      AND status = 'attended'
  `;

  const standing = progress?.standing
    ? `#${progress.standing.rank} of ${progress.standing.total}`
    : "Unranked";
  const isSelf = String(person.user_id) === String(user.id);
  const isAdmin = profile.role === "admin" || profile.role === "platform_admin";

  return (
    <AppShell area="lead" tenant={tenant} user={user}>
      <WorkspaceMasthead
        kicker="Roster"
        title={person.name || "A member"}
        lede={
          isSelf
            ? "This is how your record reads to a department head."
            : `What ${person.name || "this member"} has actually done, counted from verified evidence only.`
        }
        stats={[
          { label: "Rank", value: progress?.tier || "beginner" },
          { label: "Chapter position", value: standing },
          { label: "Verified proof", value: String(progress?.proofTotal || 0) },
          { label: "Events attended", value: String(attendance?.n || 0) }
        ]}
      />

      <WorkspaceSection index="01" title="Who they are" note="Their own card, not an admin record.">
        <div className="flex flex-wrap items-start gap-4">
          {person.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={person.avatar_url}
              alt=""
              width={56}
              height={56}
              className="h-14 w-14 rounded-full object-cover"
              style={{ border: "1px solid var(--line)" }}
            />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <p>
              <span className="font-medium" style={{ color: "var(--text)" }}>
                {ROLE_LABEL[person.role] || "Member"}
              </span>
              {person.primary_domain ? ` · ${person.primary_domain}` : ""}
              {person.year ? ` · year ${person.year}` : ""}
              {person.branch ? ` · ${person.branch}` : ""}
            </p>
            {person.bio && <p className="max-w-2xl">{person.bio}</p>}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {person.github_username && (
                <a
                  href={`https://github.com/${person.github_username}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  @{person.github_username}
                </a>
              )}
              <span>{progress?.activity || "no activity recorded"}</span>
              {progress?.lastActive && <span>last seen {shortDate(progress.lastActive)}</span>}
              {person.is_public && person.username && (
                <Link href={`/u/${person.username}`} prefetch={false} className="hover:underline" style={{ color: "var(--accent)" }}>
                  Public profile
                </Link>
              )}
              {isAdmin && (
                <Link href={`/admin/students/${person.user_id}`} prefetch={false} className="hover:underline" style={{ color: "var(--accent)" }}>
                  Admin record
                </Link>
              )}
            </p>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection index="02" title="Where they stand" note="The same numbers the member sees on Seats and Standings. Unverified claims score nothing.">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Roadmap", value: `${progress?.roadmapPct ?? 0}%` },
            { label: "Verified roadmap nodes", value: String(progress?.proof.nodes || 0) },
            { label: "Verified projects", value: String(progress?.proof.projects || 0) },
            { label: "Merged OSS", value: String(progress?.proof.oss || 0) },
            { label: "Accepted answers", value: String(progress?.proof.answers || 0) },
            { label: "Commits (30d)", value: progress?.commits30d === null ? "no data" : String(progress?.commits30d ?? 0) },
            { label: "Pull requests (30d)", value: progress?.prs30d === null ? "no data" : String(progress?.prs30d ?? 0) },
            { label: "Chapter position", value: standing }
          ].map((stat) => (
            <li
              key={stat.label}
              className="flex items-baseline justify-between rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>{stat.label}</span>
              <span className="font-display text-lg" style={{ color: "var(--text)" }}>{stat.value}</span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>

      <WorkspaceSection index="03" title="Seats" note="Department membership and the seat history. A Head seat is an admin appointment.">
        {departments.length === 0 ? (
          <WorkspaceEmpty
            title="No shared department"
            body="They hold no seat in a department you lead."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {departments.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-4 py-3"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <Link href={`/lead/departments/${d.slug}`} prefetch={false} className="text-sm font-medium hover:underline" style={{ color: "var(--text)" }}>
                  {d.name}
                </Link>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {LEVEL_LABEL[d.level] || d.level}
                  {d.joined_at ? ` · joined ${shortDate(d.joined_at)}` : ""}
                  {d.term_end ? ` · term to ${shortDate(d.term_end)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection index="04" title="The work behind the numbers" note="Only verified evidence is listed. A pending claim stays out of this page and out of the tier.">
        <div className="grid gap-6 lg:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>Roadmap nodes</h3>
            {nodes.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No verified nodes yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                {nodes.map((n, i) => (
                  <li key={`${n.title}-${i}`} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>{n.title}</span>
                    <span className="shrink-0 text-xs">{n.domain || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>Projects</h3>
            {projects.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No verified projects yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {projects.map((p) => (
                  <li key={p.id} className="truncate">
                    {p.repo_url ? (
                      <a href={p.repo_url} target="_blank" rel="noreferrer noopener" className="hover:underline" style={{ color: "var(--accent)" }}>{p.title}</a>
                    ) : (
                      <span style={{ color: "var(--text)" }}>{p.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium" style={{ color: "var(--text)" }}>Merged OSS</h3>
            {oss.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No merged contributions yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {oss.map((o) => (
                  <li key={o.id} className="truncate">
                    <a href={o.pr_url || o.repo_url} target="_blank" rel="noreferrer noopener" className="hover:underline" style={{ color: "var(--accent)" }}>{o.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection index="05" title="Department record" note="Work logged against the departments you share with them.">
        {contributions.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nothing logged in your departments yet.</p>
        ) : (
          <ul className="space-y-2">
            {contributions.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <span style={{ color: "var(--text)" }}>{c.title}</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {c.kind} · {c.department_name} · {shortDate(c.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection index="06" title="Seat requests" note="What they asked for, and how it was decided. The snapshot they applied with is frozen on the request.">
        {requests.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>No seat requests.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((r, i) => (
              <li
                key={`${r.created_at}-${i}`}
                className="rounded-xl border px-4 py-2.5 text-sm"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span style={{ color: "var(--text)" }}>
                    {r.target_role === "core" ? "Core" : "Head"}
                    {r.department_name ? ` · ${r.department_name}` : ""}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.status} · asked {shortDate(r.created_at)}
                  </span>
                </div>
                {r.decision_reason && (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{r.decision_reason}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </AppShell>
  );
}
