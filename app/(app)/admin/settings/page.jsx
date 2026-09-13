import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";

export default async function AdminSettingsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/settings");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/settings");
  const { user, tenant, sql } = ctx;
  const [students] = await sql`SELECT COUNT(*)::int AS c FROM profiles WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL`;
  const [projects] = await sql`SELECT COUNT(*)::int AS c FROM projects WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL`;
  const [contests] = await sql`SELECT COUNT(*)::int AS c FROM contests WHERE tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL`;
  const domains = tenant ? await sql`SELECT * FROM tenant_domains WHERE tenant_id = ${tenant.id}` : [];
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader kicker="College" title="Settings" desc="Tenant identity, access rules, and honest integration status." />
        <div className="grid gap-4">
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{tenant?.name} · {tenant?.slug}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Status: {tenant?.status} · Domains: {domains.map((d) => d.domain).join(", ") || "—"}</p>
          </Card>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Students" value={students?.c ?? 0} />
            <Stat label="Projects" value={projects?.c ?? 0} />
            <Stat label="Contests" value={contests?.c ?? 0} />
          </div>
          <Card>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>Integrations</p>
            <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              GitHub App OAuth: not configured (username linking + webhooks live) · QStash: {process.env.QSTASH_TOKEN ? "configured" : "not configured — jobs run inline"} · Redis/R2/Realtime: not configured — pages show real DB state with honest unavailable notes.
            </p>
          </Card>
        </div>
      </main>
    </AppShell>
  );
}
