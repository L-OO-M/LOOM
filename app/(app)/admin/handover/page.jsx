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
      (SELECT COUNT(*)::int FROM handover_checklists WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS total,
      (SELECT COUNT(*)::int FROM handover_checklists WHERE done = true AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS done
  `;

  const pct = (stats?.total ?? 0) > 0 ? Math.round(((stats?.done ?? 0) / (stats.total)) * 100) : 0;
  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Continuity · ${stats?.done ?? 0} of ${stats?.total ?? 0} transferred · ${pct}%`} title="Handover" desc="What the outgoing committee transfers — documents, contacts, ongoing projects. Check items off as they move; nothing tenure-critical lives in someone's head." />
        <div className="mb-6 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex items-center gap-3">
            <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><ClipboardCheck size={14} /></span>
            <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{stats?.done ?? 0} / {stats?.total ?? 0}</p><p className="meta">items transferred</p></div>
            <span className="ml-auto hidden items-center gap-1 text-xs sm:inline-flex" style={{ color: "var(--text-muted)" }}><Users size={12} /> Next committee</span>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "var(--success)" : "var(--accent)" }} />
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {["Finance","Members","Events","Mentors","Docs"].map((k,i) => {
              const done = (stats?.done ?? 0) > i;
              return (
                <span key={k} className="rounded-full border px-2 py-1 text-center text-[10px] font-bold tracking-widest" style={{ borderColor: done ? "var(--accent)" : "var(--line)", background: done ? "var(--accent)" : "transparent", color: done ? "#101314" : "var(--text-muted)" }}>{done ? "✓ " : "○ "}{k.toUpperCase()}</span>
              );
            })}
          </div>
          <p className="meta mt-2">{pct}% complete — process tracker, not task cards</p>
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
