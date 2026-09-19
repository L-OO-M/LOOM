import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Award, Users, Link2, Search } from "lucide-react";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { BadgeForm, IssueForm } from "./AdminVerification";
import { TierDonut, WeeklyIssuanceBars } from "@/components/admin/RemainingCharts";

const TIER = ["", "Bronze", "Silver", "Gold"];
function tierTone(t) {
  const m = {
    1: { bg: "color-mix(in srgb, #cd7f32 14%, var(--bg))", color: "#92400e", label: "Bronze" },
    2: { bg: "color-mix(in srgb, #9ca3af 14%, var(--bg))", color: "#4b5563", label: "Silver" },
    3: { bg: "color-mix(in srgb, #f59e0b 14%, var(--bg))", color: "#b45309", label: "Gold" },
  };
  return m[t] || { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "—" };
}

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
      (SELECT COUNT(*)::int FROM skill_badges WHERE tenant_id IS NULL OR tenant_id = ${tid}::uuid) AS badges,
      (SELECT COUNT(*)::int FROM student_achievements WHERE tenant_id IS NULL OR tenant_id = ${tid}::uuid) AS issued,
      (SELECT COUNT(*)::int FROM verifiable_credentials WHERE tenant_id = ${tid}::uuid) AS links
  `;

  const badges = await sql`
    SELECT b.*, COALESCE(a.earned, 0)::int AS earned
    FROM skill_badges b
    LEFT JOIN (SELECT badge_id, COUNT(*)::int AS earned FROM student_achievements GROUP BY badge_id) a ON a.badge_id = b.id
    WHERE (b.tenant_id IS NULL OR b.tenant_id = ${tid}::uuid)
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
    WHERE a.tenant_id IS NULL OR a.tenant_id = ${tid}::uuid
    ORDER BY a.earned_at DESC LIMIT 30
  `;
  const tierRows = await sql`
    SELECT tier, COUNT(*)::int AS c FROM skill_badges
    WHERE tenant_id IS NULL OR tenant_id = ${tid}::uuid GROUP BY tier ORDER BY tier
  `;
  const weeklyRows = await sql`
    SELECT to_char(date_trunc('week', earned_at), 'Mon DD') AS label, COUNT(*)::int AS c
    FROM student_achievements WHERE (tenant_id IS NULL OR tenant_id = ${tid}::uuid) AND earned_at >= NOW() - INTERVAL '8 weeks'
    GROUP BY date_trunc('week', earned_at) ORDER BY date_trunc('week', earned_at) ASC
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Proof · ${stats?.badges ?? 0} badges · ${stats?.issued ?? 0} issued · ${stats?.links ?? 0} share links`} title="Verification console" desc="Define skill badges, issue achievements, and audit every grant — each issuance is verifiable and shareable." />

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Badge definitions", value: stats?.badges ?? 0, icon: Award, sub: "tiers" },
            { label: "Achievements issued", value: stats?.issued ?? 0, icon: ShieldCheck, sub: "all time" },
            { label: "Share links live", value: stats?.links ?? 0, icon: Link2, sub: "verifiable" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <section className="grid gap-4 lg:grid-cols-2" aria-label="Verification visuals">
          <TierDonut data={tierRows.map((r) => ({ name: TIER[Number(r.tier)] || `Tier ${r.tier}`, value: r.c }))} />
          <WeeklyIssuanceBars data={weeklyRows.map((r) => ({ label: r.label, value: r.c }))} />
        </section>

        <form method="get" className="mb-4 flex items-center gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} role="search">
          <Search size={14} style={{ color: "var(--text-muted)" }} />
          <input name="q" defaultValue={q} placeholder="Search badges…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
          <button className="btn-ink !py-1.5 text-xs">Search</button>
          {q && <Link href="/admin/verification" prefetch={false} className="text-xs font-medium hover:underline" style={{ color: "var(--accent)" }}>Clear</Link>}
        </form>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Award size={14} /> Badge definitions · {badges.length}</h2>
            {badges.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="text-sm font-medium" style={{ color: "var(--text)" }}>No badges yet</p>
                <p className="narrative mx-auto mt-2 max-w-md">Define the first badge — Bronze, Silver, Gold. Each badge becomes an achievement students can share.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2">
                {badges.map((b) => {
                  const tone = tierTone(b.tier);
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{b.name}</span>
                          <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-medium" style={{ background: tone.bg, color: tone.color, borderColor: "var(--line)" }}>{tone.label}</span>
                        </span>
                        <span className="meta">earned {b.earned}× · {b.description || "no description"}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs" style={{ color: "var(--text-muted)" }}>{b.id.slice(0, 6)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <h3 className="mt-6 text-sm font-semibold" style={{ color: "var(--text)" }}>Define a badge</h3>
            <div className="mt-3"><BadgeForm /></div>
          </section>

          <section className="rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><Users size={14} /> Issue an achievement</h2>
            <p className="narrative mt-1">Grant a badge to a student — the issuance is recorded, auditable, and immediately verifiable via /verify.</p>
            {students.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}>No students in this chapter yet.</p>
            ) : (
              <div className="mt-4"><IssueForm students={students} badges={badges} /></div>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-2xl border p-6" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <h2 className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text)" }}><ShieldCheck size={14} /> Verification audit · latest 30</h2>
          {recent.length === 0 ? (
            <p className="narrative mt-3">Nothing issued yet. Issue the first achievement above — it appears here with badge, recipient, and level.</p>
          ) : (
            <ul className="mt-4 divide-y overflow-hidden rounded-xl border" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              {recent.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-sm">
                  <span className="min-w-0 truncate" style={{ color: "var(--text)" }}>
                    <span className="font-medium">{a.badge_name || `${a.source_type} · ${a.source_ref || "manual"}`}</span>
                    <span style={{ color: "var(--text-muted)" }}> → {a.student_name || a.student_id.slice(0, 8)}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 shrink-0">
                    <span className="rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>{a.level}</span>
                    <span className="meta">{new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
