export function createAuditEntry({ actor, tenant, action, resource, resourceId, before = null, after = null }) {
  return {
    id: `audit_${Date.now()}`,
    actorId: actor.id,
    actorName: actor.name,
    tenantId: tenant.id,
    action,
    resource,
    resourceId,
    before,
    after,
    createdAt: new Date().toISOString()
  };
}
