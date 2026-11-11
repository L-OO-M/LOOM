// The chapter must always keep at least one active admin.
//
// The check has to run inside the same transaction as the write, because a
// read-then-write guard outside it can be raced by two admins demoting each
// other at the same time. `assertAdminFloor` locks every active admin row in
// the tenant first; concurrent callers queue on that lock and re-evaluate the
// set after the winner commits, so the second sees the floor already crossed.
//
// Removing a non-admin is always allowed, even in a chapter that currently has
// no active admin: that write is not what emptied the seat.

export const LAST_ADMIN_CODE = "LAST_ADMIN";

export class LastAdminError extends Error {
  constructor(message = "Cannot remove the last active admin in this chapter") {
    super(message);
    this.name = "LastAdminError";
    this.code = LAST_ADMIN_CODE;
  }
}

export function isLastAdminError(error) {
  return error?.code === LAST_ADMIN_CODE;
}

export async function assertAdminFloor(tx, { tenantId, removingUserIds = [] }) {
  if (!tenantId) throw new Error("assertAdminFloor: tenantId is required");
  const admins = await tx`
    SELECT user_id FROM profiles
    WHERE tenant_id = ${tenantId}::uuid
      AND role = 'admin'
      AND account_status = 'active'
    FOR UPDATE
  `;
  const removing = new Set(removingUserIds.map((id) => String(id)));
  const targeted = admins.filter((row) => removing.has(String(row.user_id)));
  if (targeted.length === 0) return { activeAdmins: admins.length, removing: 0 };
  const remaining = admins.length - targeted.length;
  if (remaining < 1) throw new LastAdminError();
  return { activeAdmins: admins.length, removing: targeted.length, remaining };
}
