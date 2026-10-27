import { getRequestContext } from "@/lib/auth-server";
import { can } from "@/lib/permissions";

const CONTEXT_ERROR_MESSAGE = "Request context could not be established";

// Typed guard error so routes can branch on class or fields without parsing
// messages. `code`, `status` and `note` keep the existing contract intact.
export class GuardError extends Error {
  constructor(code, status, message, note = null) {
    super(message);
    this.name = "GuardError";
    this.code = code;
    this.status = status;
    if (note != null) this.note = note;
  }
}

// Strict permission guard — every mutation must go through this.
// Fails closed: a context error or an incomplete context never reaches can().
export async function requireCan(permission, scope = {}) {
  let ctx;
  try {
    ctx = await getRequestContext();
  } catch {
    throw new GuardError("CONTEXT_ERROR", 500, CONTEXT_ERROR_MESSAGE);
  }

  if (ctx?.error === "UNAUTHORIZED") {
    throw new GuardError("UNAUTHORIZED", 401, "Authentication required");
  }
  if (ctx?.error === "FORBIDDEN") {
    throw new GuardError("FORBIDDEN", 403, "Forbidden");
  }
  if (ctx?.error === "PROFILE_NOT_FOUND") {
    throw new GuardError("PROFILE_NOT_FOUND", 404, "Profile not found");
  }
  if (ctx?.error === "TENANT_UNRESOLVED") {
    throw new GuardError("TENANT_UNRESOLVED", 403, "Tenant could not be resolved");
  }
  if (ctx?.error) {
    throw new GuardError("CONTEXT_ERROR", 500, CONTEXT_ERROR_MESSAGE);
  }

  if (!ctx?.user) {
    throw new GuardError("UNAUTHORIZED", 401, "Authentication required");
  }
  if (!ctx.profile || !ctx.tenant || !ctx.sql) {
    throw new GuardError("CONTEXT_ERROR", 500, CONTEXT_ERROR_MESSAGE);
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
    const user = { id: ctx.user.id, role: ctx.profile.role, vertical: ctx.profile.vertical || null, memberships: ctx.profile.memberships || [] };
    const result = can(user, mapped, scope);
    if (!result.ok) {
      const e = new GuardError(
        "FORBIDDEN",
        403,
        result.note ? `Forbidden: ${result.note}` : "Forbidden",
        result.note || null
      );
      throw e;
    }
  }
  return ctx;
}

const STATUS_DEFAULTS = {
  401: { code: "UNAUTHORIZED", message: "Authentication required" },
  403: { code: "FORBIDDEN", message: "Forbidden" }
};

const CODE_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403
};

// Helper to map thrown guard errors to standard API response. Any error that
// carries a numeric (or legacy known-code) status is treated as a guard error;
// everything else stays unclaimed so callers can rethrow it.
export function toGuardResponse(e) {
  if (!e) return null;
  const status = typeof e.status === "number" && Number.isFinite(e.status)
    ? e.status
    : CODE_STATUS[e.code];
  if (typeof status !== "number") return null;

  const fallback = STATUS_DEFAULTS[status];
  const code = typeof e.code === "string" && e.code ? e.code : fallback?.code || "CONTEXT_ERROR";
  const message = e.message || fallback?.message || "Request failed";
  const error = { code, message };
  if (e.note != null) error.note = e.note;

  return { ok: false, error, status };
}
