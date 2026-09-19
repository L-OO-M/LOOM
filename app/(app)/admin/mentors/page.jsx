import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Clock3, Award, MessageCircle, Inbox, Check, X, Search, Sparkles } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { MentorForm } from "@/components/admin-forms";
import { ReviewButtons } from "./ReviewButtons";

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

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader
          kicker={`Guidance · ${stats?.mentors ?? 0} mentors · ${pending.length} candidacies pending`}
          title="Mentors"
          desc="Review candidacies on evidence, manage the roster, and track sessions. Mentorship is a capability, not a role."
        />

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Mentors", value: stats?.mentors ?? 0, icon: Users, sub: `${stats?.available ?? 0} available` },
            { label: "Pending", value: pending.length, icon: Inbox, sub: "awaiting review" },
            { label: "Sessions", value: stats?.sessions ?? 0, icon: MessageCircle, sub: "all time" },
            { label: "Capacity", value: stats?.available ? `${Math.round(((stats?.mentors ?? 0) ? (stats.available / stats.mentors) * 100 : 0))}%` : "—", icon: Sparkles, sub: "available ratio" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: s.label === "Pending" && pending.length > 0 ? "var(--accent)" : "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          {/* Roster */}
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex items-baseline justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Users size={14} /> Roster · {mentors.length}</h2>
              <Link href="/admin/students" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Find students →</Link>
            </div>

            {mentors.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No mentors yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Add a mentor from an enrolled student, or approve a candidacy below. Mentors guide juniors — they don&apos;t replace Heads.</p>
              </div>
            ) : (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {mentors.map((m) => (
                  <li key={m.id} className="group flex items-start gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text)" }}>{(m.mentor_name || m.user_id).slice(0, 2).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{m.mentor_name || m.user_id}</p>
                      <p className="meta truncate">{m.expertise || "General"} · {m.github_username ? `@${m.github_username}` : m.user_id.slice(0, 8)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: m.available ? "color-mix(in srgb, #16a34a 18%, transparent)" : "var(--line)", background: m.available ? "color-mix(in srgb, #16a34a 10%, var(--bg))" : "var(--bg-elevated)", color: m.available ? "#16a34a" : "var(--text-muted)" }}>
                          {m.available ? <Check size={10} /> : <X size={10} />} {m.available ? "Available" : "Paused"}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}><MessageCircle size={10} /> {m.session_count ?? 0} sessions</span>
                      </div>
                      {m.bio && <p className="narrative mt-2 line-clamp-2 text-xs leading-5">{m.bio}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="mt-8 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Clock3 size={14} /> Recent sessions</h3>
            {sessions.length === 0 ? (
              <p className="narrative mt-2">No sessions yet. They appear once a student requests a mentor.</p>
            ) : (
              <ul className="mt-3 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                {sessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <span className="min-w-0 truncate" style={{ color: "var(--text)" }}><span className="font-medium">{s.student_name || s.student_id.slice(0, 8)}</span> <span style={{ color: "var(--text-muted)" }}>→ {s.mentor_name || s.mentor_id.slice(0, 8)}</span></span>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Create */}
          <div className="space-y-6">
            <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Add mentor</h2>
              <p className="narrative mt-1">Promotes a student to mentor. Prefer approving a candidacy below — it carries evidence.</p>
              <div className="mt-4"><MentorForm /></div>
              <p className="meta mt-3">Tip: copy <span className="font-mono">user_id</span> from the Students roster.</p>
            </section>

            <div className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>How candidacies work</p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
                <li className="flex gap-1.5"><Award size={12} className="mt-0.5 shrink-0" /> Eligibility is computed from path %, merges, solutions, projects.</li>
                <li className="flex gap-1.5"><Check size={12} className="mt-0.5 shrink-0" /> Approval creates a mentor row immediately.</li>
                <li className="flex gap-1.5"><MessageCircle size={12} className="mt-0.5 shrink-0" /> Declines notify the applicant.</li>
              </ul>
            </div>
          </div>
        </div>

        <section className="mt-8 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Mentor applications">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Inbox size={14} /> Candidacies · {pending.length} awaiting review</h2>
            <span className="meta">{applications.length} total · pending first</span>
          </div>

          {applications.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No applications yet</p>
              <p className="narrative mx-auto mt-2 max-w-md">When students prove themselves, their candidacies land here with the evidence attached — path completion, merges, and projects at the time of application.</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {applications.map((a) => {
                const el = a.eligibility || {};
                const st = el.stats || {};
                const pct = typeof st.pct === "number" ? st.pct : null;
                return (
                  <div key={a.id} className="rounded-2xl border p-4 transition hover:shadow-sm" style={{ borderColor: a.status === "pending" ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--line)", background: a.status === "pending" ? "color-mix(in srgb, var(--accent) 4%, var(--bg-elevated))" : "var(--bg-elevated)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium" style={{ color: "var(--text)" }}>
                          {a.applicant_name || a.student_id}
                          <span className="inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-xs capitalize" style={{ borderColor: a.status === "pending" ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--line)", background: a.status === "pending" ? "color-mix(in srgb, var(--accent) 10%, var(--bg))" : "var(--bg)", color: a.status === "pending" ? "var(--accent)" : "var(--text-muted)" }}>{a.status}</span>
                          <span className="meta">{a.primary_domain || "—"} {a.branch ? `· ${a.branch}` : ""} {a.year ? `· Year ${a.year}` : ""}</span>
                        </p>
                        <p className="meta mt-0.5">{new Date(a.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })} · {a.student_id.slice(0, 8)}</p>
                      </div>
                      {a.status === "pending" && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: "var(--accent)", color: "white" }}><Inbox size={12} /> Needs review</span>}
                    </div>

                    {a.expertise && <p className="mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--accent)" }}>{a.expertise}</p>}
                    {a.statement && <p className="mt-2 rounded-xl border p-3 text-sm leading-6" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" }}>“{a.statement}”</p>}

                    <div className="mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                      <div><p className="meta">Path</p><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{pct != null ? `${pct}%` : "—"}</p>{pct != null && <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--line)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: "var(--accent)" }} /></div>}</div>
                      <div><p className="meta">Merges</p><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{st.oss ?? 0}</p></div>
                      <div><p className="meta">Solutions</p><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{st.solutions ?? 0}</p></div>
                      <div><p className="meta">Projects</p><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{st.projects ?? 0}</p></div>
                    </div>

                    {a.status === "pending" && <div className="mt-3"><ReviewButtons applicationId={a.id} /></div>}
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
