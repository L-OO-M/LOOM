import { redirect } from "next/navigation";
import { ClipboardCheck, Users } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { HandoverBoard } from "@/app/(app)/admin/handover/_components/HandoverBoard";

export default async function AdminHandoverPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/handover");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/handover");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;
  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM handover_items WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS total,
      (SELECT COUNT(*)::int FROM handover_items WHERE done = true AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS done
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Continuity · ${stats?.done ?? 0} of ${stats?.total ?? 0} transferred`} title="Handover" desc="What the outgoing committee transfers — documents, contacts, ongoing projects. Check items off as they move; nothing tenure-critical lives in someone's head." />
        <div className="mb-6 flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><ClipboardCheck size={14} /></span>
          <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{stats?.done ?? 0} / {stats?.total ?? 0}</p><p className="meta">items transferred · check off live</p></div>
          <span className="ml-auto hidden items-center gap-1 text-xs sm:inline-flex" style={{ color: "var(--text-muted)" }}><Users size={12} /> Next committee</span>
        </div>
        <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Checklist">
          <Meta>Transfer checklist · audited on toggle</Meta>
          <div className="mt-3">
            <HandoverBoard />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
