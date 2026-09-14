// Website Plan's 5 levels: student (General) < core < dept_lead (Head and
// Co-Head share one tier) < vertical_lead < admin (Super Admin).
// Mentorship capability is NOT a role — it derives from an approved
// mentor_applications row + the mentor bar (lib/mentorship.js).
export const roles = {
  student: ["student"],
  core: ["core", "student"],
  dept_lead: ["dept_lead", "core", "student"],
  vertical_lead: ["vertical_lead", "dept_lead", "core", "student"],
  admin: ["admin", "vertical_lead", "dept_lead", "core", "student"],
  platform_admin: ["platform_admin", "admin", "vertical_lead", "dept_lead", "core", "student"]
};

export function hasRole(user, requiredRole) {
  if (!user || !requiredRole) return false;
  return roles[user.role]?.includes(requiredRole) ?? false;
}

/** Where each level lands after sign-in. Leads open their console, admins
 *  the overview — everyone else the student home. Layouts still enforce
 *  access, so this is convenience, never a gate. */
export function homeForRole(role) {
  if (role === "admin" || role === "platform_admin") return "/admin";
  if (role === "dept_lead" || role === "vertical_lead") return "/lead";
  return "/student";
}

export function requireRole(user, requiredRole) {
  if (!hasRole(user, requiredRole)) {
    return { ok: false, code: "FORBIDDEN", message: "The current user cannot perform this action" };
  }
  return { ok: true };
}