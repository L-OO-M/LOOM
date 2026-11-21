import { describe, expect, it } from "vitest";
import { can, isAdmin, ACTIONS } from "@/lib/permissions";

const D1 = "dept-1";
const lead = (level, departmentId = D1, departmentSlug = "web") => ({
  id: "u-lead", role: "dept_lead", vertical: "technical",
  memberships: [{ department_id: departmentId, level, department_slug: departmentSlug }]
});
const vlead = (vertical = "technical") => ({ id: "u-v", role: "vertical_lead", vertical, memberships: [] });
const core = (id = "u-core") => ({ id, role: "core", vertical: null, memberships: [] });
const student = (id = "u-stu", memberships = []) => ({ id, role: "student", vertical: null, memberships });
const admin = () => ({ id: "u-admin", role: "admin", vertical: null, memberships: [] });

describe("permissions matrix (Website Plan Section 3)", () => {
  it("covers all 48 matrix rows", () => {
    // 20 plan rows, verify_evidence from the ranking redesign, the 6 lead-tool
    // actions (view_lead_tools, manage_mou, manage_leads, manage_event_ops,
    // view_assets, manage_assets), and the chapter-wide contest/handover tools.
    // New: create_event_documentation, upload_roadmap, manage_event_tasks,
    // view_assigned_event_tasks, approve_event, view_event_budget,
    // manage_sponsorship_finance, register_event, submit_project, edit_own_profile,
    // draft_announcement, publish_announcement, help:request,
    // manage_sponsorship_leads, manage_outreach_leads, manage_promotional_campaigns,
    // manage_social_content, check_in_attendees, and the five department-work
    // rows (manage_department_tasks, update_assigned_department_task,
    // verify_department_work, manage_department_roster, view_department_tasks).
    // The count is asserted rather than left open because ACTIONS is the
    // authority for every gate in the app -- a row added without a test is a
    // row nobody has checked.
    expect(ACTIONS).toHaveLength(48);
  });

  it("confirms evidence only to admin and platform_admin", () => {
    // A confirmation is what puts points on a public board, so nothing below
    // admin may do it. These assertions are the check on that: if the switch
    // statement ever falls through to `ok`, they fail here.
    for (const role of ["student", "core", "dept_lead", "vertical_lead"]) {
      expect(can({ role, memberships: [{ department_id: D1, level: "dept_lead" }] }, "verify_evidence").ok).toBe(false);
    }
    expect(can(admin(), "verify_evidence").ok).toBe(true);
    expect(can({ role: "platform_admin" }, "verify_evidence").ok).toBe(true);
  });

  it("rejects unknown users and actions", () => {
    expect(can(null, "manage_users").ok).toBe(false);
    expect(can(student(), "fly_spaceship").ok).toBe(false);
    expect(can({ role: "ghost" }, "manage_users").ok).toBe(false);
  });

  it("Super Admin is unrestricted", () => {
    for (const a of ACTIONS) expect(can(admin(), a, { departmentId: D1 }).ok).toBe(true);
    expect(isAdmin(admin())).toBe(true);
    expect(isAdmin(student())).toBe(false);
  });

  it("manage_users: admin only — leads never reassign roles", () => {
    expect(can(admin(), "manage_users").ok).toBe(true);
    // Governance: only admins appoint people. A vertical lead cannot create or
    // edit accounts, even inside their own vertical.
    expect(can(vlead(), "manage_users", { vertical: "technical" }).ok).toBe(false);
    expect(can(vlead(), "manage_users").ok).toBe(false);
    expect(can(lead("dept_lead"), "manage_users", { departmentId: D1 }).ok).toBe(false);
    expect(can(core(), "manage_users").ok).toBe(false);
  });

  it("Head and Co-Head share one tier: identical permissions", () => {
    // Both head and co-head are level dept_lead in memberships — the system
    // must not distinguish them.
    const head = lead("dept_lead");
    const cohead = lead("dept_lead");
    for (const a of ACTIONS) {
      expect(can(cohead, a, { departmentId: D1 })).toEqual(can(head, a, { departmentId: D1 }));
    }
  });

  it("reads the membership slug the auth query actually returns", () => {
    // Real sessions attach `slug`; older fixtures used `department_slug`. The
    // matrix shipped reading only the latter, so every department-specific
    // action silently denied its own head against production data.
    const real = {
      id: "u-real", role: "dept_lead", vertical: "non_technical",
      memberships: [{ department_id: "d-design", level: "dept_lead", slug: "design" }]
    };
    expect(can(real, "manage_assets").ok).toBe(true);
    expect(can(real, "manage_social_content").ok).toBe(true); // limited
    expect(can(real, "manage_event_ops").ok).toBe(false);
  });

  it("dept content/roadmap/workshops: own dept only", () => {
    for (const a of ["edit_dept_content", "upload_roadmap", "post_workshop_dept"]) {
      expect(can(lead("dept_lead"), a, { departmentId: D1 }).ok).toBe(true);
      expect(can(lead("dept_lead"), a, { departmentId: "other" }).ok).toBe(false);
      // A head of exactly one department is acting for it even without a scope:
      // the Lead console does not name a department on every button.
      expect(can(lead("dept_lead"), a).ok).toBe(true);
      expect(can(core(), a).ok).toBe(false);
    }
  });

  it("a head of several departments must name one", () => {
    const multi = {
      id: "u-multi", role: "dept_lead", vertical: "technical",
      memberships: [
        { department_id: "d-web", level: "dept_lead", slug: "web" },
        { department_id: "d-design", level: "dept_lead", slug: "design" }
      ]
    };
    // Ambiguous scope: no department is guessed.
    expect(can(multi, "manage_assets").ok).toBe(false);
    // Named scope resolves each identity independently.
    expect(can(multi, "manage_assets", { departmentSlug: "design" }).ok).toBe(true);
    expect(can(multi, "manage_assets", { departmentSlug: "web" }).ok).toBe(false);
    expect(can(multi, "edit_dept_content", { departmentId: "d-web" }).ok).toBe(true);
  });

  it("society-wide events: dept_lead posts into an approval queue", () => {
    expect(can(admin(), "post_event_society").ok).toBe(true);
    expect(can(vlead(), "post_event_society").ok).toBe(true);
    const r = can(lead("dept_lead"), "post_event_society", { departmentId: D1 });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("needs_approval");
    expect(can(lead("dept_lead"), "post_event_society", { departmentId: "other" }).ok).toBe(false);
    expect(can(core(), "post_event_society").ok).toBe(false);
  });

  it("budgets: approve is admin-only, vertical recommends", () => {
    expect(can(admin(), "approve_budget").ok).toBe(true);
    const r = can(vlead(), "approve_budget");
    expect(r.ok).toBe(false);
    expect(r.note).toBe("recommend_only");
    expect(can(lead("dept_lead"), "approve_budget", { departmentId: D1 }).ok).toBe(false);
  });

  it("finance records: admin + own vertical only", () => {
    expect(can(admin(), "view_finance").ok).toBe(true);
    expect(can(vlead(), "view_finance", { vertical: "technical" }).ok).toBe(true);
    expect(can(vlead(), "view_finance", { vertical: "non_technical" }).ok).toBe(false);
    expect(can(lead("dept_lead"), "view_finance", { departmentId: D1 }).ok).toBe(false);
  });

  it("mentors: vertical oversees its own domain, dept_lead assigns in own dept", () => {
    // A vertical lead's oversight is domain-bound — no blank scope, no grant.
    expect(can(vlead(), "assign_mentor", { vertical: "technical" }).ok).toBe(true);
    expect(can(vlead(), "assign_mentor").ok).toBe(false);
    expect(can(vlead("non_technical"), "assign_mentor", { vertical: "technical" }).ok).toBe(false);
    expect(can(lead("dept_lead"), "assign_mentor", { departmentId: D1 }).ok).toBe(true);
    expect(can(lead("dept_lead"), "assign_mentor", { departmentId: "other" }).ok).toBe(false);
    expect(can(core(), "assign_mentor").ok).toBe(false);
  });

  it("contributions: leads log for dept, core logs own only", () => {
    expect(can(lead("dept_lead"), "log_contribution", { departmentId: D1 }).ok).toBe(true);
    const r = can(core("u-core"), "log_contribution", { ownerId: "u-core" });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_only");
    expect(can(core("u-core"), "log_contribution", { ownerId: "someone-else" }).ok).toBe(false);
    expect(can(student("u-stu"), "log_contribution", { ownerId: "u-stu" }).ok).toBe(false);
  });

  it("everyone registers, submits, and edits their own profile", () => {
    for (const u of [admin(), vlead(), lead("dept_lead"), core(), student()]) {
      expect(can(u, "register_event").ok).toBe(true);
      expect(can(u, "submit_project").ok).toBe(true);
      expect(can(u, "edit_own_profile").ok).toBe(true);
    }
  });

  it("roster: department heads see their own department only", () => {
    const r = can(lead("dept_lead"), "view_roster", { departmentId: D1 });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_only");
    // Sole-lead fallback: the head's own department resolves without a scope.
    expect(can(lead("dept_lead"), "view_roster").ok).toBe(true);
    // Another department's roster is not theirs.
    expect(can(lead("dept_lead"), "view_roster", { departmentId: "other" }).ok).toBe(false);
    // A core member is not a department head: no roster.
    expect(can(core(), "view_roster", { departmentId: D1 }).ok).toBe(false);
    const member = student("u-stu", [{ department_id: D1, level: "general" }]);
    expect(can(member, "view_roster", { departmentId: D1 }).ok).toBe(false);
  });

  it("check-in: only the event's own department, its vertical, or admin", () => {
    // The event belongs to D1.
    expect(can(lead("dept_lead"), "check_in_attendees", { departmentId: D1 }).ok).toBe(true);
    expect(can(lead("dept_lead"), "check_in_attendees", { departmentId: "other" }).ok).toBe(false);
    // A society-wide event (explicit null department) is not any head's door.
    expect(can(lead("dept_lead"), "check_in_attendees", { departmentId: null }).ok).toBe(false);
    expect(can(vlead(), "check_in_attendees", { vertical: "technical" }).ok).toBe(true);
    expect(can(vlead(), "check_in_attendees", { vertical: "non_technical" }).ok).toBe(false);
    expect(can(core(), "check_in_attendees").ok).toBe(false);
    expect(can(admin(), "check_in_attendees").ok).toBe(true);
  });

  it("directory: vertical full, dept_lead limited, rest denied", () => {
    expect(can(vlead(), "view_directory").ok).toBe(true);
    const r = can(lead("dept_lead"), "view_directory");
    expect(r.ok).toBe(true);
    expect(r.note).toBe("limited");
    expect(can(core(), "view_directory").ok).toBe(false);
    expect(can(student(), "view_directory").ok).toBe(false);
  });

  it("announcements: vertical society-wide, dept_lead own feed", () => {
    expect(can(vlead(), "post_announcement").ok).toBe(true);
    const r = can(lead("dept_lead"), "post_announcement", { departmentId: D1 });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_feed");
    expect(can(lead("dept_lead"), "post_announcement", { departmentId: "other" }).ok).toBe(false);
    expect(can(core(), "post_announcement").ok).toBe(false);
  });

  it("static pages admin-only; FAQ suggest for vertical", () => {
    expect(can(admin(), "edit_static").ok).toBe(true);
    expect(can(vlead(), "edit_static").ok).toBe(false);
    expect(can(admin(), "manage_faq").ok).toBe(true);
    const r = can(vlead(), "manage_faq");
    expect(r.ok).toBe(false);
    expect(r.note).toBe("suggest_only");
    expect(can(lead("dept_lead"), "manage_faq").ok).toBe(false);
  });

  it("suspension: admin direct, vertical own-vertical with sign-off", () => {
    expect(can(admin(), "suspend_member").ok).toBe(true);
    const r = can(vlead(), "suspend_member", { vertical: "technical" });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("needs_signoff");
    expect(can(vlead(), "suspend_member", { vertical: "non_technical" }).ok).toBe(false);
    expect(can(lead("dept_lead"), "suspend_member", { departmentId: D1 }).ok).toBe(false);
  });

  it("reports: vertical full, dept_lead own dept", () => {
    expect(can(vlead(), "export_reports").ok).toBe(true);
    const r = can(lead("dept_lead"), "export_reports", { departmentId: D1 });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_only");
    expect(can(lead("dept_lead"), "export_reports", { departmentId: "other" }).ok).toBe(false);
    expect(can(core(), "export_reports").ok).toBe(false);
  });

  it("advisor comms: admin owns, vertical views its own domain", () => {
    expect(can(admin(), "manage_advisor").ok).toBe(true);
    const r = can(vlead(), "manage_advisor", { vertical: "technical" });
    expect(r.ok).toBe(false);
    expect(r.note).toBe("view_only");
    // Outside the vertical there is not even read standing.
    expect(can(vlead(), "manage_advisor", { vertical: "non_technical" }).note).toBeNull();
  });

  it("lead tools: department-specific permissions", () => {
    // manage_mou: Sponsorship, PR, vertical, admin
    expect(can(admin(), "manage_mou").ok).toBe(true);
    expect(can(vlead(), "manage_mou", { vertical: "technical" }).ok).toBe(true);
    // Sponsorship lead
    expect(can(lead("dept_lead", D1, "sponsorship"), "manage_mou", { departmentId: D1 }).ok).toBe(true);
    // PR lead
    expect(can(lead("dept_lead", D1, "public_relations"), "manage_mou", { departmentId: D1 }).ok).toBe(true);
    // Other dept leads should not have manage_mou
    expect(can(lead("dept_lead", D1, "web"), "manage_mou", { departmentId: D1 }).ok).toBe(false);
    expect(can(core(), "manage_mou").ok).toBe(false);
    expect(can(student(), "manage_mou").ok).toBe(false);

    // manage_leads: deprecated (but admin still has unrestricted access)
    expect(can(admin(), "manage_leads").ok).toBe(true);
    expect(can(admin(), "manage_leads").note).toContain("deprecated");
    expect(can(vlead(), "manage_leads", { vertical: "technical" }).ok).toBe(false);
    expect(can(lead("dept_lead"), "manage_leads", { departmentId: D1 }).ok).toBe(false);
    expect(can(core(), "manage_leads").ok).toBe(false);
    expect(can(student(), "manage_leads").ok).toBe(false);

    // manage_event_ops: Management, vertical, admin
    expect(can(admin(), "manage_event_ops").ok).toBe(true);
    expect(can(vlead(), "manage_event_ops", { vertical: "technical" }).ok).toBe(true);
    expect(can(lead("dept_lead", D1, "management"), "manage_event_ops", { departmentId: D1 }).ok).toBe(true);
    expect(can(lead("dept_lead", D1, "web"), "manage_event_ops", { departmentId: D1 }).ok).toBe(false);
    expect(can(core(), "manage_event_ops").ok).toBe(false);
    expect(can(student(), "manage_event_ops").ok).toBe(false);

    // manage_assets: Design, SMM, vertical, admin
    expect(can(admin(), "manage_assets").ok).toBe(true);
    expect(can(vlead(), "manage_assets", { vertical: "technical" }).ok).toBe(true);
    expect(can(lead("dept_lead", D1, "design"), "manage_assets", { departmentId: D1 }).ok).toBe(true);
    expect(can(lead("dept_lead", D1, "smm_content"), "manage_assets", { departmentId: D1 }).ok).toBe(true);
    expect(can(lead("dept_lead", D1, "web"), "manage_assets", { departmentId: D1 }).ok).toBe(false);
    expect(can(core(), "manage_assets").ok).toBe(false);
    expect(can(student(), "manage_assets").ok).toBe(false);
  });

  it("lead tools read access: core view-only, students denied", () => {
    for (const a of ["view_lead_tools", "view_assets"]) {
      expect(can(admin(), a).ok).toBe(true);
      expect(can(vlead(), a, { vertical: "technical" }).ok).toBe(true);
      const r = can(core(), a);
      expect(r.ok).toBe(true);
      expect(r.note).toBe("view_only");
      expect(can(student(), a).ok).toBe(false);
    }
  });

  it("chapter programs: department-specific permissions", () => {
    // manage_contests: technical dept leads, vertical, admin
    expect(can(admin(), "manage_contests").ok).toBe(true);
    expect(can(vlead(), "manage_contests", { vertical: "technical" }).ok).toBe(true);
    // Technical dept leads
    for (const slug of ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"]) {
      expect(can(lead("dept_lead", D1, slug), "manage_contests", { departmentId: D1 }).ok).toBe(true);
    }
    // Non-technical dept leads should not have manage_contests
    for (const slug of ["design", "documentation", "smm_content", "publicity", "sponsorship", "management", "public_relations"]) {
      expect(can(lead("dept_lead", D1, slug), "manage_contests", { departmentId: D1 }).ok).toBe(false);
    }
    expect(can(core(), "manage_contests").ok).toBe(false);
    expect(can(student(), "manage_contests").ok).toBe(false);

    // manage_handover: all dept leads, admin
    for (const slug of ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded", "design", "documentation", "smm_content", "publicity", "sponsorship", "management", "public_relations"]) {
      expect(can(lead("dept_lead", D1, slug), "manage_handover", { departmentId: D1 }).ok).toBe(true);
    }
    expect(can(admin(), "manage_handover").ok).toBe(true);
    expect(can(core(), "manage_handover").ok).toBe(false);
    expect(can(student(), "manage_handover").ok).toBe(false);
  });
});

