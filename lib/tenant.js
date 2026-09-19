import { headers } from "next/headers";
import { queryTenant } from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export function normalizeHost(host = "") {
  return host.split(":")[0].toLowerCase();
}

export async function resolveTenantFromHost(host) {
  const normalized = normalizeHost(host);
  const supabase = await createServerSupabase();

  if (normalized === "127.0.0.1" || normalized === "localhost") {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("*")
      .limit(1);

    if (tenants && tenants.length > 0) return tenants[0];
    return null;
  }

  const { data } = await supabase
    .from("tenants")
    .select("*")
    .or(`domain.eq.${normalized},slug.eq.${normalized.split(".")[0]}`)
    .single();

  return data || null;
}

export async function getTenantFromRequest(request) {
  const host = request.headers.get("host") ?? "";
  return resolveTenantFromHost(host);
}

/**
 * Tenant resolution for server-component pages. Resolves the chapter from
 * the request host (domain or slug subdomain); falls back to DEV_TENANT_SLUG
 * only when host headers are absent (local dev, unit tests). Returns the
 * full queryTenant shape (tenant + domains + features map).
 */
export async function resolveRequestTenant() {
  let slug = null;
  try {
    const host = (await headers()).get("host") || "";
    if (host) {
      const t = await resolveTenantFromHost(host);
      slug = t?.slug || null;
    }
  } catch { /* fall through to default tenant */ }
  try {
    return await queryTenant(slug || process.env.DEV_TENANT_SLUG || "demo-college");
  } catch {
    return null;
  }
}

export async function getTenantDb(tenant) {
  if (!tenant?.database_url) return null;

  const { default: postgres } = await import("postgres");
  return postgres(tenant.database_url, {
    max: 5,
    idle_timeout: 10,
    connect_timeout: 10
  });
}

export async function getTenantFeatureFlag(tenant, flag) {
  if (!tenant?.features) return false;
  return !!tenant.features[flag];
}