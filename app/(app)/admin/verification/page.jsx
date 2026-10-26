import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Award, Users, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { BadgeForm, IssueForm } from "./AdminVerification";
import { TierDonut, WeeklyIssuanceBars } from "@/components/admin/RemainingCharts";
import "../_components/admin-ledger.css";

const TIER = ["", "Bronze", "Silver", "Gold"];
const TIER_TAG = { 1: "aled-tag--warn", 2: "", 3: "aled-tag--accent" };

export default async function AdminVerificationPage({ searchParams }) {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/verification");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/verification");
  const { tenant, user, sql } = ctx;
  const sp = await searchParams;
  const q = (sp?.q || "").trim();
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM skill_badges WHERE tenant_id = ${tid}::uuid) AS badges,
      (SELECT COUNT(*)::int FROM student_achievements WHERE tenant_id = ${tid}::uuid) AS issued,
      (SELECT COUNT(*)::int FROM verifiable_credentials WHERE tenant_id = ${tid}::uuid) AS links
  `;

  const badges = await sql`
    SELECT b.*, COALESCE(a.earned, 0)::int AS earned
    FROM skill_badges b
    LEFT JOIN (SELECT badge_id, COUNT(*)::int AS earned FROM student_achievements GROUP BY badge_id) a ON a.badge_id = b.id
    WHERE b.tenant_id = ${tid}::uuid
      AND (${q ? sql`(b.name ILIKE ${"%" + q + "%"})` : sql`TRUE`})
    ORDER BY b.tier DESC, b.name ASC LIMIT 50
  `;
  const students = await sql`
    SELECT user_id, name FROM profiles
    WHERE tenant_id = ${tid}::uuid AND role = 'student'
    ORDER BY name ASC LIMIT 200
  `;
  const recent = await sql`
    SELECT a.*, p.name AS student_name, b.name AS badge_name FROM student_achievements a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.tenant_id = ${tid}::uuid
    ORDER BY a.earned_at DESC LIMIT 30
  `;
  const tierRows = await sql`
    SELECT tier, COUNT(*)::int AS c FROM skill_badges
    WHERE tenant_id = ${tid}::uuid GROUP BY tier ORDER BY tier
  `;
  const weeklyRows = await sql`
    SELECT to_char(date_trunc('week', earned_at), 'Mon DD') AS label, COUNT(*)::int AS c
    FROM student_achievements WHERE tenant_id = ${tid}::uuid AND earned_at >= NOW() - INTERVAL '8 weeks'
    GROUP BY date_trunc('week', earned_at) ORDER BY date_trunc('week', earned_at) ASC
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Proof / ${stats?.badges ?? 0} badges / ${stats?.issued ?? 0} issued / ${stats?.links ?? 0} share links`}
          title="Verification console"
          lede="Define skill badges, issue achievements, and audit every grant — each issuance is verifiable and shareable."
          meta={`${recent.length} recent issuances in view / ${students.length} eligible students / every grant audited`}
          tone="ledger"
          art="/events/event-contest.png"
          artAlt=""
          stats={[
            { value: stats?.badges ?? 0, label: "badge definitions" },
            { value: stats?.issued ?? 0, label: "achievements issued" },
            { value: stats?.links ?? 0, label: "share links live" }
          ]}
        />

        <WorkspaceSection index="01" title="Issuance flow" note="Tier mix across badge definitions and the last eight weeks of issuance.">
          <div className="grid gap-4 lg:grid-cols-2">
            <TierDonut data={tierRows.map((r) => ({ name: TIER[Number(r.tier)] || `Tier ${r.tier}`, value: r.c }))} />
            <WeeklyIssuanceBars data={weeklyRows.map((r) => ({ label: r.label, value: r.c }))} />
          </div>
        </WorkspaceSection>

        <form method="get" className="aled-toolbar" role="search">
          <label className="aled-search">
            <Search size={14} style={{ color: "var(--text-muted)" }} aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Search badges…" aria-label="Search badges" />
          </label>
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <Link href="/admin/verification" prefetch={false} className="aled-meta" style={{ color: "var(--accent)" }}>Clear</Link>}
          <span className="aled-meta ml-auto hidden sm:block">{badges.length} badge definitions</span>
        </form>

        <div className="aled-split">
          <WorkspaceSection index="02" title="Badge definitions" note="Bronze, Silver, Gold — each badge becomes an achievement students can share." action={<span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><Award size={12} aria-hidden="true" /> {badges.length}</span>}>
            {badges.length === 0 ? (
              <WorkspaceEmpty title="No badges yet" body="Define the first badge — Bronze, Silver, Gold. Each badge becomes an achievement students can share." />
            ) : (
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
                {badges.map((b) => (
                  <li key={b.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <div className="aled-copy">
                      <span className="aled-title">
                        {b.name}
                        <span className={`aled-tag ${TIER_TAG[Number(b.tier)] || ""}`} style={{ marginLeft: "0.4rem" }}>{TIER[Number(b.tier)] || "—"}</span>
                      </span>
                      <p className="aled-sub">earned {b.earned}× · {b.description || "no description"}</p>
                    </div>
                    <span className="aled-meta">{b.id.slice(0, 6)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="aled-panel" style={{ marginTop: "1.4rem" }}>
              <p className="aled-panel-title">Define a badge</p>
              <div style={{ marginTop: "0.8rem" }}><BadgeForm /></div>
            </div>
          </WorkspaceSection>

          <WorkspaceSection index="03" title="Issue an achievement" note="Grant a badge to a student — the issuance is recorded, auditable, and immediately verifiable via /verify." action={<Users size={14} aria-hidden="true" style={{ color: "var(--text-muted)" }} />}>
            {students.length === 0 ? (
              <WorkspaceEmpty title="No students yet" body="No students in this chapter yet." />
            ) : (
              <div className="aled-panel"><IssueForm students={students} badges={badges} /></div>
            )}
          </WorkspaceSection>
        </div>

        <WorkspaceSection index="04" title="Verification audit" note="Latest 30 issuances across this chapter, newest first." action={<span className="aled-meta" style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}><ShieldCheck size={12} aria-hidden="true" /> {recent.length}</span>}>
          {recent.length === 0 ? (
            <WorkspaceEmpty title="Nothing issued yet" body="Issue the first achievement above — it appears here with badge, recipient, and level." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {recent.map((a) => (
                <li key={a.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{a.badge_name || `${a.source_type} · ${a.source_ref || "manual"}`}</span>
                    <p className="aled-sub">→ {a.student_name || a.student_id.slice(0, 8)}</p>
                  </div>
                  <div className="aled-actions">
                    <span className="aled-tag" style={{ textTransform: "capitalize" }}>{a.level}</span>
                    <span className="aled-meta">{new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
