/**
 * People operations: per-role checklists and account-status vocabulary.
 *
 * Templates are code, completion is data. A row in `people_checklist_items` is
 * only written when a human ticks an item, so adding an item later simply shows
 * up unchecked instead of requiring a migration or a backfill.
 */

export const ACCOUNT_STATUSES = ["active", "suspended", "deactivated"];

export const CHECKLIST_KINDS = ["onboarding", "offboarding"];

export const PEOPLE_ROLES = ["student", "core", "dept_lead", "vertical_lead", "admin"];

const ONBOARDING_BASE = [
  { key: "profile_complete", label: "Profile complete", detail: "Name, branch, year, roll number and primary domain are filled in." },
  { key: "consent_signed", label: "Terms and privacy accepted", detail: "The current policy versions are on record." },
  { key: "github_linked", label: "GitHub connected", detail: "The account is linked so activity can be verified." },
  { key: "department_joined", label: "Department joined", detail: "At least one department membership exists." }
];

const ONBOARDING_BY_ROLE = {
  student: [
    { key: "roadmap_started", label: "Roadmap started", detail: "The member has opened their path and picked a first step." }
  ],
  core: [
    { key: "core_orientation", label: "Core orientation", detail: "Walked through the chapter's operating rhythms and expectations." },
    { key: "first_contribution", label: "First contribution logged", detail: "A project, event, or community contribution is on record." }
  ],
  dept_lead: [
    { key: "handover_brief", label: "Handover brief read", detail: "Inherited the previous Head's open items and calendar." },
    { key: "budget_brief", label: "Budget brief read", detail: "Understands the department's budget head and spending rules." },
    { key: "roster_reviewed", label: "Department roster reviewed", detail: "Every member has a role and a next step." }
  ],
  vertical_lead: [
    { key: "vertical_plan", label: "Vertical plan agreed", detail: "The vertical's semester plan is written down." },
    { key: "dept_intros", label: "Department Heads introduced", detail: "Met every Head in the vertical." },
    { key: "budget_brief", label: "Budget brief read", detail: "Understands finance scope and sponsorship rules." }
  ],
  admin: [
    { key: "admin_walkthrough", label: "Admin walkthrough", detail: "Roles, terms, and the audit log were reviewed together." },
    { key: "finance_review", label: "Finance review", detail: "Budget heads, expenses, and sponsorships were checked." },
    { key: "mentor_ops_review", label: "Mentor operations review", detail: "Open sessions and candidacies were triaged." }
  ]
};

const OFFBOARDING_BASE = [
  { key: "handover_filed", label: "Handover filed", detail: "Open work, owners and deadlines are written down." },
  { key: "access_reviewed", label: "Access reviewed", detail: "Chapter-specific access and integrations are accounted for." },
  { key: "assets_returned", label: "Assets returned", detail: "Creative assets and documents are back in the library." },
  { key: "sessions_closed", label: "Mentor sessions closed", detail: "No requested or scheduled sessions are left hanging." }
];

const OFFBOARDING_BY_ROLE = {
  student: [],
  core: [
    { key: "reports_submitted", label: "Contribution report submitted", detail: "The member's logged work is complete and exported." }
  ],
  dept_lead: [
    { key: "successor_named", label: "Successor named", detail: "A replacement Head or Co-Head is proposed." },
    { key: "budget_settled", label: "Department budget settled", detail: "Expenses are paid or recorded, and the budget head is reassigned." }
  ],
  vertical_lead: [
    { key: "successor_named", label: "Successor named", detail: "A replacement Vertical Lead is proposed." },
    { key: "budget_settled", label: "Vertical finance settled", detail: "Sponsorships and expenses are handed over." }
  ],
  admin: [
    { key: "successor_named", label: "Successor named", detail: "Another admin can take over the chapter." },
    { key: "audit_exported", label: "Audit exported", detail: "The final audit slice is saved for the chapter record." },
    { key: "credentials_rotated", label: "Shared credentials rotated", detail: "Any shared secrets the account could reach are rotated." }
  ]
};

export function normalizePeopleRole(role) {
  return PEOPLE_ROLES.includes(role) ? role : "student";
}

export function checklistTemplate(role, kind) {
  const safeRole = normalizePeopleRole(role);
  if (kind === "onboarding") {
    return [...ONBOARDING_BASE, ...(ONBOARDING_BY_ROLE[safeRole] || [])];
  }
  if (kind === "offboarding") {
    return [...OFFBOARDING_BASE, ...(OFFBOARDING_BY_ROLE[safeRole] || [])];
  }
  return [];
}

/**
 * Merge a template with completion rows. `rows` may come from the DB or from
 * tests; only `item_key` and `done` matter. Duplicate keys are de-duplicated so
 * a base + role collision cannot render twice.
 */
export function checklistProgress(rows, role, kind) {
  const doneKeys = new Set(
    (Array.isArray(rows) ? rows : [])
      .filter((r) => r && r.done !== false && (r.kind === undefined || r.kind === kind))
      .map((r) => r.item_key)
  );
  const seen = new Set();
  const items = checklistTemplate(role, kind)
    .filter((item) => {
      if (seen.has(item.key)) return false;
      seen.add(item.key);
      return true;
    })
    .map((item) => ({ ...item, done: doneKeys.has(item.key) }));
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  return {
    kind,
    role: normalizePeopleRole(role),
    items,
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
    outstanding: items.filter((i) => !i.done)
  };
}

export function canDeactivate(progress) {
  return !progress || progress.outstanding.length === 0;
}

export function statusLabel(status) {
  if (status === "suspended") return "Suspended";
  if (status === "deactivated") return "Deactivated";
  return "Active";
}
