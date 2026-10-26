import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Check, X, Plus } from "lucide-react";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { WorkspaceMasthead, WorkspaceSection, WorkspaceEmpty } from "@/components/loom/WorkspaceMasthead";
import { ExpenseStatusDonut, SponsorshipPipelineBars, MonthlyExpenseBars } from "@/components/admin/FinanceCharts";
import "../_components/admin-ledger.css";

async function decideExpense(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || ctx.profile.role !== "admin") return;
  const { sql, user, tenant } = ctx;
  const id = String(formData.get("id") || "");
  const decision = String(formData.get("decision") || "");
  if (!id || !["approved", "rejected"].includes(decision)) return;
  await sql`
    UPDATE expenses SET status = ${decision}, decided_by = ${user.id}
    WHERE id = ${id} AND status = 'proposed'
      AND (tenant_id = ${tenant?.id ?? null}::uuid OR ${tenant?.id ?? null}::uuid IS NULL)
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: `expense_${decision}`, resource: "expense", resourceId: id });
  revalidatePath("/admin/finance");
}

async function proposeExpense(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || !["dept_lead", "vertical_lead", "admin"].includes(ctx.profile.role)) return;
  const { sql, user, tenant } = ctx;
  const amount = Number(formData.get("amount"));
  const note = String(formData.get("note") || "").slice(0, 1000);
  const headId = String(formData.get("headId") || "") || null;
  const departmentId = String(formData.get("departmentId") || "") || null;
  if (!Number.isFinite(amount) || amount <= 0 || note.length < 3) return;
  await sql`
    INSERT INTO expenses (tenant_id, head_id, department_id, amount, note, status, created_by)
    VALUES (${tenant?.id ?? null}, ${headId}, ${departmentId}, ${amount}, ${note}, 'proposed', ${user.id})
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "proposed_expense", resource: "expense", resourceId: null, after: { amount, note } });
  revalidatePath("/admin/finance");
}

