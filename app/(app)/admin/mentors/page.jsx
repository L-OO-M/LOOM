import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Stat } from "@/components/ui";
import { MentorForm } from "@/components/admin-forms";
import { ReviewButtons } from "./ReviewButtons";

export default async function AdminMentorsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/mentors");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/mentors");
  const { user, tenant, sql } = ctx;
  const mentors = await sql`SELECT m.*, p.name as mentor_name FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id WHERE m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY m.created_at DESC LIMIT 50`;
  const sessions = await sql`SELECT * FROM mentor_sessions ORDER BY id DESC LIMIT 20`;
  const [mstats] = await sql`
    SELECT (SELECT COUNT(*)::int FROM mentor_sessions WHERE status = 'requested') AS pending,
           (SELECT COUNT(*)::int FROM mentor_sessions WHERE status = 'scheduled') AS upcoming,
           (SELECT COUNT(*)::int FROM mentor_sessions WHERE status = 'completed') AS completed,
           (SELECT COALESCE(AVG(rating),0)::numeric FROM mentor_reviews) AS rating
  `;
  const applications = await sql`
    SELECT a.*, p.name AS applicant_name FROM mentor_applications a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    WHERE a.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY CASE WHEN a.status = 'pending' THEN 0 ELSE 1 END, a.created_at DESC
    LIMIT 20
  `;
  const pending = applications.filter((a) => a.status === "pending");
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Guidance" title="Mentors" desc="Add mentors from enrolled students; sessions requested by students appear here." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pending requests" value={mstats?.pending ?? 0} />
          <Stat label="Scheduled" value={mstats?.upcoming ?? 0} />
          <Stat label="Completed" value={mstats?.completed ?? 0} />
          <Stat label="Avg rating" value={Number(mstats?.rating ?? 0).toFixed(1)} />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {mentors.map((m) => (
              <div key={m.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.mentor_name || m.user_id}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{m.expertise || "General"} · {m.available ? "available" : "paused"}</p>
              </div>
            ))}
            {mentors.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No mentors yet.</p>}
            <p className="mt-4 text-sm font-medium" style={{ color: "var(--text)" }}>Recent sessions</p>
            {sessions.map((s) => (
              <p key={s.id} className="text-xs" style={{ color: "var(--text-muted)" }}>{s.student_id} → {s.mentor_id} · {s.status}</p>
            ))}
          </div>
          <MentorForm />
        </div>

        <section className="mt-10" aria-label="Mentor applications">
          <div className="flex items-baseline justify-between">
            <p className="meta">Candidacies · {pending.length} awaiting review</p>
          </div>
          {applications.length === 0 ? (
            <p className="narrative mt-3">No applications yet. When students prove themselves, their candidacies land here with the evidence attached.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {applications.map((a) => {
                const el = a.eligibility || {};
                const st = el.stats || {};
                return (
                  <div key={a.id} className="rounded-xl border p-4" style={{ borderColor: a.status === "pending" ? "var(--accent)" : "var(--line)", background: "var(--bg-elevated)" }}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                        {a.applicant_name || a.student_id}
                        <span className="ml-2 font-mono text-xs" style={{ color: a.status === "pending" ? "var(--accent)" : "var(--text-muted)" }}>{a.status}</span>
                      </p>
                      <span className="meta">{new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                    </div>
                    {a.expertise && <p className="mt-1 text-xs font-medium" style={{ color: "var(--accent)" }}>{a.expertise}</p>}
                    {a.statement && <p className="mt-1.5 text-sm leading-6" style={{ color: "var(--text-muted)" }}>“{a.statement}”</p>}
                    <p className="meta mt-2">
                      evidence at application · {st.pct ?? "?"}% path · {st.oss ?? 0} merges · {st.solutions ?? 0} solutions · {st.projects ?? 0} projects
                    </p>
                    {a.status === "pending" && (
                      <div className="mt-3"><ReviewButtons applicationId={a.id} /></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
