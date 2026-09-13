import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Card, Stat, EmptyState } from "@/components/ui";
import { env } from "@/lib/env";
import ShareLinkButton from "./ShareLinkButton";

export const dynamic = "force-dynamic";

function labelFor(a) {
  if (a.badge_name) return a.badge_name;
  if (a.source_type === "oss") return `OSS · ${a.source_ref}`;
  if (a.source_type === "contest") return `Contest · ${a.source_ref}`;
  if (a.source_type === "roadmap") return `Roadmap · ${a.source_ref}`;
  return "Achievement";
}

export default async function CredentialsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/credentials");
  const { user, tenant, profile, sql } = ctx;

  const achievements = await sql`
    SELECT a.*, b.name AS badge_name, b.tier FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${user.id}
    ORDER BY a.earned_at DESC LIMIT 100
  `;
  const credentials = await sql`
    SELECT * FROM verifiable_credentials WHERE student_id = ${user.id}
    ORDER BY issued_at DESC LIMIT 100
  `;
  const linkFor = new Map(credentials.map((c) => [c.achievement_id, `${env.NEXT_PUBLIC_APP_URL}/verify/credential/${c.id}`]));

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader
          kicker="Proof of skill"
          title="Credentials"
          desc="Achievements your chapter issued you — plus signed share links any recruiter can verify."
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Achievements" value={achievements.length} />
          <Stat label="Share links" value={credentials.length} />
          <Stat label="Link views" value={credentials.reduce((n, c) => n + (c.view_count || 0), 0)} />
        </div>

        {/* Portable skill card */}
        <Card className="mt-6">
          <h2 className="font-medium" style={{ color: "var(--text)" }}>Skill card — {profile?.name || "Student"}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {tenant?.name || "L.O.O.M."} · {achievements.length} verified achievement{achievements.length === 1 ? "" : "s"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {achievements.slice(0, 12).map((a) => (
              <span key={a.id} className="rounded-full border px-3 py-1 text-xs font-medium capitalize" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
                {labelFor(a)} · {a.level}
              </span>
            ))}
            {achievements.length === 0 && <span className="text-sm" style={{ color: "var(--text-muted)" }}>Earn OSS badges, win contests, or ask your chapter for an achievement.</span>}
          </div>
        </Card>

        <h2 className="mt-8 font-medium" style={{ color: "var(--text)" }}>All achievements</h2>
        {achievements.length === 0 ? (
          <div className="mt-4"><EmptyState title="No achievements yet" body="Merge a PR in a tracked OSS repo, place in a contest, or complete roadmap milestones." action={null} /></div>
        ) : (
          <ul className="mt-4 space-y-3">
            {achievements.map((a) => (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium" style={{ color: "var(--text)" }}>{labelFor(a)}</p>
                      <p className="mt-1 text-xs capitalize" style={{ color: "var(--text-muted)" }}>
                        {a.level} · {a.source_type} · earned {new Date(a.earned_at).toLocaleDateString()}
                        {a.evidence_url && <> · <a href={a.evidence_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>evidence ↗</a></>}
                      </p>
                    </div>
                    <ShareLinkButton achievementId={a.id} existingUrl={linkFor.get(a.id) || ""} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