async function addBudgetHead(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || ctx.profile.role !== "admin") return;
  const { sql, user, tenant } = ctx;
  const name = String(formData.get("name") || "").slice(0, 200);
  const allocated = Number(formData.get("allocated") || 0);
  const vertical = String(formData.get("vertical") || "") || null;
  if (name.length < 2 || !Number.isFinite(allocated) || allocated < 0) return;
  if (vertical && !["technical", "non_technical"].includes(vertical)) return;
  const [row] = await sql`
    INSERT INTO budget_heads (tenant_id, name, allocated, vertical)
    VALUES (${tenant?.id ?? null}, ${name}, ${allocated}, ${vertical})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_budget_head", resource: "budget_head", resourceId: row.id, after: { name, allocated } });
  revalidatePath("/admin/finance");
}

async function addSponsorship(formData) {
  "use server";
  const ctx = await getRequestContext();
  if (ctx.error || ctx.profile.role !== "admin") return;
  const { sql, user, tenant } = ctx;
  const name = String(formData.get("name") || "").slice(0, 200);
  const amount = Number(formData.get("amount") || 0);
  const status = String(formData.get("status") || "pipeline");
  const contact = String(formData.get("contact") || "").slice(0, 300) || null;
  if (name.length < 2 || !["pipeline", "committed", "received"].includes(status)) return;
  const [row] = await sql`
    INSERT INTO sponsorships (tenant_id, name, amount, status, contact)
    VALUES (${tenant?.id ?? null}, ${name}, ${Number.isFinite(amount) ? amount : 0}, ${status}, ${contact})
    RETURNING *
  `;
  await writeAudit({ sql, actorId: user.id, tenantId: tenant?.id, action: "created_sponsorship", resource: "sponsorship", resourceId: row.id, after: { name } });
  revalidatePath("/admin/finance");
}

export default async function AdminFinancePage() {
  const ctx = await getRequestContext({ adminOnly: true });
  if (ctx.error === "UNAUTHORIZED") redirect("/login?redirect=/admin/finance");
  if (ctx.error === "FORBIDDEN") redirect("/student");
  if (ctx.error) redirect("/login?redirect=/admin/finance");
  const { user, tenant, sql } = ctx;
  const tid = tenant?.id ?? null;

  const [stats] = await sql`
    SELECT
      (SELECT COALESCE(SUM(allocated),0)::numeric FROM budget_heads WHERE tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL) AS allocated,
      (SELECT COALESCE(SUM(amount),0)::numeric FROM expenses WHERE status = 'approved' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS spent,
      (SELECT COUNT(*)::int FROM expenses WHERE status = 'proposed' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS pending,
      (SELECT COALESCE(SUM(amount),0)::numeric FROM sponsorships WHERE status = 'received' AND (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)) AS sponsorships
  `;

  const heads = await sql`
    SELECT h.*,
      COALESCE((SELECT SUM(e.amount) FROM expenses e
        WHERE e.head_id = h.id AND e.status = 'approved'
          AND (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)), 0)::numeric AS spent
    FROM budget_heads h
    WHERE (h.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY h.name ASC
  `;
  const expenses = await sql`
    SELECT e.*, h.name AS head_name, d.name AS department_name, p.name AS proposed_by_name
    FROM expenses e
    LEFT JOIN budget_heads h ON h.id = e.head_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN profiles p ON p.user_id = e.created_by
    WHERE (e.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY e.created_at DESC LIMIT 100
  `;
  const sponsorships = await sql`
    SELECT * FROM sponsorships
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY created_at DESC LIMIT 100
  `;
  const departments = await sql`
    SELECT id, name FROM departments
    WHERE (tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
    ORDER BY name ASC
  `;

  const pending = expenses.filter((e) => e.status === "proposed");
  const decided = expenses.filter((e) => e.status !== "proposed");
  const expenseStatus = [
    { name: "proposed", value: expenses.filter((e) => e.status === "proposed").length },
    { name: "approved", value: expenses.filter((e) => e.status === "approved").length },
    { name: "rejected", value: expenses.filter((e) => e.status === "rejected").length },
  ];
  const sponsorshipPipeline = ["pipeline", "committed", "received"].map((s) => ({
    name: s,
    value: sponsorships.filter((x) => x.status === s).reduce((sum, x) => sum + Number(x.amount || 0), 0),
  }));
  const monthlyMap = new Map();
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    monthlyMap.set(k, { label, value: 0 });
  }
  for (const e of expenses) {
    if (e.status !== "approved" || !e.created_at) continue;
    const d = new Date(e.created_at);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthlyMap.has(k)) monthlyMap.get(k).value += Number(e.amount || 0);
  }
  const monthlySpend = [...monthlyMap.values()];
  const inr = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
  const sponsorTag = { pipeline: "", committed: "aled-tag--warn", received: "aled-tag--success" };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <WorkspaceMasthead
          kicker={`Finance / ${inr(stats?.allocated)} allocated / ${inr(stats?.spent)} spent`}
          title="Finance"
          lede="Budget heads, the approval queue, and the sponsorship pipeline — all scoped to this chapter."
          meta={`${inr(stats?.allocated)} allocated → ${inr(stats?.spent)} spent / ${pending.length} awaiting decision`}
          tone="ledger"
          art="/storyloom/opportunity.png"
          artAlt=""
          stats={[
            { value: inr(stats?.allocated), label: "allocated" },
            { value: inr(stats?.spent), label: "spent / approved" },
            { value: stats?.pending ?? 0, label: "pending expenses" },
            { value: inr(stats?.sponsorships), label: "sponsorships received" }
          ]}
          actions={
            <Link href="/admin" prefetch={false} style={{ color: "var(--accent)" }} className="aled-meta">
              ← Back to overview
            </Link>
          }
        />

        <WorkspaceSection index="01" title="Cash flow" note="Expense status, the last six months of approved spend, and the sponsorship pipeline.">
          <div className="grid gap-4 lg:grid-cols-3">
            <ExpenseStatusDonut data={expenseStatus} />
            <MonthlyExpenseBars data={monthlySpend} />
            <SponsorshipPipelineBars data={sponsorshipPipeline} />
          </div>
        </WorkspaceSection>

        <WorkspaceSection
          index="02"
          title="Approval queue"
          note="Proposed → approved / rejected. Every decision is audited."
          action={<span className="aled-meta">{pending.length} awaiting</span>}
        >
          {pending.length === 0 ? (
            <WorkspaceEmpty title="Nothing waiting" body="Proposed expenses from leads land here for admin approval." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {pending.map((e) => (
                <li key={e.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{inr(e.amount)} · {e.note}</span>
                    <p className="aled-sub">
                      {e.head_name || "no head"}
                      {e.department_name ? ` · ${e.department_name}` : ""}
                      {e.proposed_by_name ? ` · by ${e.proposed_by_name}` : ""}
                      {" · "}
                      {new Date(e.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="aled-actions">
                    <form action={decideExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="btn-ink inline-flex items-center gap-1 !py-1.5 text-xs">
                        <Check size={12} aria-hidden="true" /> Approve
                      </button>
                    </form>
                    <form action={decideExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="inline-flex items-center gap-1 border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}>
                        <X size={12} aria-hidden="true" /> Reject
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {decided.length > 0 && (
            <div className="aled-hidden">
              <p className="aled-meta">Recent decisions · cap 10</p>
              <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.5rem 0 0", padding: 0 }}>
                {decided.slice(0, 10).map((e) => (
                  <li key={e.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <span className="aled-sub" style={{ margin: 0 }}>{inr(e.amount)} · {e.note}</span>
                    <span className={`aled-tag ${e.status === "approved" ? "aled-tag--success" : "aled-tag--danger"}`}>{e.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          index="03"
          title="Budget heads"
          note="Allocation against approved burn; the bar turns amber past 70% and danger past 90%."
          action={<span className="aled-meta">{heads.length} heads</span>}
        >
          <form action={addBudgetHead} className="aled-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }} aria-label="Create budget head">
            <label>Name
              <input name="name" required minLength={2} maxLength={200} placeholder="New head, e.g. Events" className="aled-field" />
            </label>
            <label>Allocated (₹)
              <input name="allocated" type="number" min={0} step="any" placeholder="0" className="aled-field" />
            </label>
            <label>Vertical scope
              <select name="vertical" className="aled-field" defaultValue="">
                <option value="">Society-wide</option>
                <option value="technical">Technical</option>
                <option value="non_technical">Non-technical</option>
              </select>
            </label>
            <button className="btn-ink inline-flex items-center justify-center gap-1.5" style={{ alignSelf: "end" }}>
              <Plus size={14} aria-hidden="true" /> Add head
            </button>
          </form>

          {heads.length === 0 ? (
            <WorkspaceEmpty title="No budget heads yet" body="Add the first one — expenses and burn bars light up immediately." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {heads.map((h) => {
                const spent = Number(h.spent);
                const allocated = Number(h.allocated);
                const pct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
                const left = allocated - spent;
                return (
                  <li key={h.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                    <div className="aled-copy">
                      <span className="aled-title">{h.name}</span>
                      <p className="aled-sub">
                        {h.vertical || "society"} · {inr(allocated)} allocated · {inr(spent)} spent ·{" "}
                        <span style={{ color: left < 0 ? "var(--danger)" : "var(--text-muted)" }}>{inr(left)} left</span>
                      </p>
                      <span className="aled-meter" aria-hidden="true">
                        <span className={pct > 90 ? "is-danger" : ""} style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                    <span className="aled-value">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          )}
        </WorkspaceSection>

        <WorkspaceSection
          index="04"
          title="Sponsorship pipeline"
          note="Pipeline → committed → received. Amounts are the money in flight, not guesses."
          action={<span className="aled-meta">{sponsorships.length} sponsors</span>}
        >
          {sponsorships.length === 0 ? (
            <WorkspaceEmpty title="No sponsors yet" body="Add the first conversation — the pipeline becomes a ledger." />
          ) : (
            <ul className="aled-ledger" style={{ listStyle: "none", margin: "0.9rem 0 0", padding: 0 }}>
              {sponsorships.map((s) => (
                <li key={s.id} className="aled-row" style={{ "--aled-cols": "minmax(0, 1fr) auto" }}>
                  <div className="aled-copy">
                    <span className="aled-title">{s.name}</span>
                    <p className="aled-sub">{inr(s.amount)}{s.contact ? ` · ${s.contact}` : ""}</p>
                  </div>
                  <span className={`aled-tag ${sponsorTag[s.status] || ""}`}>{s.status}</span>
                </li>
              ))}
            </ul>
          )}

          <form action={addSponsorship} className="aled-form" style={{ marginTop: "1.2rem", gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))" }}>
            <p className="aled-panel-title" style={{ gridColumn: "1 / -1", margin: 0 }}>
              Add a sponsor
            </p>
            <label>Sponsor name
              <input name="name" required minLength={2} maxLength={200} placeholder="Sponsor name" className="aled-field" />
            </label>
            <label>Amount (₹)
              <input name="amount" type="number" min="0" step="any" defaultValue={0} className="aled-field" />
            </label>
            <label>Status
              <select name="status" className="aled-field" defaultValue="pipeline">
                <option value="pipeline">pipeline</option>
                <option value="committed">committed</option>
                <option value="received">received</option>
              </select>
            </label>
            <label>Contact
              <input name="contact" maxLength={300} placeholder="Contact" className="aled-field" />
            </label>
            <button className="btn-ink !py-2 text-sm" style={{ gridColumn: "1 / -1" }}>Add sponsor</button>
          </form>
        </WorkspaceSection>

        <WorkspaceSection index="05" title="Propose an expense" note="Leads propose; admins decide in the queue above.">
          <form action={proposeExpense} className="aled-form" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))" }}>
            <label>Amount (₹)
              <input name="amount" type="number" min="1" step="any" required placeholder="Amount (₹)" className="aled-field" />
            </label>
            <label>What is this for?
              <input name="note" required minLength={3} maxLength={1000} placeholder="What is this for?" className="aled-field" />
            </label>
            <label>Budget head
              <select name="headId" className="aled-field" defaultValue="">
                <option value="">No budget head</option>
                {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </label>
            <label>Department
              <select name="departmentId" className="aled-field" defaultValue="">
                <option value="">Society-wide</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <button className="btn-ink !py-2 text-sm" style={{ gridColumn: "1 / -1" }}>Propose expense</button>
          </form>
        </WorkspaceSection>
      </main>
    </AppShell>
  );
}
