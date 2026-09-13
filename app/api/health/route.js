import { ok } from "@/lib/api";
import { getTenantFromRequest } from "@/lib/tenant";

export async function GET(request) {
  const tenant = await getTenantFromRequest(request);

  return ok({
    status: "ready",
    database: "supabase_postgres",
    tenant: tenant
      ? { id: tenant.id, slug: tenant.slug, name: tenant.name }
      : null
  });
}