export const roles = {
  student: ["student"],
  mentor: ["mentor", "student"],
  admin: ["admin", "mentor", "student"],
  platform_admin: ["platform_admin", "admin", "mentor", "student"]
};

export function hasRole(user, requiredRole) {
  if (!user || !requiredRole) return false;
  return roles[user.role]?.includes(requiredRole) ?? false;
}

export function requireRole(user, requiredRole) {
  if (!hasRole(user, requiredRole)) {
    return { ok: false, code: "FORBIDDEN", message: "The current user cannot perform this action" };
  }
  return { ok: true };
}