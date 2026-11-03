import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock3, Award, MessageCircle, Inbox, Check, X, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { MentorPicker } from "@/components/admin/MentorPicker";
import { pageHref, pageWindow } from "@/lib/pagination";
import { ReviewButtons } from "./ReviewButtons";
import "../_components/admin-ledger.css";
// Reuse the roster pager styles; `.rosterx` only supplies the --adst-* aliases.
import "../students/students.css";

const PAGE_SIZE = 50;
const SESSION_PAGE_SIZE = 20;
const BASE_PATH = "/admin/mentors";

// Two lists page independently on this page, so the pager is a small local
// component instead of a third copy of the same markup.
function Pager({ label, win, params, pageParam = "page" }) {
  if (win.outOfRange || win.pages <= 1) return null;
  return (
    <div className="rosterx">
      <nav className="adst-pager" aria-label={label}>
        {win.hasPrev ? (
          <Link href={pageHref(BASE_PATH, params, win.page - 1, pageParam)} prefetch={false} rel="prev" className="adst-pager-step">
            <ChevronLeft size={12} aria-hidden="true" /> Previous
          </Link>
        ) : (
          <span className="adst-pager-step is-disabled" aria-disabled="true">
            <ChevronLeft size={12} aria-hidden="true" /> Previous
            <span className="sr-only"> — already on the first page</span>
          </span>
        )}
        <p className="adst-pager-count">
          Showing <strong>{win.from}&ndash;{win.to}</strong> of {win.total}
          <span className="adst-pager-position" aria-current="page">Page {win.page} of {win.pages}</span>
        </p>
        {win.hasNext ? (
          <Link href={pageHref(BASE_PATH, params, win.page + 1, pageParam)} prefetch={false} rel="next" className="adst-pager-step">
            Next <ChevronRight size={12} aria-hidden="true" />
          </Link>
        ) : (
          <span className="adst-pager-step is-disabled" aria-disabled="true">
            Next <ChevronRight size={12} aria-hidden="true" />
            <span className="sr-only"> — already on the last page</span>
          </span>
        )}
      </nav>
    </div>
  );
}

export default async function AdminMentorsPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/mentors");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/mentors");
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) redirect("/login?redirect=/admin/mentors");
  const tid = tenant.id;
  const sp = await searchParams;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM mentors WHERE tenant_id = ${tid}::uuid) AS mentors,
      (SELECT COUNT(*)::int FROM mentors WHERE tenant_id = ${tid}::uuid AND available = true) AS available,
      (SELECT COUNT(*)::int FROM mentor_applications WHERE tenant_id = ${tid}::uuid AND status = 'pending') AS pending,
      (SELECT COUNT(*)::int FROM mentor_sessions s JOIN mentors m ON m.user_id = s.mentor_id WHERE m.tenant_id = ${tid}::uuid) AS sessions
  `;

  // Both totals already come from the tenant-scoped COUNTs above, so the page
  // windows need no extra round-trip. Roster and sessions page independently.
  const rosterWin = pageWindow(stats?.mentors ?? 0, sp?.page, PAGE_SIZE);
  const sessionWin = pageWindow(stats?.sessions ?? 0, sp?.sessionPage, SESSION_PAGE_SIZE);

  let mentors = [];
  if (rosterWin.total > 0 && !rosterWin.outOfRange) {
    mentors = await sql`
      SELECT m.*, p.name AS mentor_name, p.github_username,
             (SELECT COUNT(*)::int FROM mentor_sessions s WHERE s.mentor_id = m.user_id) AS session_count
      FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id
      WHERE m.tenant_id = ${tid}::uuid
      ORDER BY m.available DESC, m.created_at DESC, m.id DESC
      LIMIT ${PAGE_SIZE} OFFSET ${rosterWin.offset}
    `;
  }

  let sessions = [];
  if (sessionWin.total > 0 && !sessionWin.outOfRange) {
    sessions = await sql`
      SELECT s.*, pm.name AS mentor_name, ps.name AS student_name
      FROM mentor_sessions s
      LEFT JOIN mentors m ON m.user_id = s.mentor_id
      LEFT JOIN profiles pm ON pm.user_id = s.mentor_id
      LEFT JOIN profiles ps ON ps.user_id = s.student_id
      WHERE m.tenant_id = ${tid}::uuid
      ORDER BY s.created_at DESC, s.id DESC
      LIMIT ${SESSION_PAGE_SIZE} OFFSET ${sessionWin.offset}
    `;
  }

  const applications = await sql`
    SELECT a.*, p.name AS applicant_name, p.primary_domain, p.branch, p.year
    FROM mentor_applications a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    WHERE a.tenant_id = ${tid}::uuid
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
          {rosterWin.outOfRange ? (
            <WorkspaceEmpty
              title={`Page ${rosterWin.requestedPage} is past the end of this roster`}
              body={`${rosterWin.total} mentor${rosterWin.total === 1 ? "" : "s"} fit on ${rosterWin.pages} page${rosterWin.pages === 1 ? "" : "s"} at ${PAGE_SIZE} per page. Nothing is shown here rather than repeating another page's rows.`}
              action={
                <Link href={pageHref(BASE_PATH, { sessionPage: sp?.sessionPage }, rosterWin.pages)} prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
                  Go to the last page ({rosterWin.pages})
                </Link>
              }
            />
          ) : mentors.length === 0 ? (
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
          <Pager label="Mentor pages" win={rosterWin} params={{ sessionPage: sp?.sessionPage }} />
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Recent sessions" note="Newest first. Sessions appear once a student requests a mentor." action={<Clock3 size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />}>
          {sessionWin.outOfRange ? (
            <WorkspaceEmpty
              title={`Page ${sessionWin.requestedPage} is past the end of this log`}
              body={`${sessionWin.total} session${sessionWin.total === 1 ? "" : "s"} fit on ${sessionWin.pages} page${sessionWin.pages === 1 ? "" : "s"} at ${SESSION_PAGE_SIZE} per page. Nothing is shown here rather than repeating another page's rows.`}
              action={
                <Link href={pageHref(BASE_PATH, { page: sp?.page }, sessionWin.pages, "sessionPage")} prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
                  Go to the last page ({sessionWin.pages})
                </Link>
              }
            />
          ) : sessions.length === 0 ? (
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
          <Pager label="Session pages" win={sessionWin} params={{ page: sp?.page }} pageParam="sessionPage" />
        </WorkspaceSection>

        <div className="aled-split">
          <WorkspaceSection index="03" title="Add mentor" note="Search the roster, then promote a member. Prefer approving a candidacy below — it carries evidence.">
            <div className="aled-panel">
              <MentorPicker />
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
