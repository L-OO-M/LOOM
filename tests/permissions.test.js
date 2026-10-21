import { describe, expect, it } from "vitest";
import { can, isAdmin, ACTIONS } from "@/lib/permissions";

const D1 = "dept-1";
const lead = (level, departmentId = D1) => ({
  id: "u-lead", role: "dept_lead", vertical: "technical",
  memberships: [{ department_id: departmentId, level }]
});
const vlead = (vertical = "technical") => ({ id: "u-v", role: "vertical_lead", vertical, memberships: [] });
const core = (id = "u-core") => ({ id, role: "core", vertical: null, memberships: [] });
const student = (id = "u-stu", memberships = []) => ({ id, role: "student", vertical: null, memberships });
const admin = () => ({ id: "u-admin", role: "admin", vertical: null, memberships: [] });

describe("permissions matrix (Website Plan Section 3)", () => {
  it("covers all 29 matrix rows", () => {
    // 20 plan rows, verify_evidence from the ranking redesign, the 6 lead-tool
    // actions (view_lead_tools, manage_mou, manage_leads, manage_event_ops,
    // view_assets, manage_assets), and the chapter-wide contest/handover tools.
    // The count is asserted rather than left open because ACTIONS is the
    // authority for every gate in the app -- a row added without a test is a
    // row nobody has checked.
    expect(ACTIONS).toHaveLength(29);
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

  it("dept content/roadmap/workshops: own dept only", () => {
    for (const a of ["edit_dept_content", "upload_roadmap", "post_workshop_dept"]) {
      expect(can(lead("dept_lead"), a, { departmentId: D1 }).ok).toBe(true);
      expect(can(lead("dept_lead"), a, { departmentId: "other" }).ok).toBe(false);
      expect(can(lead("dept_lead"), a).ok).toBe(false);
      expect(can(core(), a, { departmentId: D1 }).ok).toBe(false);
    }
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

  it("roster: leads+core full, general members own dept only", () => {
    expect(can(lead("dept_lead"), "view_roster", { departmentId: D1 }).ok).toBe(true);
    expect(can(core(), "view_roster", { departmentId: D1 }).ok).toBe(true);
    const member = student("u-stu", [{ department_id: D1, level: "general" }]);
    const r = can(member, "view_roster", { departmentId: D1 });
    expect(r.ok).toBe(true);
    expect(r.note).toBe("own_only");
    expect(can(member, "view_roster", { departmentId: "other" }).ok).toBe(false);
    expect(can(student(), "view_roster", { departmentId: D1 }).ok).toBe(false);
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

  it("lead tools: leads edit, core reads only, students denied", () => {
    const manage = ["manage_mou", "manage_leads", "manage_event_ops", "manage_assets"];
    for (const a of manage) {
      expect(can(admin(), a).ok, `admin ${a}`).toBe(true);
      expect(can(vlead(), a).ok, `vlead ${a}`).toBe(true);
      expect(can(lead("dept_lead"), a, { departmentId: D1 }).ok, `head ${a}`).toBe(true);
      expect(can(core(), a).ok, `core ${a}`).toBe(false);
      expect(can(student(), a).ok, `student ${a}`).toBe(false);
    }
    // Read access is wider: core is explicitly view-only.
    for (const a of ["view_lead_tools", "view_assets"]) {
      expect(can(admin(), a).ok).toBe(true);
      expect(can(vlead(), a).ok).toBe(true);
      const r = can(core(), a);
      expect(r.ok).toBe(true);
      expect(r.note).toBe("view_only");
      expect(can(student(), a).ok).toBe(false);
    }
  });

  it("chapter programs: every lead tier manages, core and students don't", () => {
    for (const a of ["manage_contests", "manage_handover"]) {
      expect(can(admin(), a).ok).toBe(true);
      expect(can(vlead(), a).ok).toBe(true);
      expect(can(lead("dept_lead"), a, { departmentId: D1 }).ok).toBe(true);
      expect(can(core(), a).ok).toBe(false);
      expect(can(student(), a).ok).toBe(false);
    }
  });
});
