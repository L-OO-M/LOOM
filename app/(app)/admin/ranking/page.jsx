import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { isVerifiedRankingEnabled, standingBreakdown } from "@/lib/standings";
import ReviewQueue from "./_components/ReviewQueue";
import "../_components/admin-ledger.css";

export const dynamic = "force-dynamic";

// The evidence review queue.
//
// This is the whole human cost of the ranking redesign, so it is worth being
// precise about what it is for: it does NOT gate student progress. A claim waits
// here scoring nothing and the student keeps working. It exists so that the
// claims a machine cannot confirm -- a repository with no webhook on it, a
// milestone whose evidence needs a human eye -- have somewhere to be judged,
// and so that one bad actor can be reversed in a single action.
//
// The previous design needed no queue at all, which is exactly why 55 of every
// 100 points could be self-issued. What is rejected here is reversible: the
// ledger row is deleted and the score is recomputed, never adjusted by hand.
export default async function AdminRankingPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/ranking");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/ranking");
  const { tenant, user, sql } = ctx;
  const tid = tenant?.id ?? null;

  const live = await isVerifiedRankingEnabled(sql, tid);

  // Sequential by pooler convention -- never Promise.all.
  const nodes = await sql`
    SELECT srp.id, srp.student_id, srp.node_id, srp.evidence_note, srp.evidence_url,
           srp.updated_at, n.title AS item_title, n.domain,
           p.name AS student_name
      FROM student_roadmap_progress srp
      LEFT JOIN roadmap_nodes n ON n.id = srp.node_id
      LEFT JOIN profiles p ON p.user_id = srp.student_id
     WHERE srp.tenant_id = ${tid}::uuid
       AND srp.status = 'completed'
       AND srp.evidence_state = 'provisional'
     ORDER BY srp.updated_at ASC
     LIMIT 60
  `;
  const projects = await sql`
    SELECT pr.id, pr.owner_id AS student_id, pr.title AS item_title, pr.repo_url,
           pr.repo_full_name, pr.description, pr.updated_at,
           p.name AS student_name,
           EXISTS (
             SELECT 1 FROM github_events ge
              WHERE ge.tenant_id = ${tid}::uuid
                AND ge.student_id = pr.owner_id
                AND lower(ge.repository_name) = lower(pr.repo_full_name)
           ) AS has_attested_activity
      FROM projects pr
      LEFT JOIN profiles p ON p.user_id = pr.owner_id
     WHERE pr.tenant_id = ${tid}::uuid
       AND pr.evidence_state = 'provisional'
     ORDER BY pr.updated_at ASC
     LIMIT 60
  `;

  const total = nodes.length + projects.length;

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Trust / ${total} awaiting review`}
          title="Evidence review"
          lede="Claims students have submitted that nothing has confirmed yet. Confirming one puts it on the public board; declining one removes the points entirely."
          meta={`${nodes.length} milestone claims / ${projects.length} project claims / ${live ? "verified board live" : "verified board off"}`}
          tone="ledger"
          art="/domains-art/domain-infra.png"
          artAlt=""
          stats={[
            { value: nodes.length, label: "milestone claims" },
            { value: projects.length, label: "project claims" },
            { value: total, label: "awaiting review" }
          ]}
        />

        {!live && (
          <div className="aled-panel" style={{ marginTop: "1.4rem", borderColor: "color-mix(in srgb, var(--warn) 45%, var(--line))" }}>
            <p className="aled-panel-title" style={{ color: "var(--warn)" }}>
              Verified standings are switched off for this chapter.
            </p>
            <p className="aled-panel-note" style={{ marginBottom: 0 }}>
              You can still confirm and decline claims here, and the ledger will be correct — but students
              will not see a verified board until <span style={{ color: "var(--accent)" }}>ranking_verified</span> is
              switched on in Feature flags.
            </p>
          </div>
        )}

        <WorkspaceSection index="01" title="What you are confirming" note="Only a signed GitHub delivery or an admin decision can put a point on the board.">
          <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0 }}>
            {standingBreakdown().map((b) => (
              <li key={b.label} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                <span className="aled-title" style={{ fontWeight: 500, color: "var(--text-muted)" }}>{b.label}</span>
                <span className="aled-value" style={{ color: "var(--accent)" }}>+{b.weight}</span>
              </li>
            ))}
          </ul>
          <p className="aled-meta" style={{ marginTop: "0.8rem" }}>
            The database rejects any score without a verifier, so there is no path that skips this queue.
          </p>
        </WorkspaceSection>

        <WorkspaceSection index="02" title="Review queue" note="Milestone and project claims, oldest first. Confirming pays out; declining removes the row and recomputes." action={<span className="aled-meta">{total} waiting</span>}>
          {total === 0 ? (
            <WorkspaceEmpty title="Queue clear" body="No provisional claims are waiting for review. Confirmed and declined items leave this list." />
          ) : (
            <div style={{ marginTop: "0.9rem" }}>
              <ReviewQueue nodes={nodes} projects={projects} />
            </div>
          )}
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
