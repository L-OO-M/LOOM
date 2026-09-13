import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { MentorRequestButton } from "@/components/actions";

export default async function MentorshipPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/mentorship");
  const { user, tenant, sql } = ctx;
  const mentors = await sql`
    SELECT m.*, p.name as mentor_name FROM mentors m
    LEFT JOIN profiles p ON p.user_id = m.user_id
    WHERE (m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) AND m.available = true
    ORDER BY m.created_at DESC LIMIT 50
  `;
  const sessions = await sql`
    SELECT s.*, p.name as mentor_name FROM mentor_sessions s
    LEFT JOIN profiles p ON p.user_id = s.mentor_id
    WHERE s.student_id = ${user.id}
    ORDER BY s.id DESC LIMIT 10
  `;
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Guidance" title="Mentorship" desc="Real mentors from your college. Requests persist and notify the mentor." />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="mb-3 text-sm font-medium" style={{ color: "var(--text)" }}>Available mentors ({mentors.length})</p>
            {mentors.length === 0 ? (
              <EmptyState title="No mentors yet" body="Your college has not added mentors. Ask an admin to add mentors from the admin workspace." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {mentors.map((m) => (
                  <div key={m.id} className="rounded-xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{m.mentor_name || "Mentor"}</p>
                    <p className="mt-1 text-xs" style={{ color: "var(--accent)" }}>{m.expertise || "General"}</p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{m.bio || "No bio."}</p>
                    <div className="mt-4"><MentorRequestButton mentorId={m.user_id} /></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Your sessions</p>
            <div className="mt-3 space-y-2">
              {sessions.map((s) => (
                <p key={s.id} className="text-xs" style={{ color: "var(--text-muted)" }}>{s.mentor_name || s.mentor_id} · {s.status}{s.scheduled_at ? ` · ${new Date(s.scheduled_at).toLocaleString("en-IN")}` : ""}</p>
              ))}
              {sessions.length === 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>No sessions requested.</p>}
            </div>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
