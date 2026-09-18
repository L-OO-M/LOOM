import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { env } from "@/lib/env";
import { Display, Meta, PlainStat, ActionLink } from "@/components/loom/primitives";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { DataTable } from "@/components/loom/DataTable";
import { OnboardingState } from "@/components/loom/States";
import { Reveal } from "@/components/motion/Reveal";
import ProofRecord from "./ProofRecord";
import {
  labelFor,
  sourceKey,
  sourceLabel,
  levelLabel,
  groupLinksByAchievement,
  linksFor,
  nextMilestone,
  formatShortDate
} from "./proof-format";

export const dynamic = "force-dynamic";

function shortRepo(url) {
  if (!url) return "";
  return String(url).replace("https://github.com/", "").replace(/\/$/, "");
}

export default async function CredentialsPage() {
  const ctx = await getRequestContext();
  if (ctx.error) redirect("/login?redirect=/student/credentials");
  const { user, tenant, profile, sql } = ctx;
  const issuer = tenant?.name || "Your chapter";

  const achievements = await sql`
    SELECT a.*, b.name AS badge_name, b.tier FROM student_achievements a
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE a.student_id = ${user.id}
    ORDER BY a.earned_at DESC LIMIT 100
  `;
  const credentials = await sql`
    SELECT v.*, a.source_type, a.source_ref, a.level AS achievement_level, b.name AS badge_name, b.tier
    FROM verifiable_credentials v
    LEFT JOIN student_achievements a ON a.id = v.achievement_id
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE v.student_id = ${user.id}
    ORDER BY v.issued_at DESC LIMIT 100
  `;
  const pending = await sql`
    SELECT id, title, pr_url, repo_url, pr_number, contribution_type, created_at
    FROM student_oss_contributions
    WHERE student_id = ${user.id} AND status = 'claimed'
    ORDER BY created_at DESC LIMIT 20
  `;
  const [{ nodes = 0 } = {}] = await sql`SELECT COUNT(*)::int AS nodes FROM roadmap_nodes`;
  const [{ done = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS done FROM student_roadmap_progress
    WHERE student_id = ${user.id} AND status = 'completed'
  `;

  const views = credentials.reduce((n, c) => n + (c.view_count || 0), 0);
  const groups = groupLinksByAchievement(credentials);
  const appUrl = env.NEXT_PUBLIC_APP_URL;

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
            action={<Link href="/student/opensource" prefetch={false} className="btn-ink">Start with open source →</Link>}
          />
        </main>
      </AppShell>
    );
  }

  // Records carry everything the client island needs — plain and serializable.
  const records = achievements.map((a) => ({
    id: a.id,
    title: labelFor(a),
    sourceKey: sourceKey(a),
    sourceLabel: sourceLabel(a),
    sourceDetail: sourceDetailFor(a),
    levelLabel: levelLabel(a.level),
    tier: a.tier ?? null,
    earnedAt: a.earned_at ? new Date(a.earned_at).toISOString() : null,
    evidenceUrl: a.evidence_url || null,
    links: linksFor(groups, a.id).map((c) => ({
      url: `${appUrl}/verify/credential/${c.id}`,
      issuedAt: c.issued_at ? new Date(c.issued_at).toISOString() : null,
      expiresAt: c.expires_at ? new Date(c.expires_at).toISOString() : null
    }))
  }));

  // Every credential stays represented: the table joins back to its
  // achievement so each row names the proof it shares.
  const credentialRows = credentials.map((c) => {
    const named = labelFor(c);
    return {
      id: c.id,
      proof: named !== "Achievement" ? named : (c.title || "Achievement"),
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      view_count: c.view_count || 0
    };
  });

  const next = nextMilestone(done, nodes);
  const fourthStat = pending.length > 0
    ? { value: pending.length, unit: pending.length === 1 ? "claim" : "claims", label: "awaiting merge verification" }
    : next
      ? { value: next.remaining, unit: next.remaining === 1 ? "node" : "nodes", label: `to “${next.label}” — keep walking the roadmap` }
      : null;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <Reveal>
          <Meta>Prove · credentials that travel</Meta>
          <Display size="lg" className="mt-3">
            {profile?.name || "Student"},<br /><em>documented.</em>
          </Display>
          <p className="narrative mt-4">
            {issuer} vouches for {achievements.length} earned achievement{achievements.length === 1 ? "" : "s"}.
            Earned work becomes a signed link anyone can verify — no account needed.
          </p>
        </Reveal>

        <Reveal delay={0.06}>
          <div className={`mt-8 grid gap-8 sm:grid-cols-2 ${fourthStat ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
            <PlainStat value={achievements.length} unit="earned" label="achievements on your record" />
            <PlainStat value={credentials.length} unit="signed" label="public share links in the wild" />
            <PlainStat value={views} unit="views" label="times your proof was opened" />
            {fourthStat && (
              <PlainStat value={fourthStat.value} unit={fourthStat.unit} label={fourthStat.label} />
            )}
          </div>
        </Reveal>

        <section className="mt-12" aria-label="Achievements">
          <Meta>The record · {achievements.length} earned</Meta>
          <ProofRecord records={records} issuer={issuer} />
        </section>

        {pending.length > 0 && (
          <section className="mt-12" aria-label="Pending proof">
            <Meta style={{ color: "var(--accent)" }}>Pending proof · {pending.length} awaiting verification</Meta>
            <p className="narrative mt-3">
              Claimed open-source work that hasn&apos;t merged yet. This is not proof — it becomes
              proof the moment verification lands.
            </p>
            <Timeline className="mt-5">
              {pending.map((c) => (
                <TimelineItem
                  key={c.id}
                  state="now"
                  title={c.title || (c.pr_number ? `Pull request #${c.pr_number}` : "Contribution")}
                  meta={formatShortDate(c.created_at) || "claimed"}
                  body={`Awaiting merge verification${c.repo_url ? ` · ${shortRepo(c.repo_url)}` : ""}`}
                  action={
                    <span className="flex flex-wrap items-center gap-4">
                      {c.pr_url && (
                        <a href={c.pr_url} target="_blank" rel="noreferrer" className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                          Open pull request ↗
                        </a>
                      )}
                      <Link href="/student/opensource" prefetch={false} className="text-xs font-semibold hover:underline" style={{ color: "var(--text-muted)" }}>
                        Open source portal →
                      </Link>
                    </span>
                  }
                />
              ))}
            </Timeline>
          </section>
        )}

        {credentials.length > 0 && (
          <section className="mt-12" aria-label="Share links">
            <Meta>Out in the world · {credentials.length} signed link{credentials.length === 1 ? "" : "s"}</Meta>
            <p className="narrative mt-3">
              Each link below opens the exact public page a recruiter sees — proof name, issuer,
              dates, and signature status.
            </p>
            <div className="mt-4 border-y" style={{ borderColor: "var(--line)" }}>
              <DataTable
                caption="Signed credential share links"
                columns={[
                  { key: "proof", label: "Proof", kind: "strong" },
                  { key: "issued_at", label: "Issued", kind: "date" },
                  { key: "expires_at", label: "Expires", kind: "date", fallback: "Never" },
                  { key: "view_count", label: "Views", mono: true, align: "right", fallback: "0" },
                  { key: "link", label: "Public page", align: "right", kind: "verify" }
                ]}
                rows={credentialRows}
              />
            </div>
          </section>
        )}

        {(pending.length > 0 || next) && (
          <section className="mt-12 border-t pt-8" style={{ borderColor: "var(--line)" }} aria-label="Next proof">
            <Meta>Next proof</Meta>
            <h2 className="h-product mt-2">What becomes proof next.</h2>
            <ol className="mt-4">
              {pending.length > 0 && (
                <li className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
                  <Link href="/student/opensource" prefetch={false} className="row-link flex items-baseline gap-5 px-2 py-1">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>
                        {pending.length} claimed contribution{pending.length === 1 ? "" : "s"} awaiting verification
                      </span>
                      <span className="mt-1 block text-sm" style={{ color: "var(--text-muted)" }}>
                        Merged work verifies automatically — then it joins your record.
                      </span>
                    </span>
                    <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
                  </Link>
                </li>
              )}
              {next && (
                <li className="border-b py-5 first:border-t" style={{ borderColor: "var(--line)" }}>
                  <Link href="/student/roadmap" prefetch={false} className="row-link flex items-baseline gap-5 px-2 py-1">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[1.02rem] font-semibold" style={{ color: "var(--text)" }}>
                        {next.remaining} node{next.remaining === 1 ? "" : "s"} to “{next.label}”
                      </span>
                      <span className="mt-1 block text-sm" style={{ color: "var(--text-muted)" }}>
                        {done} of {nodes} roadmap nodes complete — milestones compound into chapter achievements.
                      </span>
                    </span>
                    <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
                  </Link>
                </li>
              )}
            </ol>
            <div className="mt-6">
              <ActionLink href="/student/contests">Or earn it under pressure in challenges</ActionLink>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function sourceDetailFor(a) {
  if (a.source_type === "roadmap") return `Roadmap milestone · ${a.source_ref || "path"}`;
  if (a.source_type === "oss") return `Verified open-source contribution · ${a.source_ref || "merge"}`;
  if (a.source_type === "contest") return `Contest result recorded by the chapter · ${a.source_ref || "challenge"}`;
  if (a.badge_name) return "Chapter badge · criteria set by your chapter";
  return "Direct chapter issue";
}
