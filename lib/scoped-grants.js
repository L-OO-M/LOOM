// Scoped leadership grants are the authority record; profile roles are labels.
// Keep grant replacement in the same transaction as role/membership changes.

export async function syncLeadershipScopedGrant(tx, {
  tenantId,
  userId,
  actorId,
  role,
  vertical = null,
  departmentId = null,
  startsAt = null,
  expiresAt = null,
  revokeAllLeadership = false,
  reason = "leadership_assignment_changed"
}) {
  if (!tx || !tenantId || !userId || !actorId) {
    throw new Error("syncLeadershipScopedGrant requires transaction, tenant, user and actor");
  }

  const grant = role === "vertical_lead" && vertical
    ? { roleName: "vertical_lead", scopeType: "vertical", scopeId: vertical }
    : role === "dept_lead" && departmentId
      ? { roleName: "dept_lead", scopeType: "department", scopeId: String(departmentId) }
      : null;

  // Preserve grant history. A scoped appointment replaces only that exact
  // authority by default, so appointing one department cannot silently revoke
  // another independent assignment. Global role changes and handovers opt into
  // full leadership revocation explicitly. A non-leadership role also means all
  // leadership authority is being removed.
  if (revokeAllLeadership || !grant) {
    await tx`
      UPDATE scoped_role_grants
      SET is_active = false,
          revoked_at = COALESCE(revoked_at, now()),
          revoked_by = COALESCE(revoked_by, ${actorId}),
          revocation_reason = COALESCE(revocation_reason, ${reason})
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${userId}
        AND role_name IN ('vertical_lead', 'dept_lead', 'co_head')
        AND is_active = true
        AND revoked_at IS NULL
    `;
  } else {
    await tx`
      UPDATE scoped_role_grants
      SET is_active = false,
          revoked_at = COALESCE(revoked_at, now()),
          revoked_by = COALESCE(revoked_by, ${actorId}),
          revocation_reason = COALESCE(revocation_reason, ${reason})
      WHERE tenant_id = ${tenantId}::uuid
        AND user_id = ${userId}
        AND role_name = ${grant.roleName}
        AND scope_type = ${grant.scopeType}
        AND scope_id = ${grant.scopeId}
        AND is_active = true
        AND revoked_at IS NULL
    `;
  }

  if (!grant) return null;

  const [created] = await tx`
    INSERT INTO scoped_role_grants (
      tenant_id, user_id, role_name, scope_type, scope_id, granted_by,
      starts_at, expires_at, is_active
    ) VALUES (
      ${tenantId}::uuid, ${userId}, ${grant.roleName}, ${grant.scopeType},
      ${grant.scopeId}, ${actorId}, COALESCE(${startsAt}::timestamptz, now()),
      CASE WHEN ${expiresAt}::date IS NULL THEN NULL
           ELSE (${expiresAt}::date + INTERVAL '1 day') END,
      true
    )
    RETURNING id, role_name, scope_type, scope_id, starts_at, expires_at
  `;
  return created || null;
}
