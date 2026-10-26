import Link from "next/link";
import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { env } from "@/lib/env";
import { ActionLink } from "@/components/loom/primitives";
import { DataTable } from "@/components/loom/DataTable";
import { OnboardingState } from "@/components/loom/States";
import { Reveal } from "@/components/motion/Reveal";
import { ProveTabs } from "@/components/student/SectionRails";
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
import "../_components/student-folio.css";
import "./credentials.css";

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
      AND (a.tenant_id = ${tenant?.id ?? null}::uuid OR a.tenant_id IS NULL)
    ORDER BY a.earned_at DESC LIMIT 100
  `;
  const credentials = await sql`
    SELECT v.*, a.source_type, a.source_ref, a.level AS achievement_level, b.name AS badge_name, b.tier
    FROM verifiable_credentials v
    LEFT JOIN student_achievements a ON a.id = v.achievement_id
    LEFT JOIN skill_badges b ON b.id = a.badge_id
    WHERE v.student_id = ${user.id}
      AND (v.tenant_id = ${tenant?.id ?? null}::uuid OR v.tenant_id IS NULL)
    ORDER BY v.issued_at DESC LIMIT 100
  `;
  const pending = await sql`
    SELECT id, title, pr_url, repo_url, pr_number, contribution_type, created_at
    FROM student_oss_contributions
    WHERE student_id = ${user.id} AND status = 'claimed'
    ORDER BY created_at DESC LIMIT 20
  `;
  // Totals follow the student's own path. Counting every chapter's nodes made
  // "3 of 412 complete" while the roadmap page showed 3 of 18.
  const domain = profile?.primary_domain || null;
  const [{ nodes = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS nodes FROM roadmap_nodes
    WHERE (${domain}::text IS NULL OR domain = ${domain})
  `;
  const [{ done = 0 } = {}] = await sql`
    SELECT COUNT(*)::int AS done
    FROM student_roadmap_progress r
    JOIN roadmap_nodes n ON n.id = r.node_id
    WHERE r.student_id = ${user.id} AND r.status = 'completed'
      AND (${domain}::text IS NULL OR n.domain = ${domain})
  `;

  const views = credentials.reduce((n, c) => n + (c.view_count || 0), 0);
  const groups = groupLinksByAchievement(credentials);
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  if (achievements.length === 0) {
    return (
      <AppShell area="student" tenant={tenant} user={user}>
        <main className="desk proof-archive mx-auto max-w-4xl px-4 pb-4 sm:px-6">
          <ProveTabs active="/student/credentials" className="mt-4" />
          <div className="proof-empty">
            <OnboardingState
              eyebrow="Proof / portable credentials"
              title="Nothing to show, yet."
              why="Proof is issued for real work: merged pull requests, contest placements, roadmap milestones your chapter verifies. Each piece becomes a signed link any recruiter can check, no login required."
              steps={[
                { title: "Merge a PR", body: "Claim it in the open-source portal; verification is automatic." },
                { title: "Place in a challenge", body: "Contests with deadlines produce the sharpest proof." },
                { title: "Finish the path", body: "Roadmap milestones compound into chapter-issued achievements." }
              ]}
              action={<Link href="/student/opensource" prefetch={false} className="btn-ink">Start with open source</Link>}
            />
          </div>
        </main>
      </AppShell>
    );
  }

  // Records carry everything the client island needs, plain and serializable.
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
  const registerNote = pending.length > 0
    ? { value: pending.length, unit: pending.length === 1 ? "claim" : "claims", label: "awaiting merge verification" }
    : next
      ? { value: next.remaining, unit: next.remaining === 1 ? "node" : "nodes", label: `to “${next.label}”` }
      : null;

  return (
    <AppShell area="student" tenant={tenant} user={user}>
      <main className="desk proof-archive mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <Reveal>
          <section className="desk-hero proof-hero" aria-labelledby="proof-title">
            <div className="desk-hero-inner">
              <div className="desk-hero-main">
                <p className="desk-kicker">
                  <span>Prove</span>
                  <span>Credentials that travel</span>
                </p>
                <h1 id="proof-title" className="desk-title">
                  {profile?.name || "Student"},<br /><em>documented.</em>
                </h1>
                <p className="desk-lede">
                  {issuer} vouches for {achievements.length} earned achievement{achievements.length === 1 ? "" : "s"}.
                  Earned work becomes a signed link anyone can verify, no account needed.
                </p>
                <p className="desk-meta-line">
                  {achievements.length} achievements &middot; {credentials.length} signed links &middot; {views} views
                </p>
                <div className="desk-actions">
                  <a href="#proof-record" className="btn-ink">Open the record</a>
                  {next ? (
                    <Link href="/student/roadmap" prefetch={false} className="btn-ghost">
                      Earn the next one
                    </Link>
                  ) : (
                    <Link href="/student/contests" prefetch={false} className="btn-ghost">
                      Enter a challenge
                    </Link>
                  )}
                </div>
              </div>

              <aside className="desk-pass proof-pass" aria-label="Archive register">
                <p className="desk-label">Archive register</p>
                <p className="desk-pass-value">
                  {achievements.length}
                  <span>earned</span>
                </p>
                <p className="desk-pass-note">
                  {credentials.length === 0
                    ? "No signed links yet. Issue one from any record."
                    : `${credentials.length} signed link${credentials.length === 1 ? "" : "s"} in the world.`}
                </p>
                <dl className="desk-pass-list">
                  <div>
                    <dt>Links</dt>
                    <dd>{credentials.length} signed</dd>
                  </div>
                  <div>
                    <dt>Views</dt>
                    <dd>{views} opened</dd>
                  </div>
                  <div>
                    <dt>{pending.length > 0 ? "Pending" : "Next"}</dt>
                    <dd>{registerNote ? `${registerNote.value} ${registerNote.unit}` : "Track complete"}</dd>
                  </div>
                </dl>
              </aside>
            </div>
          </section>
        </Reveal>

        <div className="proof-tabs">
          <ProveTabs active="/student/credentials" />
        </div>

        <section id="proof-record" className="proof-section" aria-labelledby="proof-record-title">
          <div className="proof-section-head">
            <div>
              <p className="proof-section-kicker">The record</p>
              <h2 id="proof-record-title" className="proof-section-title">
                {achievements.length} earned achievement{achievements.length === 1 ? "" : "s"}.
              </h2>
            </div>
            <p className="proof-section-aside">Issued by {issuer}</p>
          </div>
          <ProofRecord records={records} issuer={issuer} />
        </section>

        {pending.length > 0 && (
          <section className="proof-section" aria-labelledby="proof-pending-title">
            <div className="proof-section-head">
              <div>
                <p className="proof-section-kicker is-accent">Pending proof</p>
                <h2 id="proof-pending-title" className="proof-section-title">
                  {pending.length} claim{pending.length === 1 ? "" : "s"} awaiting verification.
                </h2>
              </div>
              <p className="proof-section-aside">Not proof until it merges</p>
            </div>
            <p className="proof-section-lede">
              Claimed open-source work that hasn&apos;t merged yet. It becomes proof the moment verification lands.
            </p>
            <ol className="proof-pending-list">
              {pending.map((c, i) => (
                <li key={c.id} className="proof-pending-row">
                  <span className="proof-row-index">{String(i + 1).padStart(2, "0")}</span>
                  <span className="proof-row-main">
                    <span className="proof-row-title">
                      {c.title || (c.pr_number ? `Pull request #${c.pr_number}` : "Contribution")}
                    </span>
                    <span className="proof-row-meta">
                      {formatShortDate(c.created_at) || "claimed"}
                      {c.repo_url ? ` · ${shortRepo(c.repo_url)}` : ""}
                      {" · "}awaiting merge verification
                    </span>
                  </span>
                  <span className="proof-row-actions">
                    {c.pr_url && (
                      <a href={c.pr_url} target="_blank" rel="noreferrer">
                        Pull request <span aria-hidden="true">&nearr;</span>
                      </a>
                    )}
                    <Link href="/student/opensource" prefetch={false}>Open source portal</Link>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {credentials.length > 0 && (
          <section className="proof-section" aria-labelledby="proof-links-title">
            <div className="proof-section-head">
              <div>
                <p className="proof-section-kicker">Out in the world</p>
                <h2 id="proof-links-title" className="proof-section-title">
                  {credentials.length} signed link{credentials.length === 1 ? "" : "s"}.
                </h2>
              </div>
              <p className="proof-section-aside">Anyone can verify</p>
            </div>
            <p className="proof-section-lede">
              Each link opens the exact public page a recruiter sees: proof name, issuer, dates, and signature status.
            </p>
            <div className="proof-links-table">
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
          <section className="proof-section" aria-labelledby="proof-next-title">
            <div className="proof-section-head">
              <div>
                <p className="proof-section-kicker">Next proof</p>
                <h2 id="proof-next-title" className="proof-section-title">What becomes proof next.</h2>
              </div>
              <p className="proof-section-aside">
                {done} of {nodes} roadmap nodes complete
              </p>
            </div>
            <ol className="proof-next-list">
              {pending.length > 0 && (
                <li>
                  <Link href="/student/opensource" prefetch={false} className="proof-next-row">
                    <span className="proof-row-index">01</span>
                    <span className="proof-row-main">
                      <span className="proof-row-title">
                        {pending.length} claimed contribution{pending.length === 1 ? "" : "s"} awaiting verification
                      </span>
                      <span className="proof-row-meta">
                        Merged work verifies automatically, then it joins your record.
                      </span>
                    </span>
                    <span className="proof-row-arrow" aria-hidden="true">&rarr;</span>
                  </Link>
                </li>
              )}
              {next && (
                <li>
                  <Link href="/student/roadmap" prefetch={false} className="proof-next-row">
                    <span className="proof-row-index">{pending.length > 0 ? "02" : "01"}</span>
                    <span className="proof-row-main">
                      <span className="proof-row-title">
                        {next.remaining} node{next.remaining === 1 ? "" : "s"} to “{next.label}”
                      </span>
                      <span className="proof-row-meta">
                        Milestones compound into chapter achievements.
                      </span>
                    </span>
                    <span className="proof-row-arrow" aria-hidden="true">&rarr;</span>
                  </Link>
                </li>
              )}
            </ol>
            <div className="proof-next-foot">
              <ActionLink href="/student/contests">Or earn it under pressure in challenges</ActionLink>
            </div>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function sourceDetailFor(a) {
  if (a.source_type === "roadmap") return `Roadmap milestone / ${a.source_ref || "path"}`;
  if (a.source_type === "oss") return `Verified open-source contribution / ${a.source_ref || "merge"}`;
  if (a.source_type === "contest") return `Contest result recorded by the chapter / ${a.source_ref || "challenge"}`;
  if (a.badge_name) return "Chapter badge / criteria set by your chapter";
  return "Direct chapter issue";
}
