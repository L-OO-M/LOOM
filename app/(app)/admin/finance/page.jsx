import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Wallet, PiggyBank, Handshake, Clock3, Check, X, Plus } from "lucide-react";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { Meta } from "@/components/loom/primitives";

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
  const input = "w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--accent)_14%,transparent)]";
  const inputStyle = { borderColor: "var(--line)", background: "var(--bg)", color: "var(--text)" };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 pb-14 sm:px-6">
        <PageHeader kicker={`Finance · ₹${Number(stats?.allocated ?? 0).toLocaleString("en-IN")} allocated · ₹${Number(stats?.spent ?? 0).toLocaleString("en-IN")} spent`} title="Finance" desc="Budget heads, the approval queue, and the sponsorship pipeline — all scoped to this chapter." />
        <p className="meta -mt-6 mb-6"><Link href="/admin" prefetch={false} className="hover:underline" style={{ color: "var(--accent)" }}>← Back to overview</Link></p>

        <div className="mb-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Allocated", value: `₹${Number(stats?.allocated ?? 0).toLocaleString("en-IN")}`, icon: PiggyBank, sub: "budget" },
            { label: "Spent", value: `₹${Number(stats?.spent ?? 0).toLocaleString("en-IN")}`, icon: Wallet, sub: "approved" },
            { label: "Pending", value: stats?.pending ?? 0, icon: Clock3, sub: "awaiting decision" },
            { label: "Sponsorships", value: `₹${Number(stats?.sponsorships ?? 0).toLocaleString("en-IN")}`, icon: Handshake, sub: "received" },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 rounded-2xl border p-3.5" style={{ borderColor: s.label === "Pending" && (stats?.pending ?? 0) > 0 ? "color-mix(in srgb, var(--accent) 22%, transparent)" : "var(--line)", background: s.label === "Pending" && (stats?.pending ?? 0) > 0 ? "color-mix(in srgb, var(--accent) 6%, var(--bg-elevated))" : "var(--bg-elevated)" }}>
              <span className="inline-flex size-8 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)", background: "var(--bg)", color: "var(--text-muted)" }}><s.icon size={14} /></span>
              <div><p className="font-mono text-sm font-semibold" style={{ color: "var(--text)" }}>{s.value}</p><p className="meta">{s.label} · {s.sub}</p></div>
            </div>
          ))}
        </div>

        <section aria-label="Budget heads">
          <div className="flex items-baseline gap-2">
            <Meta>Budget heads · burn rate</Meta>
            <span className="meta ml-auto">{heads.length} heads</span>
          </div>
          <form action={addBudgetHead} className="mt-3 flex flex-wrap gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }} aria-label="Create budget head">
            <input name="name" required minLength={2} maxLength={200} placeholder="New head, e.g. Events" className={input} style={{ ...inputStyle, maxWidth: 220 }} aria-label="Head name" />
            <input name="allocated" type="number" min={0} step="any" placeholder="Allocated (₹)" className={input} style={{ ...inputStyle, maxWidth: 160 }} aria-label="Allocated amount" />
            <select name="vertical" className={input} style={{ ...inputStyle, maxWidth: 170 }} aria-label="Vertical scope" defaultValue="">
              <option value="">Society-wide</option>
              <option value="technical">Technical</option>
              <option value="non_technical">Non-technical</option>
            </select>
            <button className="btn-ink inline-flex items-center gap-1 !py-2 text-sm"><Plus size={14} /> Add head</button>
          </form>
          {heads.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="narrative">No budget heads yet. Add the first one — expenses and burn bars light up immediately.</p>
            </div>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {heads.map((h) => {
                const spent = Number(h.spent);
                const allocated = Number(h.allocated);
                const pct = allocated > 0 ? Math.min(100, Math.round((spent / allocated) * 100)) : 0;
                const left = allocated - spent;
                return (
                  <div key={h.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{h.name}</p>
                      <span className="meta rounded-full border px-2 py-0.5" style={{ borderColor: "var(--line)" }}>{h.vertical || "society"}</span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct > 90 ? "var(--danger)" : pct > 70 ? "#f59e0b" : "var(--accent)" }} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                      <span>₹{allocated.toLocaleString("en-IN")} allocated</span>
                      <span>· ₹{spent.toLocaleString("en-IN")} spent · {pct}%</span>
                      <span className="ml-auto font-medium" style={{ color: left < 0 ? "var(--danger)" : "var(--text)" }}>₹{left.toLocaleString("en-IN")} left</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8" aria-label="Pending expenses">
          <Meta>{pending.length} expense{pending.length === 1 ? "" : "s"} awaiting decision · proposed → approved / rejected</Meta>
          {pending.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="narrative">Nothing waiting. Proposed expenses from leads land here for admin approval.</p>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "color-mix(in srgb, var(--accent) 18%, var(--line))", background: "var(--bg-elevated)" }}>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>₹{Number(e.amount).toLocaleString("en-IN")} · {e.note}</span>
                    <span className="meta flex flex-wrap gap-1.5">{e.head_name || "no head"}{e.department_name ? ` · ${e.department_name}` : ""}{e.proposed_by_name ? ` · by ${e.proposed_by_name}` : ""} · {new Date(e.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <form action={decideExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="approved" /><button className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold" style={{ background: "var(--text)", color: "var(--bg)" }}><Check size={12} /> Approve</button></form>
                    <form action={decideExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="decision" value="rejected" /><button className="inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--text-muted)" }}><X size={12} /> Reject</button></form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {expenses.filter((e) => e.status !== "proposed").length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <p className="meta border-b px-4 py-2" style={{ borderColor: "var(--line)" }}>Recent decisions · cap 10</p>
              {expenses.filter((e) => e.status !== "proposed").slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: "var(--line)" }}>
                  <span className="truncate text-sm" style={{ color: "var(--text-muted)" }}>₹{Number(e.amount).toLocaleString("en-IN")} · {e.note}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize" style={{ borderColor: e.status === "approved" ? "color-mix(in srgb, #16a34a 18%, transparent)" : "var(--line)", background: e.status === "approved" ? "color-mix(in srgb, #16a34a 10%, var(--bg))" : "var(--bg)", color: e.status === "approved" ? "#16a34a" : "var(--text-muted)" }}>{e.status === "approved" ? <Check size={10} /> : <X size={10} />} {e.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section aria-label="Propose expense">
            <Meta>Propose an expense</Meta>
            <form action={proposeExpense} className="mt-3 grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="grid grid-cols-2 gap-3">
                <input name="amount" type="number" min="1" step="any" required placeholder="Amount (₹)" className={input} style={inputStyle} aria-label="Amount" />
                <input name="note" required minLength={3} maxLength={1000} placeholder="What is this for?" className={input} style={inputStyle} aria-label="Note" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select name="headId" className={input} style={inputStyle} aria-label="Budget head" defaultValue="">
                  <option value="">No budget head</option>
                  {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <select name="departmentId" className={input} style={inputStyle} aria-label="Department" defaultValue="">
                  <option value="">Society-wide</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button className="btn-ink !py-2 text-sm">Propose expense</button>
            </form>
          </section>

          <section aria-label="Sponsorship pipeline">
            <Meta>Sponsorship pipeline · pipeline → committed → received</Meta>
            {sponsorships.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed p-8 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <p className="narrative">No sponsors yet. Add the first conversation — the pipeline becomes a ledger.</p>
              </div>
            ) : (
              <ul className="mt-3 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                {sponsorships.map((s) => {
                  const tone = { pipeline: "var(--text-muted)", committed: "#b45309", received: "#16a34a" }[s.status] || "var(--text-muted)";
                  return (
                    <li key={s.id} className="flex items-baseline justify-between gap-3 p-4">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
                        <span className="meta">₹{Number(s.amount).toLocaleString("en-IN")}{s.contact ? ` · ${s.contact}` : ""}</span>
                      </span>
                      <span className="inline-flex shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium capitalize" style={{ borderColor: "var(--line)", background: "var(--bg)", color: tone }}>{s.status}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <form action={addSponsorship} className="mt-4 grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <strong className="text-sm" style={{ color: "var(--text)" }}>Add a sponsor</strong>
              <input name="name" required minLength={2} maxLength={200} placeholder="Sponsor name" className={input} style={inputStyle} aria-label="Sponsor name" />
              <div className="grid grid-cols-3 gap-3">
                <input name="amount" type="number" min="0" step="any" defaultValue={0} className={input} style={inputStyle} aria-label="Amount" />
                <select name="status" className={input} style={inputStyle} aria-label="Status" defaultValue="pipeline">
                  <option value="pipeline">pipeline</option>
                  <option value="committed">committed</option>
                  <option value="received">received</option>
                </select>
                <input name="contact" maxLength={300} placeholder="Contact" className={input} style={inputStyle} aria-label="Contact" />
              </div>
              <button className="btn-ink !py-2 text-sm">Add sponsor</button>
            </form>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
