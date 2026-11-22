import { redirect } from "next/navigation";
import { getRequestContext } from "@/lib/auth-server";
import {
  REQUIREMENTS,
  evaluateRoleRequest,
  loadRequestState,
  loadRoleContext,
  proofTotal
} from "@/lib/role-requests";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { fetchRankPositions } from "@/lib/standings";
import { RoleRequestForm } from "./RoleRequestForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seats",
  robots: { index: false, follow: false }
};

const PROOF_LABEL = {
  nodes: "Verified roadmap nodes",
  projects: "Verified projects",
  oss: "Merged OSS contributions",
  answers: "Accepted forum answers"
};

const STATUS_COPY = {
  open: { label: "Waiting", body: "An admin has not decided yet." },
  approved: { label: "Approved", body: "The seat was granted." },
  rejected: { label: "Declined", body: "The decision reason is below." },
  withdrawn: { label: "Withdrawn", body: "You took it back." }
};

export default async function StudentRolesPage() {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/student/roles");
  if (ctx.error) redirect("/login?redirect=/student/roles");
  const { user, tenant, sql } = ctx;

  // One tier computation for the page, then a cheap per-seat request lookup.
  const context = await loadRoleContext(sql, { tenantId: tenant.id, userId: user.id });
  const coreState = await loadRequestState(sql, { tenantId: tenant.id, userId: user.id, targetRole: "core" });
  const headState = await loadRequestState(sql, { tenantId: tenant.id, userId: user.id, targetRole: "dept_lead" });

  const inAnyDepartment = context.departments.length > 0;
  const core = evaluateRoleRequest({ targetRole: "core", ...context, ...coreState });
  const head = evaluateRoleRequest({
    targetRole: "dept_lead",
    ...context,
    ...headState,
    // The card states the rule; the form pins the actual department and the API
    // re-checks it against real membership.
    departmentMember: inAnyDepartment
  });

  const history = await sql`
    SELECT r.id, r.target_role, r.status, r.decision_reason, r.created_at, r.decided_at,
           d.name AS department_name
    FROM role_requests r
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE r.user_id = ${user.id} AND r.tenant_id = ${tenant.id}::uuid
    ORDER BY r.created_at DESC
    LIMIT 10
  `;

  const total = proofTotal(context.proof);
  const positions = await fetchRankPositions(sql, { tenantId: tenant.id, userIds: [user.id] });
  const position = positions.get(String(user.id)) || null;
  const standing = position?.rank
    ? `#${position.rank} of ${position.total}`
    : "Unranked";

  return (
    <AppShell>
      <WorkspaceMasthead
        kicker="Grow"
        title="Seats"
        lede="Core and Head are earned seats, not settings. Ask once your verified record clears the bar — the request carries that record with it, so nobody has to take your word for it."
        stats={[
          { label: "Rank", value: context.tier },
          { label: "Verified proof", value: String(total) },
          { label: "Chapter position", value: standing },
          { label: "Departments", value: String(context.departments.length) }
        ]}
      />

      <WorkspaceSection
        index="01"
        title="What you have"
        note="Counted from verified evidence only. Unverified claims score nothing here — and nothing here is a guess: this is the same board the Standings page reads."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(PROOF_LABEL).map(([key, label]) => (
            <li
              key={key}
              className="flex items-baseline justify-between rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            >
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {label}
              </span>
              <span className="font-display text-lg" style={{ color: "var(--text)" }}>
                {Number(context.proof[key]) || 0}
              </span>
            </li>
          ))}
        </ul>
      </WorkspaceSection>

      <WorkspaceSection index="02" title="Ask for a seat" note="One open request per seat. A decision starts a two-week cooldown.">
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { key: "core", verdict: core, requirements: REQUIREMENTS.core },
            { key: "dept_lead", verdict: head, requirements: REQUIREMENTS.dept_lead }
          ].map(({ key, verdict, requirements }) => (
            <article
              key={key}
              className="rounded-2xl border p-5"
              style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            >
              <h3 className="font-display text-xl" style={{ color: "var(--text)" }}>
                {requirements.label}
              </h3>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                {requirements.summary}
              </p>
              {verdict.reasons.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                  {verdict.reasons.map((reason) => (
                    <li key={reason.code}>— {reason.message}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <RoleRequestForm
                  target={key}
                  departments={context.departments}
                  eligible={verdict.eligible}
                  disabledReason={
                    !inAnyDepartment
                      ? "Join a department first — both seats are department-scoped, and joining as a General member is instant."
                      : "The request unlocks once your verified record clears the bar above."
                  }
                />
              </div>
            </article>
          ))}
        </div>
      </WorkspaceSection>

      <WorkspaceSection index="03" title="Your requests" note="What you asked for, and what came back.">
        {history.length === 0 ? (
          <WorkspaceEmpty
            title="Nothing asked yet"
            body="When you send a request it appears here with the decision and the reason."
          />
        ) : (
          <ul className="space-y-2">
            {history.map((row) => {
              const copy = STATUS_COPY[row.status] || { label: row.status, body: "" };
              return (
                <li
                  key={row.id}
                  className="rounded-xl border px-4 py-3"
                  style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>
                      {REQUIREMENTS[row.target_role]?.label || row.target_role}
                      {row.department_name ? ` · ${row.department_name}` : ""}
                    </span>
                    <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      {copy.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Asked {new Date(row.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {row.decided_at
                      ? ` · decided ${new Date(row.decided_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                      : ""}
                  </p>
                  {row.decision_reason && (
                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                      “{row.decision_reason}”
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </WorkspaceSection>
    </AppShell>
  );
}
