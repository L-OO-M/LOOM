import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import { REQUIREMENTS } from "@/lib/role-requests";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { DecisionButtons } from "./_components/DecisionButtons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seat requests",
  robots: { index: false, follow: false }
};

const STATUS_COPY = {
  open: "Waiting",
  approved: "Approved",
  rejected: "Declined",
  withdrawn: "Withdrawn"
};

export default async function AdminRequestsPage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/requests");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/requests");
  const { tenant, sql } = ctx;

  // The snapshot columns are what make this reviewable: score, tier and proof
  // are the values AT REQUEST TIME, so a later drift cannot rewrite history.
  const open = await sql`
    SELECT r.id, r.target_role, r.statement, r.score_at_request, r.tier_at_request,
           r.proof_at_request, r.created_at,
           p.name AS applicant_name, p.user_id AS applicant_id,
           d.name AS department_name
    FROM role_requests r
    JOIN profiles p ON p.user_id = r.user_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.tenant_id = ${tenant.id}::uuid AND r.status = 'open'
    ORDER BY r.created_at ASC
    LIMIT 100
  `;

  const decided = await sql`
    SELECT r.id, r.target_role, r.status, r.decision_reason, r.created_at, r.decided_at,
           p.name AS applicant_name, d.name AS department_name
    FROM role_requests r
    JOIN profiles p ON p.user_id = r.user_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.tenant_id = ${tenant.id}::uuid AND r.status <> 'open'
    ORDER BY r.decided_at DESC NULLS LAST
    LIMIT 20
  `;

  return (
    <AppShell>
      <WorkspaceMasthead
        kicker="People"
        title="Seat requests"
        lede="Core and Head requests, each carrying the applicant's verified record as it stood when they asked. Approving applies the seat; declining needs a reason the member will read."
        stats={[
          { label: "Waiting", value: String(open.length) },
          { label: "Recently decided", value: String(decided.length) }
        ]}
      />

      <WorkspaceSection index="01" title="Waiting on a decision" note="Oldest first. One open request per seat, per member.">
        {open.length === 0 ? (
          <WorkspaceEmpty
            title="Queue is clear"
            body="No seat requests are waiting. Members have to clear the verified bar before they can ask, so this stays short."
          />
        ) : (
          <ul className="space-y-3">
            {open.map((row) => {
              const proof = row.proof_at_request || {};
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border p-5"
                  style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-display text-lg" style={{ color: "var(--text)" }}>
                      {row.applicant_name || "A member"}
                    </span>
                    <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {REQUIREMENTS[row.target_role]?.label || row.target_role}
                      {row.department_name ? ` · ${row.department_name}` : ""}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    “{row.statement}”
                  </p>
                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    <div>
                      <dt className="inline">Rank at request: </dt>
                      <dd className="inline font-medium" style={{ color: "var(--text)" }}>{row.tier_at_request || "—"}</dd>
                    </div>
                    <div>
                      <dt className="inline">Verified proof: </dt>
                      <dd className="inline font-medium" style={{ color: "var(--text)" }}>{row.score_at_request}</dd>
                    </div>
                    <div>
                      <dt className="inline">Breakdown: </dt>
                      <dd className="inline">
                        {Number(proof.nodes) || 0} nodes · {Number(proof.projects) || 0} projects ·{" "}
                        {Number(proof.oss) || 0} OSS · {Number(proof.answers) || 0} answers
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Asked: </dt>
                      <dd className="inline">
                        {new Date(row.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </dd>
                    </div>
                  </dl>
                  <DecisionButtons id={row.id} />
                </li>
              );
            })}
          </ul>
        )}
      </WorkspaceSection>

      <WorkspaceSection index="02" title="Recently decided" note="The reason is shown to the member, so keep it useful.">
        {decided.length === 0 ? (
          <WorkspaceEmpty title="Nothing decided yet" body="Decisions appear here with their reason." />
        ) : (
          <ul className="space-y-2">
            {decided.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border px-4 py-3"
                style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                    {row.applicant_name || "A member"} · {REQUIREMENTS[row.target_role]?.label || row.target_role}
                    {row.department_name ? ` · ${row.department_name}` : ""}
                  </span>
                  <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                    {STATUS_COPY[row.status] || row.status}
                  </span>
                </div>
                {row.decision_reason && (
                  <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                    “{row.decision_reason}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </WorkspaceSection>
    </AppShell>
  );
}
