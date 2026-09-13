import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card } from "@/components/ui";
import RoleForm from "./RoleForm";

export default async function AdminStudentDetailPage({ params }) {
  const { id } = await params;
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect(`/login?redirect=/admin/students/${id}`);
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/students");
  const { user, tenant, sql } = ctx;
  const [s] = await sql`SELECT * FROM profiles WHERE user_id = ${id} AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL) LIMIT 1`;
  if (!s) notFound();
  const done = await sql`SELECT COUNT(*)::int AS c FROM student_roadmap_progress WHERE student_id = ${id} AND status = 'completed'`;
  const projects = await sql`SELECT * FROM projects WHERE owner_id = ${id} ORDER BY created_at DESC LIMIT 10`;
  const activity = await sql`SELECT * FROM student_daily_activity WHERE student_id = ${id} ORDER BY day DESC LIMIT 7`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}><Link href="/admin/students" style={{ color: "var(--accent)" }}>← Students</Link></p>
        <PageHeader kicker={s.role} title={s.name} desc={`${s.department || "—"} · Year ${s.year || "—"} · ${s.primary_domain || "no domain"}`} />
        <div className="grid gap-4">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Role management</p>
            <div className="mt-3"><RoleForm userId={s.user_id} currentRole={s.role} /></div>
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Progress</p>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{done[0]?.c ?? 0} nodes completed · {projects.length} projects · GitHub: {s.github_username || "not linked"}</p>
            <div className="mt-3 space-y-1">
              {activity.map((a) => <p key={a.day} className="text-xs" style={{ color: "var(--text-muted)" }}>{a.day}: {a.commits} commits, {a.pull_requests} PRs</p>)}
            </div>
          </Card>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Projects</p>
            {projects.map((p) => <p key={p.id} className="mt-1 truncate text-xs" style={{ color: "var(--text-muted)" }}>{p.title} · {p.status}</p>)}
            {projects.length === 0 && <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>No projects.</p>}
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
