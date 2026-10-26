import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ClipboardCheck, Users } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { HandoverBoard } from "@/app/(app)/admin/handover/_components/HandoverBoard";
import { HandoverApprovals } from "@/app/(app)/admin/handover/_components/HandoverApprovals";
import "../_components/admin-ledger.css";

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
        <WorkspaceMasthead
          kicker={`Continuity / ${stats?.done ?? 0} of ${stats?.total ?? 0} transferred / ${pct}%`}
          title="Handover"
          lede="What the outgoing committee transfers — documents, contacts, ongoing projects. Check items off as they move; nothing tenure-critical lives in someone's head."
          meta={`${byCategory.length} checklist categories / ${expiringTerms.length} terms ending within 45 days`}
          tone="field"
          art="/storyloom/mentorship.png"
          artAlt=""
          stats={[
            { value: stats?.done ?? 0, label: "items transferred" },
            { value: stats?.total ?? 0, label: "items on checklist" },
            { value: pct, unit: "%", label: "complete" },
            { value: expiringTerms.length, label: "terms ending soon" }
          ]}
        />

        <WorkspaceSection index="01" title="Transfer progress" note="A process tracker, not task cards — category bars come straight from the checklist rows.">
          <div className="aled-panel">
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span className="aled-tag"><ClipboardCheck size={12} aria-hidden="true" /> {stats?.done ?? 0} / {stats?.total ?? 0}</span>
              <span className="aled-meta">items transferred</span>
              <span className="aled-meta" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <Users size={12} aria-hidden="true" /> Next committee
              </span>
            </div>
            <span className="aled-meter" style={{ width: "100%", marginTop: "0.9rem" }} aria-hidden="true">
              <span style={{ width: `${pct}%`, background: pct === 100 ? "var(--success)" : "var(--accent)" }} />
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.9rem" }}>
              {byCategory.length === 0 ? (
                <p className="aled-sub" style={{ margin: 0 }}>No checklist categories yet — add an item below and its progress will appear here.</p>
              ) : (
                byCategory.map((c) => {
                  const complete = c.total > 0 && c.done === c.total;
                  return (
                    <span key={c.category} title={`${c.done} of ${c.total} transferred`} className={`aled-tag ${complete ? "aled-tag--accent" : ""}`}>
                      {complete ? "✓ " : "○ "}{c.category.toUpperCase()} {c.done}/{c.total}
                    </span>
                  );
                })
              )}
            </div>
            <p className="aled-meta" style={{ marginTop: "0.7rem" }}>{pct}% complete — process tracker, not task cards</p>
          </div>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Terms ending soon" note="Leadership rotates annually. Hand over before the date; an expired term loses its authority automatically." action={<CalendarClock size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />}>
          {expiringTerms.length === 0 ? (
            <WorkspaceEmpty title="No leadership terms ending" body="No leadership terms end in the next 45 days." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {expiringTerms.map((t) => {
                const days = Math.ceil((new Date(t.role_term_end) - new Date()) / 86400000);
                return (
                  <li key={t.user_id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <div className="aled-copy">
                      <Link href={`/admin/students/${t.user_id}`} prefetch={false} className="aled-title">
                        {t.name || t.user_id.slice(0, 8)}
                      </Link>
                      <p className="aled-sub" style={{ textTransform: "capitalize" }}>{t.role.replace("_", " ")}</p>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span className={`aled-tag ${days < 0 ? "aled-tag--danger" : days <= 14 ? "aled-tag--warn" : ""}`}>
                        {days < 0 ? `ended ${Math.abs(days)}d ago` : days === 0 ? "ends today" : `ends in ${days}d`}
                      </span>
                      <p className="aled-meta" style={{ marginTop: "0.3rem" }}>
                        {new Date(t.role_term_end).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection index="03" title="Seat handovers" note="A lead nominates a successor and files the brief. Approving moves the role, planner sessions and open event-ops in one transaction. Admin approval required.">
          <HandoverApprovals />
        </WorkspaceSection>

        <WorkspaceSection index="04" title="Transfer checklist" note="Audited on toggle. Add an item and its category progress appears above.">
          <HandoverBoard />
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
