import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { env } from "@/lib/env";
import { Display, Meta, PlainStat } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { DataTable } from "@/components/loom/DataTable";
import { OnboardingState } from "@/components/loom/States";
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
  const views = credentials.reduce((n, c) => n + (c.view_count || 0), 0);

  if (achievements.length === 0) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="mx-auto max-w-4xl px-4 sm:px-6">
          <OnboardingState
            eyebrow="Proof · portable credentials"
            title="Nothing to show — yet."
            why="Proof is issued for real work: merged pull requests, contest placements, roadmap milestones your chapter verifies. Each piece becomes a signed link any recruiter can check, no login required."
            steps={[
              { title: "Merge a PR", body: "Claim it in the open-source portal; verification is automatic." },
              { title: "Place in a challenge", body: "Contests with deadlines produce the sharpest proof." },
              { title: "Finish the path", body: "Roadmap milestones compound into chapter-issued achievements." }
            ]}
            action={<Link href="/student/opensource" className="btn-ink">Start with open source →</Link>}
          />
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Meta>Prove · credentials that travel</Meta>
        <Display size="lg" className="mt-3">
          {profile?.name || "Student"},<br /><em>documented.</em>
        </Display>
        <p className="narrative mt-4">
          {tenant?.name || "Your chapter"} vouches for {achievements.length} achievement{achievements.length === 1 ? "" : "s"}.
          Every share link below is signed — verifiable by anyone, without an account.
        </p>

        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          <PlainStat value={achievements.length} unit="issued" label="achievements on your record" />
          <PlainStat value={credentials.length} unit="links" label="signed share links in the wild" />
          <PlainStat value={views} unit="views" label="recruiters checking your proof" />
        </div>

        <section className="mt-12" aria-label="Achievements">
          <Meta>The record</Meta>
          <Timeline className="mt-5">
            {achievements.map((a) => (
              <TimelineItem
                key={a.id}
                state="done"
                title={labelFor(a)}
                meta={new Date(a.earned_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                body={`${a.level} · ${a.source_type}`}
                action={
                  <span className="flex flex-wrap items-center gap-3">
                    <ShareLinkButton achievementId={a.id} existingUrl={linkFor.get(a.id) || ""} />
                    {a.evidence_url && <a href={a.evidence_url} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Evidence ↗</a>}
                  </span>
                }
              />
            ))}
          </Timeline>
        </section>

        {credentials.length > 0 && (
          <section className="mt-12" aria-label="Share links">
            <Meta>Out in the world</Meta>
            <div className="mt-4 border-y" style={{ borderColor: "var(--line)" }}>
              <DataTable
                caption="Signed credential share links"
                columns={[
                  { key: "title", label: "Credential", render: (c) => <span className="font-medium">{c.title}</span> },
                  { key: "view_count", label: "Views", mono: true, align: "right", render: (c) => c.view_count || 0 },
                  {
                    key: "link", label: "Link", align: "right", render: (c) => (
                      <a href={`/verify/credential/${c.id}`} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                        Open →
                      </a>
                    )
                  }
                ]}
                rows={credentials}
              />
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}
