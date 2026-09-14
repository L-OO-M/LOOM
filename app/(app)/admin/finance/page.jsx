import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
  const input = { borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14, width: "100%" };

  return (
    <AppShell area="admin" tenant={tenant} user={user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <PageHeader kicker="Operations" title="Finance" desc="Budget heads, expense approvals, and the sponsorship pipeline." />
        <p className="meta mt-2"><Link href="/admin" prefetch={false} className="hover:underline">← Back to admin</Link></p>

        <section className="mt-8" aria-label="Budget heads">
          <Meta>Budget heads</Meta>
          <form action={addBudgetHead} className="mt-3 flex flex-wrap gap-2" aria-label="Create budget head">
            <input name="name" required minLength={2} maxLength={200} placeholder="New head, e.g. Events" style={{ ...input, maxWidth: 220 }} aria-label="Head name" />
            <input name="allocated" type="number" min={0} step="any" placeholder="Allocated (₹)" style={{ ...input, maxWidth: 160 }} aria-label="Allocated amount" />
            <select name="vertical" style={{ ...input, maxWidth: 170 }} aria-label="Vertical scope" defaultValue="">
              <option value="">Society-wide</option>
              <option value="technical">Technical</option>
              <option value="non_technical">Non-technical</option>
            </select>
            <button className="btn-ink !py-2 text-sm">Add head</button>
          </form>
          {heads.length === 0 ? (
            <p className="narrative mt-3">No budget heads yet. Add the first one above — expenses and spend tracking light up immediately.</p>
          ) : (
            <div className="mt-3 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {heads.map((h) => (
                <div key={h.id} className="grid gap-1 border-b px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto_auto]" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{h.name} <span className="meta">{h.vertical || "society"}</span></span>
                  <span className="meta">allocated ₹{Number(h.allocated).toLocaleString("en-IN")}</span>
                  <span className="meta">spent ₹{Number(h.spent).toLocaleString("en-IN")}</span>
                  <span className="meta">left ₹{(Number(h.allocated) - Number(h.spent)).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8" aria-label="Pending expenses">
          <Meta>{pending.length} expense{pending.length === 1 ? "" : "s"} awaiting decision</Meta>
          {pending.length === 0 ? (
            <p className="narrative mt-3">Nothing waiting. Proposed expenses from dept leads and vertical leads land here for approval.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {pending.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold" style={{ color: "var(--text)" }}>₹{Number(e.amount).toLocaleString("en-IN")} · {e.note}</span>
                    <span className="meta">{e.head_name || "no head"}{e.department_name ? ` · ${e.department_name}` : ""}{e.proposed_by_name ? ` · by ${e.proposed_by_name}` : ""}</span>
                  </span>
                  <span className="flex gap-2">
                    <form action={decideExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="btn-ink !py-1 !text-xs">Approve</button>
                    </form>
                    <form action={decideExpense}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button className="btn-ghost !py-1 !text-xs">Reject</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {expenses.filter((e) => e.status !== "proposed").length > 0 && (
            <div className="mt-4 overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)" }}>
              {expenses.filter((e) => e.status !== "proposed").slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5 last:border-b-0" style={{ borderColor: "var(--line)" }}>
                  <span className="truncate text-sm" style={{ color: "var(--text-muted)" }}>₹{Number(e.amount).toLocaleString("en-IN")} · {e.note}</span>
                  <span className="meta shrink-0">{e.status}</span>
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
                <input name="amount" type="number" min="1" step="any" required placeholder="Amount (₹)" style={input} aria-label="Amount" />
                <input name="note" required minLength={3} maxLength={1000} placeholder="What is this for?" style={input} aria-label="Note" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select name="headId" style={input} aria-label="Budget head" defaultValue="">
                  <option value="">No budget head</option>
                  {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <select name="departmentId" style={input} aria-label="Department" defaultValue="">
                  <option value="">Society-wide</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <button className="btn-ink !py-2 text-sm">Propose expense</button>
            </form>
          </section>

          <section aria-label="Sponsorship pipeline">
            <Meta>Sponsorship pipeline</Meta>
            {sponsorships.length === 0 ? (
              <p className="narrative mt-3">No sponsors in the pipeline yet. Add the first conversation below — pipeline → committed → received.</p>
            ) : (
              <ul className="mt-3 divide-y rounded-2xl border" style={{ borderColor: "var(--line)" }}>
                {sponsorships.map((s) => (
                  <li key={s.id} className="flex items-baseline justify-between gap-3 p-4">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
                      <span className="meta">₹{Number(s.amount).toLocaleString("en-IN")}{s.contact ? ` · ${s.contact}` : ""}</span>
                    </span>
                    <span className="meta shrink-0">{s.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={addSponsorship} className="mt-4 grid gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <strong className="text-sm" style={{ color: "var(--text)" }}>Add a sponsor</strong>
              <input name="name" required minLength={2} maxLength={200} placeholder="Sponsor name" style={input} aria-label="Sponsor name" />
              <div className="grid grid-cols-3 gap-3">
                <input name="amount" type="number" min="0" step="any" defaultValue={0} style={input} aria-label="Amount" />
                <select name="status" style={input} aria-label="Status" defaultValue="pipeline">
                  <option value="pipeline">pipeline</option>
                  <option value="committed">committed</option>
                  <option value="received">received</option>
                </select>
                <input name="contact" maxLength={300} placeholder="Contact" style={input} aria-label="Contact" />
              </div>
              <button className="btn-ink !py-2 text-sm">Add sponsor</button>
            </form>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
