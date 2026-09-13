import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { ContestForm } from "@/components/admin-forms";

export default async function AdminContestsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/contests");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/contests");
  const { user, tenant, sql } = ctx;
  const rows = await sql`SELECT c.*, (SELECT COUNT(*)::int FROM contest_registrations r WHERE r.contest_id = c.id) AS registrations FROM contests c WHERE c.tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL ORDER BY c.created_at DESC LIMIT 50`;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Compete" title="Contests" desc="Create contests, publish them, and track registrations." />
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-2">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{c.title}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{c.status} · {c.registrations} registrations · {c.starts_at ? new Date(c.starts_at).toLocaleString("en-IN") : "no start"}</p>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No contests yet.</p>}
          </div>
          <ContestForm />
        </div>
      </main>
    </AppShell>
  );
}
