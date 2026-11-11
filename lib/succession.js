// One read model for succession: checklist, handover briefs, transfer flags
// and leadership terms in a single outstanding-first list.
//
// The four sources used to live on separate screens, so "what is still
// untransferred?" had no single answer. These queries are sequential (pooler
// rule) and every row carries an owner; an item with no recorded owner is
// returned as "Unassigned" rather than disappearing.
import { scope } from "@/lib/tenant-scope";

export const TERM_HORIZON_DAYS = 45;

const ROLE_LABELS = {
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Super Admin"
};

const KIND_PRIORITY = {
  term: 0,
  handover: 1,
  checklist: 2
};

const STATUS_PRIORITY = {
  expired: 0,
  rejected: 1,
  ending: 2,
  draft: 3,
  outstanding: 4,
  submitted: 5
};

function dayDiff(iso) {
  if (!iso) return null;
  const end = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(end)) return null;
  const today = new Date();
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.ceil((end - start) / 86400000);
}

function termStatus(end) {
  const days = dayDiff(end);
  if (days === null) return { status: "none", days: null };
  if (days < 0) return { status: "expired", days };
  if (days <= TERM_HORIZON_DAYS) return { status: "ending", days };
  return { status: "active", days };
}

function handoverFlags(handover) {
  return {
    planner: handover.transfer_planner === true,
    eventOps: handover.transfer_event_ops === true,
    headSlot: handover.transfer_head_slot === true
  };
}

function handoverOutstanding(handover) {
  const out = [];
  if (!String(handover.brief?.summary || "").trim()) out.push("Brief: what the role owns");
  if (!String(handover.brief?.responsibilities || "").trim()) out.push("Brief: what is in flight");
  if (handover.status === "draft") out.push("Not submitted for admin approval");
  if (handover.status === "rejected") out.push("Sent back by admin; revise and resubmit");
  if (handover.status === "submitted") out.push("Admin approval pending");
  const flags = handoverFlags(handover);
  if (!flags.planner && !flags.eventOps && !flags.headSlot) {
    out.push("No transfer flags selected");
  }
  return out;
}

function ownerOf(row) {
  return {
    id: row.owner_id || null,
    name: row.owner_name || "Unassigned"
  };
}

export async function loadSuccessionOverview({ sql, tenantId, horizonDays = TERM_HORIZON_DAYS }) {
  const tid = scope(tenantId);

  const checklist = await sql`
    SELECT hc.*, p.name AS owner_name, d.name AS department_name
    FROM handover_checklists hc
    LEFT JOIN profiles p ON p.user_id = hc.owner_id AND p.tenant_id = hc.tenant_id
    LEFT JOIN departments d ON d.id = hc.department_id AND d.tenant_id = hc.tenant_id
    WHERE hc.tenant_id = ${tid}::uuid
    ORDER BY hc.done ASC, hc.category ASC, hc.created_at ASC
  `;

  const handovers = await sql`
    SELECT h.*, fp.name AS from_name, tp.name AS to_name, d.name AS department_name,
      fp.role_term_end AS from_term_end
    FROM lead_handovers h
    LEFT JOIN profiles fp ON fp.user_id = h.from_user_id
    LEFT JOIN profiles tp ON tp.user_id = h.to_user_id
    LEFT JOIN departments d ON d.id = h.department_id
    WHERE h.tenant_id = ${tid}::uuid
      AND h.status IN ('draft', 'submitted', 'rejected')
    ORDER BY h.updated_at DESC
    LIMIT 50
  `;

  const terms = await sql`
    SELECT p.user_id, p.name, p.role, p.role_term_end,
      EXISTS (
        SELECT 1 FROM platform_admins pa
        WHERE pa.user_id = p.user_id AND pa.is_founder = true
      ) AS is_founder
    FROM profiles p
    WHERE p.tenant_id = ${tid}::uuid
      AND p.role IN ('dept_lead', 'vertical_lead', 'admin')
      AND p.account_status = 'active'
      AND p.role_term_end IS NOT NULL
      AND p.role_term_end <= (CURRENT_DATE + (${horizonDays}::int * INTERVAL '1 day'))
    ORDER BY p.role_term_end ASC
    LIMIT 50
  `;

  const items = [];

  for (const term of terms) {
    if (term.is_founder) continue;
    const info = termStatus(term.role_term_end);
    items.push({
      id: `term:${term.user_id}`,
      kind: "term",
      title: `${term.name || term.user_id} / ${ROLE_LABELS[term.role] || term.role}`,
      owner: { id: term.user_id, name: term.name || term.user_id },
      status: info.status,
      due_on: String(term.role_term_end).slice(0, 10),
      days_remaining: info.days,
      outstanding: [info.status === "expired" ? "Term has ended; authority is suspended" : "Term ends soon; hand over the seat"],
      brief: null,
      flags: null,
      department_name: null,
      role: term.role
    });
  }

  for (const handover of handovers) {
    const outstanding = handoverOutstanding(handover);
    if (outstanding.length === 0) continue;
    const info = termStatus(handover.from_term_end);
    items.push({
      id: `handover:${handover.id}`,
      kind: "handover",
      title: `${handover.from_name || handover.from_user_id} -> ${handover.to_name || "successor"}`,
      owner: {
        id: handover.from_user_id,
        name: handover.from_name || handover.from_user_id
      },
      status: handover.status,
      due_on: handover.from_term_end ? String(handover.from_term_end).slice(0, 10) : null,
      days_remaining: info.days,
      outstanding,
      brief: handover.brief || {},
      flags: handoverFlags(handover),
      department_name: handover.department_name || null,
      role: handover.role
    });
  }

  for (const item of checklist) {
    if (item.done) continue;
    items.push({
      id: `checklist:${item.id}`,
      kind: "checklist",
      title: item.title,
      owner: ownerOf(item),
      status: "outstanding",
      due_on: null,
      days_remaining: null,
      outstanding: [item.detail || "Not transferred"],
      brief: null,
      flags: null,
      category: item.category,
      department_name: item.department_name || null,
      department_id: item.department_id || null,
      role: null
    });
  }

  items.sort((a, b) => {
    const ak = KIND_PRIORITY[a.kind] ?? 9;
    const bk = KIND_PRIORITY[b.kind] ?? 9;
    const as = STATUS_PRIORITY[a.status] ?? 9;
    const bs = STATUS_PRIORITY[b.status] ?? 9;
    if (as !== bs) return as - bs;
    if (ak !== bk) return ak - bk;
    if (a.due_on && b.due_on) return a.due_on.localeCompare(b.due_on);
    if (a.due_on) return -1;
    if (b.due_on) return 1;
    return a.title.localeCompare(b.title);
  });

  const checklistDone = checklist.filter((item) => item.done).length;
  return {
    generated_at: new Date().toISOString(),
    horizon_days: horizonDays,
    summary: {
      checklist_total: checklist.length,
      checklist_done: checklistDone,
      checklist_outstanding: checklist.length - checklistDone,
      handovers_open: handovers.length,
      terms_expiring: terms.filter((term) => !term.is_founder).length,
      outstanding_items: items.length
    },
    items,
    checklist,
    handovers,
    terms
  };
}
