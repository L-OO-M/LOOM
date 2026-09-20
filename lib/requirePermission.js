import { getRequestContext } from "@/lib/auth-server";
import { can, ROLES } from "@/lib/permissions";

// Strict permission guard — every mutation must go through this.
// Throws with code UNAUTHORIZED_401 / FORBIDDEN_403 so API routes can map to standard envelope.
export async function requireCan(permission, scope = {}) {
  const ctx = await getRequestContext();
  if (!ctx.user) {
    const e = new Error("Authentication required");
    e.code = "UNAUTHORIZED";
    e.status = 401;
    throw e;
  }
  // Allow new colon-style permissions (help:request, ranking:view) via role-tier mapping
  // while keeping matrix actions via can()
  const colonMap = {
    "help:request": "register_event", // any authenticated can request help (like register)
    "help:respond": "assign_mentor", // dept_lead+ can respond, student can respond if proven
    "help:manage": "manage_users",
    "ranking:view": "view_roster",
    "feature:request": "register_event",
    "feature:manage": "manage_users",
  };
  const mapped = colonMap[permission] || permission;
  // If permission is a matrix action, use can()
  if (mapped && typeof mapped === "string") {
    const user = { id: ctx.user.id, role: ctx.profile?.role || "student", vertical: ctx.profile?.vertical || null, memberships: ctx.profile?.memberships || [] };
    const result = can(user, mapped, scope);
    if (!result.ok) {
      const e = new Error(result.note ? `Forbidden: ${result.note}` : "Forbidden");
      e.code = "FORBIDDEN";
      e.status = 403;
      e.note = result.note || null;
      throw e;
    }
  }
  return ctx;
}

export async function requireAdmin() {
  return requireCan("manage_users");
}

export async function requireLead() {
  const ctx = await getRequestContext();
  if (!ctx.user) {
    const e = new Error("Authentication required");
    e.code = "UNAUTHORIZED";
    e.status = 401;
    throw e;
  }
  const role = ctx.profile?.role;
  if (!["dept_lead", "vertical_lead", "admin", "platform_admin"].includes(role)) {
    const e = new Error("Lead access required");
    e.code = "FORBIDDEN";
    e.status = 403;
    throw e;
  }
  return ctx;
}

// Helper to map thrown guard errors to standard API response
export function toGuardResponse(e) {
  if (e?.code === "UNAUTHORIZED" || e?.status === 401) {
    return { ok: false, error: { code: "UNAUTHORIZED", message: "Authentication required" }, status: 401 };
  }
  if (e?.code === "FORBIDDEN" || e?.status === 403) {
    return { ok: false, error: { code: "FORBIDDEN", message: e.message || "Forbidden", note: e.note || undefined }, status: 403 };
  }
  return null;
}
