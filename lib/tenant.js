import { headers } from "next/headers";
import { queryTenant, queryTenantByHost } from "@/lib/db";

export function normalizeHost(host = "") {
  return host.split(":")[0].toLowerCase();
}

export async function resolveTenantFromHost(host) {
  return queryTenantByHost(host);
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
