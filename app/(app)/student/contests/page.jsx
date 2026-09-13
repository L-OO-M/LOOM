import { redirect } from "next/navigation";
import Link from "next/link";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, EmptyState } from "@/components/ui";

export default async function ContestsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/contests");
  const { user, tenant, sql } = ctx;
  const contests = await sql`
    SELECT * FROM contests WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL
    ORDER BY starts_at NULLS LAST, created_at DESC LIMIT 50
  `;
  const regs = await sql`SELECT contest_id FROM contest_registrations WHERE student_id = ${user.id}`;
  const regSet = new Set(regs.map((r) => r.contest_id));
  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Compete" title="Contests" desc="Real registrations persisted to your college workspace." />
        {contests.length === 0 ? (
          <EmptyState title="No contests yet" body="Your college has not published a contest. Check back soon." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {contests.map((c) => (
              <Link key={c.id} href={`/student/contests/${c.id}`} className="rounded-xl border p-5 transition hover:opacity-85" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{c.title}</p>
                <p className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>{c.description || "No description"}</p>
                <p className="mt-3 text-xs" style={{ color: regSet.has(c.id) ? "var(--accent)" : "var(--text-muted)" }}>
                  {c.status} {regSet.has(c.id) ? "· registered ✓" : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
