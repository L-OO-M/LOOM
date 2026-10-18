import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";
import { isVerifiedRankingEnabled, standingBreakdown } from "@/lib/standings";
import ReviewQueue from "./_components/ReviewQueue";

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
        <PageHeader
          kicker={`Trust · ${total} awaiting review`}
          title="Evidence review"
          desc="Claims students have submitted that nothing has confirmed yet. Confirming one puts it on the public board; declining one removes the points entirely."
        />

        {!live && (
          <div className="mt-6 rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--warning, #f59e0b)", background: "color-mix(in srgb, #f59e0b 8%, var(--bg-elevated))" }}>
            <p className="font-semibold" style={{ color: "var(--text)" }}>
              Verified standings are switched off for this chapter.
            </p>
            <p className="narrative mt-1">
              You can still confirm and decline claims here, and the ledger will be
              correct &mdash; but students will not see a verified board until
              <span style={{ color: "var(--accent)" }}> ranking_verified </span>
              is switched on in Feature flags.
            </p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <Meta>What you are confirming</Meta>
          <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
            {standingBreakdown().map((b) => (
              <li key={b.label} className="flex flex-wrap items-baseline justify-between gap-2">
                <span style={{ color: "var(--text-muted)" }}>{b.label}</span>
                <span className="figure-mono text-xs" style={{ color: "var(--accent)" }}>+{b.weight}</span>
              </li>
            ))}
          </ul>
          <p className="meta mt-3">
            Only a signed GitHub delivery or an admin decision can put a point on the
            board. The database rejects any score without a verifier, so there is no
            path that skips this queue.
          </p>
        </section>

        <ReviewQueue nodes={nodes} projects={projects} />
      </main>
    </AppShell>
  );
}