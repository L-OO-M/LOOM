import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { MentorForm } from "@/components/admin-forms";

export default async function AdminMentorsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/mentors");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/mentors");
  const { user, tenant, sql } = ctx;
  const mentors = await sql`SELECT m.*, p.name as mentor_name FROM mentors m LEFT JOIN profiles p ON p.user_id = m.user_id WHERE m.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY m.created_at DESC LIMIT 50`;
  const sessions = await sql`SELECT * FROM mentor_sessions ORDER BY id DESC LIMIT 20`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Guidance" title="Mentors" desc="Add mentors from enrolled students; sessions requested by students appear here." />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
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
      </main>
    </AppShell>
  );
}
