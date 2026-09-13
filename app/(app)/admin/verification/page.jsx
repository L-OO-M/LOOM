import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat } from "@/components/ui";
import { BadgeForm, IssueForm } from "./AdminVerification";

export const dynamic = "force-dynamic";

const TIER = ["", "Bronze", "Silver", "Gold"];

export default async function AdminVerificationPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/verification");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/verification");
  const { tenant, user, sql } = ctx;

  const badges = await sql`
    SELECT b.*, (SELECT COUNT(*)::int FROM student_achievements a WHERE a.badge_id = b.id) AS earned
    FROM skill_badges b
    WHERE b.tenant_id IS NULL OR b.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY b.tier DESC LIMIT 50
  `;
  const students = await sql`
    SELECT user_id, name FROM profiles
    WHERE tenant_id = ${tenant?.id ?? null}::uuid AND role = 'student'
    ORDER BY name ASC LIMIT 200
  `;
  const recent = await sql`
    SELECT a.*, p.name AS student_name, b.name AS badge_name FROM student_achievements a
    LEFT JOIN profiles p ON p.user_id = a.student_id
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.tenant_id IS NULL OR a.tenant_id = ${tenant?.id ?? null}::uuid
    ORDER BY a.earned_at DESC LIMIT 30
  `;
  const [{ links = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS links FROM verifiable_credentials
    WHERE tenant_id = ${tenant?.id ?? null}::uuid
  `;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Admin · Proof" title="Verification console" desc="Define skill badges, issue achievements, and audit what was earned." />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Badge definitions" value={badges.length} />
          <Stat label="Achievements issued" value={recent.length >= 30 ? "30+" : recent.length} />
          <Stat label="Share links live" value={links} />
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Badge definitions</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {badges.map((b) => (
                <li key={b.id} className="flex justify-between gap-2">
                  <span style={{ color: "var(--text)" }}>{b.name} <span style={{ color: "var(--text-muted)" }}>· {TIER[b.tier]} · earned {b.earned}×</span></span>
                </li>
              ))}
              {badges.length === 0 && <li className="text-sm" style={{ color: "var(--text-muted)" }}>No badges defined yet.</li>}
            </ul>
            <h3 className="mt-6 font-medium" style={{ color: "var(--text)" }}>Define a badge</h3>
            <BadgeForm />
          </Card>

          <Card>
            <h2 className="font-medium" style={{ color: "var(--text)" }}>Issue an achievement</h2>
            {students.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>No students in this chapter yet.</p>
            ) : (
              <IssueForm students={students} badges={badges} />
            )}
          </Card>
        </div>

        <Card className="mt-6">
          <h2 className="font-medium" style={{ color: "var(--text)" }}>Verification audit — latest issued</h2>
          {recent.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Nothing issued yet.</p>
          ) : (
            <ul className="mt-3 space-y-1 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-2">
                  <span style={{ color: "var(--text)" }}>{a.badge_name || `${a.source_type} · ${a.source_ref || "manual"}`} <span style={{ color: "var(--text-muted)" }}>→ {a.student_name || a.student_id}</span></span>
                  <span className="capitalize" style={{ color: "var(--text-muted)" }}>{a.level} · {new Date(a.earned_at).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </main>
    </AppShell>
  );
}