describe("department work board", () => {
  const dept = { departmentId: D1 };

  it("heads run their own board and nothing else", () => {
    for (const a of ["manage_department_tasks", "verify_department_work", "manage_department_roster"]) {
      expect(can(lead("dept_lead"), a, dept).ok).toBe(true);
      expect(can(lead("dept_lead"), a, { departmentId: "other" }).ok).toBe(false);
      // A core member of the department is not a head.
      expect(can(core(), a, dept).ok).toBe(false);
    }
  });

  it("a vertical lead oversees tasks in its own vertical only", () => {
    expect(can(vlead(), "manage_department_tasks", { vertical: "technical" }).ok).toBe(true);
    expect(can(vlead("non_technical"), "manage_department_tasks", { vertical: "technical" }).ok).toBe(false);
    // Roster stays inside the department: a vertical lead appoints nobody.
    expect(can(vlead(), "manage_department_roster", { vertical: "technical" }).ok).toBe(false);
  });

  it("an assignee can move their own task, and nobody else's", () => {
    const assignee = core("u-core");
    expect(can(assignee, "update_assigned_department_task", { ...dept, assigneeId: "u-core" }).ok).toBe(true);
    expect(can(assignee, "update_assigned_department_task", { ...dept, assigneeId: "u-other" }).ok).toBe(false);
    // Reading own work survives losing the membership: scope names the assignee.
    const removed = student("u-removed", []);
    const r = can(removed, "view_department_tasks", { ...dept, assigneeId: "u-removed" });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_only");
  });

  it("department members read the board, outsiders do not", () => {
    const member = student("u-stu", [{ department_id: D1, level: "general", slug: "web" }]);
    const r = can(member, "view_department_tasks", dept);
    expect(r.ok).toBe(true);
    expect(r.note).toBeNull();
    expect(can(student("u-out", []), "view_department_tasks", dept).ok).toBe(false);
  });

  it("head and co-head have identical board powers", () => {
    const head = lead("dept_lead");
    const cohead = { ...lead("dept_lead"), id: "u-cohead" };
    for (const a of ["manage_department_tasks", "verify_department_work", "manage_department_roster", "view_department_tasks"]) {
      expect(can(cohead, a, dept)).toEqual(can(head, a, dept));
    }
  });
});
