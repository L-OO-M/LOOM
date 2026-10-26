import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, Award, MessageCircle, Inbox, Check, X, Sparkles } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { MentorForm } from "@/components/admin-forms";
import { ReviewButtons } from "./ReviewButtons";
import "../_components/admin-ledger.css";

export default async function AdminMentorsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/mentors");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/mentors");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM mentors WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS mentors,
      (SELECT COUNT(*)::int FROM mentors WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND available = true) AS available,
      (SELECT COUNT(*)::int FROM mentor_applications WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AND status = 'pending') AS pending,
      (SELECT COUNT(*)::int FROM mentor_sessions s JOIN mentors m ON m.user_id = s.mentor_id WHERE (m.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS sessions
  `;

  const mentors = await sql`
    SELECT m.*, p.name AS mentor_name, p.github_username,
           (SELECT COUNT(*)::int FROM mentor_sessions s WHERE s.mentor_id = m.user_id) AS session_count
    FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE m.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
    ORDER BY m.available DESC, m.created_at DESC LIMIT 50
  `;

  const sessions = await sql`
    SELECT s.*, pm.name AS mentor_name, ps.name AS student_name
    FROM mentor_sessions s
    LEFT JOIN mentors m ON m.user_id = s.mentor_id
    LEFT JOIN profiles pm ON pm.user_id = s.mentor_id
    LEFT JOIN profiles ps ON ps.user_id = s.student_id
    WHERE (m.tenant_id = ${tid}::uuid OR m.tenant_id IS NULL OR s.mentor_id IS NULL)
    ORDER BY s.created_at DESC LIMIT 20
  `;

  const applications = await sql`
    SELECT a.*, p.name AS applicant_name, p.primary_domain, p.branch, p.year
    FROM mentor_applications a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    WHERE a.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC
    LIMIT 20
  `;
  const pending = applications.filter((a) => a.status === "pending");
  const availability = stats?.available && stats?.mentors ? Math.round((stats.available / stats.mentors) * 100) : null;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Guidance / ${stats?.mentors ?? 0} mentors / ${pending.length} candidacies pending`}
          title="Mentors"
          lede="Review candidacies on evidence, manage the roster, and track sessions. Mentorship is a capability, not a role."
          meta={`${stats?.available ?? 0} available / ${stats?.sessions ?? 0} sessions all time / ${applications.length} applications on file`}
          tone="field"
          art="/storyloom/mentorship.png"
          artAlt=""
          stats={[
            { value: stats?.mentors ?? 0, label: "mentors" },
            { value: stats?.available ?? 0, label: "available now" },
            { value: pending.length, label: "pending review" },
            { value: stats?.sessions ?? 0, label: "sessions all time" }
          ]}
        />

        <WorkspaceSection
          index="01"
          title="Roster"
          note="Available mentors sort first. Sessions count only activity logged against this chapter."
          action={<Link href="/admin/students" prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">Find students →</Link>}
        >
          {mentors.length === 0 ? (
            <WorkspaceEmpty
              title="No mentors yet"
              body="Add a mentor from an enrolled student, or approve a candidacy below. Mentors guide juniors — they don't replace Heads."
            />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {mentors.map((m) => (
                <li key={m.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{m.mentor_name || m.user_id}</span>
                    <p className="aled-sub">
                      {m.expertise || "General"} · {m.github_username ? `@${m.github_username}` : m.user_id.slice(0, 8)}
                    </p>
                    {m.bio && <p className="aled-sub" style={{ color: "var(--text)" }}>{m.bio}</p>}
                  </div>
                  <div className="aled-actions">
                    <span className={`aled-tag ${m.available ? "aled-tag--success" : ""}`}>
                      {m.available ? <Check size={10} aria-hidden="true" /> : <X size={10} aria-hidden="true" />} {m.available ? "Available" : "Paused"}
                    </span>
                    <span className="aled-tag"><MessageCircle size={10} aria-hidden="true" /> {m.session_count ?? 0} sessions</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Recent sessions" note="Newest first, cap 20. Sessions appear once a student requests a mentor." action={<Clock3 size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />}>
          {sessions.length === 0 ? (
            <WorkspaceEmpty title="No sessions yet" body="They appear once a student requests a mentor." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {sessions.map((s) => (
                <li key={s.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{s.student_name || s.student_id.slice(0, 8)}</span>
                    <p className="aled-sub">→ {s.mentor_name || s.mentor_id.slice(0, 8)}</p>
                  </div>
                  <span className="aled-tag" style={{ textTransform: "capitalize" }}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>

        <div className="aled-split">
          <WorkspaceSection index="03" title="Add mentor" note="Promotes a student to mentor. Prefer approving a candidacy below — it carries evidence.">
            <div className="aled-panel">
              <MentorForm />
              <p className="aled-meta" style={{ marginTop: "0.8rem" }}>
                Tip: copy <span style={{ fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>user_id</span> from the Students roster.
              </p>
            </div>
          </WorkspaceSection>

          <WorkspaceSection index="04" title="How candidacies work" note="Reviewed with the evidence attached at the time of application.">
            <div className="aled-panel">
              <ul className="aled-notes">
                <li><span><Award size={12} aria-hidden="true" /> Eligibility is computed from path %, merges, solutions, projects.</span></li>
                <li><span><Check size={12} aria-hidden="true" /> Approval creates a mentor row immediately.</span></li>
                <li><span><MessageCircle size={12} aria-hidden="true" /> Declines notify the applicant.</span></li>
                <li><span><Sparkles size={12} aria-hidden="true" /> Availability ratio: {availability == null ? "—" : `${availability}%`} of the roster.</span></li>
              </ul>
            </div>
          </WorkspaceSection>
        </div>

        <WorkspaceSection
          index="05"
          title="Candidacies"
          note="Pending first. Path, merges, solutions, and projects are the evidence at application time."
          action={<span className="aled-meta">{pending.length} awaiting / {applications.length} total</span>}
        >
          {applications.length === 0 ? (
            <WorkspaceEmpty
              title="No applications yet"
              body="When students prove themselves, their candidacies land here with the evidence attached — path completion, merges, and projects at the time of application."
            />
          ) : (
            <div className="aled-stack" style={{ marginTop: "0.9rem" }}>
              {applications.map((a) => {
                const el = a.eligibility || {};
                const st = el.stats || {};
                const pct = typeof st.pct === "number" ? st.pct : null;
                const isPending = a.status === "pending";
                return (
                  <div key={a.id} className="aled-panel" style={{ borderColor: isPending ? "color-mix(in srgb, var(--accent) 30%, var(--line))" : "var(--line)" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
                      <div className="aled-copy">
                        <p className="aled-panel-title" style={{ marginBottom: "0.2rem" }}>
                          {a.applicant_name || a.student_id}
                          <span className={`aled-tag ${isPending ? "aled-tag--accent" : ""}`} style={{ marginLeft: "0.45rem" }}>{a.status}</span>
                        </p>
                        <p className="aled-sub" style={{ margin: 0 }}>
                          {a.primary_domain || "—"}{a.branch ? ` · ${a.branch}` : ""}{a.year ? ` · Year ${a.year}` : ""}
                        </p>
                        <p className="aled-meta" style={{ marginTop: "0.25rem" }}>
                          {new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} · {a.student_id.slice(0, 8)}
                        </p>
                      </div>
                      {isPending && <span className="aled-tag aled-tag--accent"><Inbox size={12} aria-hidden="true" /> Needs review</span>}
                    </div>

                    {a.expertise && <p style={{ margin: "0.6rem 0 0" }}><span className="aled-tag aled-tag--accent">{a.expertise}</span></p>}
                    {a.statement && <p className="aled-sub" style={{ marginTop: "0.6rem", color: "var(--text)" }}>“{a.statement}”</p>}

                    <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                      <li className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                        <div className="aled-copy">
                          <span className="aled-title">Path completion</span>
                          <span className="aled-meter" aria-hidden="true">
                            <span style={{ width: `${pct != null ? Math.min(100, pct) : 0}%` }} />
                          </span>
                        </div>
                        <span className="aled-value">{pct != null ? `${pct}%` : "—"}</span>
                      </li>
                      <li className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                        <span className="aled-title">Merges</span>
                        <span className="aled-value">{st.oss ?? 0}</span>
                      </li>
                      <li className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                        <span className="aled-title">Solutions</span>
                        <span className="aled-value">{st.solutions ?? 0}</span>
                      </li>
                      <li className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                        <span className="aled-title">Projects</span>
                        <span className="aled-value">{st.projects ?? 0}</span>
                      </li>
                    </ul>

                    {isPending && <div style={{ marginTop: "0.9rem" }}><ReviewButtons applicationId={a.id} /></div>}
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
