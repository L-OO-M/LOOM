import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, Users } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { HandoverBoard } from "@/app/(app)/admin/handover/_components/HandoverBoard";
import { HandoverApprovals } from "@/app/(app)/admin/handover/_components/HandoverApprovals";

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

  // Per-category progress, derived from the checklist rows themselves.
  // This used to render five hardcoded labels ("Finance/Members/Events/
  // Mentors/Docs") filled by comparing a single total against the array index
  // — which printed authoritative-looking committee status derived from nothing,
  // and used category names the form cannot even create.
  const byCategory = await sql`
    SELECT category, COUNT(*)::int AS total, COUNT(*) FILTER (WHERE done)::int AS done
    FROM handover_checklists
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    GROUP BY category
    ORDER BY category
  `;

  // Annual rotation: leaders whose term ends within 45 days, or already ended.
  // Founders are permanent and never appear here.
  const expiringTerms = await sql`
    SELECT p.user_id, p.name, p.role, p.role_term_end
    FROM profiles p
    LEFT JOIN platform_admins pa ON pa.user_id = p.user_id
    WHERE (p.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND p.role IN ('dept_lead', 'vertical_lead', 'admin')
      AND p.role_term_end IS NOT NULL
      AND p.role_term_end <= (CURRENT_DATE + INTERVAL '45 days')
      AND COALESCE(pa.is_founder, false) = false
    ORDER BY p.role_term_end ASC
    LIMIT 20
  `;

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
          <div className="mt-3 flex flex-wrap gap-2">
            {byCategory.length === 0 ? (
              <p className="meta">No checklist categories yet — add an item below and its progress will appear here.</p>
            ) : (
              byCategory.map((c) => {
                const complete = c.total > 0 && c.done === c.total;
                return (
                  <span key={c.category} title={`${c.done} of ${c.total} transferred`}
                    className="rounded-full border px-2 py-1 text-[10px] font-bold tracking-widest"
                    style={{ borderColor: complete ? "var(--accent)" : "var(--line)", background: complete ? "var(--accent)" : "transparent", color: complete ? "var(--bg)" : "var(--text-muted)" }}>
                    {complete ? "✓ " : "○ "}{c.category.toUpperCase()} {c.done}/{c.total}
                  </span>
                );
              })
            )}
          </div>
          <p className="meta mt-2">{pct}% complete — process tracker, not task cards</p>
        </div>
        <section className="mb-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Expiring leadership terms">
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}>
            <CalendarClock size={14} /> Terms ending soon
          </h2>
          <p className="narrative mt-1">Leadership rotates annually. Hand over before the date; an expired term loses its authority automatically.</p>
          {expiringTerms.length === 0 ? (
            <p className="narrative mt-3">No leadership terms end in the next 45 days.</p>
          ) : (
            <ul className="mt-3 divide-y rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              {expiringTerms.map((t) => {
                const days = Math.ceil((new Date(t.role_term_end) - new Date()) / 86400000);
                return (
                  <li key={t.user_id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                    <Link href={`/admin/students/${t.user_id}`} prefetch={false} className="font-medium hover:underline" style={{ color: "var(--text)" }}>
                      {t.name || t.user_id.slice(0, 8)}
                    </Link>
                    <span className="meta capitalize">{t.role.replace("_", " ")}</span>
                    <span className="font-mono text-xs" style={{ color: days < 0 ? "var(--danger)" : days <= 14 ? "var(--warning, #b45309)" : "var(--text-muted)" }}>
                      {days < 0 ? `ended ${Math.abs(days)}d ago` : days === 0 ? "ends today" : `ends in ${days}d`}
                      {" · "}{new Date(t.role_term_end).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="mb-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Leadership handover approvals">
          <Meta>Seat handovers · admin approval required</Meta>
          <p className="narrative mb-3 mt-1">A lead nominates a successor and files the brief. Approving moves the role, planner sessions and open event-ops in one transaction.</p>
          <HandoverApprovals />
        </section>
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
