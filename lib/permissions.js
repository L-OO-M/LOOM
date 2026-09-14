/**
 * Permissions — the Website Plan's Section 3 matrix, as data.
 *
 * Five levels: student (General) < core < dept_lead (Head = Co-Head, one
 * tier) < vertical_lead < admin (Super Admin). platform_admin implies admin.
 *
 * can(user, action, scope) -> { ok, note }. `note` carries the matrix's
 * yellow cells: needs_approval, needs_signoff, recommend_only, suggest_only,
 * view_only, limited (name+dept directory), own_feed, own_only.
 *
 * user:  { id, role, vertical: 'technical'|'non_technical'|null,
 *          memberships: [{ department_id, level }] }
 * scope: { departmentId?, vertical?, ownerId? }
 *
 * Pure function — no DB. Callers load memberships and pass them in.
 * (getRequestContext membership attachment lands with the membership APIs.)
 */

export const ROLES = ["student", "core", "dept_lead", "vertical_lead", "admin", "platform_admin"];

const RANK = { student: 0, core: 1, dept_lead: 2, vertical_lead: 3, admin: 4, platform_admin: 5 };

export const ACTIONS = [
  "manage_users",        // change roles/departments, deactivate
  "edit_dept_content",   // roadmap, resources, workshop calendar
  "post_event_society",  // society-wide events
  "post_workshop_dept",  // own-dept sessions
  "approve_budget",      // budgets / sponsorship spend
  "view_finance",        // sponsor & finance records
  "upload_roadmap",      // learning roadmaps / resources
  "assign_mentor",       // match mentors to juniors
  "log_contribution",    // log a member's project/competition work
  "edit_own_profile",    // own profile / contribution log
  "view_roster",         // department roster
  "view_directory",      // society-wide member directory
  "register_event",      // sign up for events/workshops
  "submit_project",      // mini-project / hackathon entries
  "post_announcement",   // announcements
  "edit_static",         // About Us / static pages
  "manage_faq",          // FAQ content
  "suspend_member",      // remove / suspend a member
  "export_reports",      // semester / annual reports
  "manage_advisor"       // faculty advisor communications
];

const ok = (note = null) => ({ ok: true, note });
const no = (note = null) => ({ ok: false, note });

function rank(role) {
  return RANK[role] ?? -1;
}

function memberLevel(user, departmentId) {
  if (!departmentId || !Array.isArray(user?.memberships)) return null;
  return user.memberships.find((m) => m.department_id === departmentId)?.level ?? null;
}

export function can(user, action, scope = {}) {
  if (!user || !ACTIONS.includes(action)) return no();
  const r = rank(user.role);
  if (r < 0) return no();

  // Super Admin: unrestricted. Platform admin inherits.
  if (r >= RANK.admin) return ok();
  const ownVertical = scope.vertical && user.vertical && user.vertical === scope.vertical;

  switch (action) {
    case "manage_users":
      if (user.role === "vertical_lead" && ownVertical) return ok();
      return no();

    case "edit_dept_content":
    case "upload_roadmap":
      if (user.role === "vertical_lead" && ownVertical) return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok();
      return no();

    case "post_event_society":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") {
        return { ok: true, note: "needs_approval" }; // EVM / Lead approval queue
      }
      return no();

    case "post_workshop_dept":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok();
      return no();

    case "approve_budget":
      if (user.role === "vertical_lead") return no("recommend_only");
      return no();

    case "view_finance":
      if (user.role === "vertical_lead" && ownVertical) return ok();
      return no();

    case "assign_mentor":
      if (user.role === "vertical_lead") return ok(); // oversight
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok();
      return no();

    case "log_contribution":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok();
      if (user.role === "core" && scope.ownerId && scope.ownerId === user.id) return ok("own_only");
      return no();

    case "edit_own_profile":
    case "register_event":
    case "submit_project":
      return ok(); // ownership checked by the route handler

    case "view_roster":
      if (r >= RANK.core) return ok();
      if (memberLevel(user, scope.departmentId)) return ok("own_only");
      return no();

    case "view_directory":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead") return ok("limited"); // name + dept only
      return no();

    case "post_announcement":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok("own_feed");
      return no();

    case "edit_static":
      return no();

    case "manage_faq":
      if (user.role === "vertical_lead") return no("suggest_only");
      return no();

    case "suspend_member":
      if (user.role === "vertical_lead" && ownVertical) return { ok: true, note: "needs_signoff" };
      return no();

    case "export_reports":
      if (user.role === "vertical_lead") return ok();
      if (user.role === "dept_lead" && memberLevel(user, scope.departmentId) === "dept_lead") return ok("own_only");
      return no();

    case "manage_advisor":
      if (user.role === "vertical_lead") return no("view_only");
      return no();

    default:
      return no();
  }
}

/** Legacy coarse gate: every existing `role === "admin"` boundary keeps
 *  working unchanged. New code should use can() with a real action. */
export function isAdmin(user) {
  return rank(user?.role) >= RANK.admin;
}
