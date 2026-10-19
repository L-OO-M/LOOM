import { headers } from "next/headers";
import { queryTenant, queryTenantByHost } from "@/lib/db";
import { env } from "@/lib/env";

export function normalizeHost(host = "") {
  return host.split(":")[0].toLowerCase();
}

export async function resolveTenantFromHost(host) {
  return queryTenantByHost(host);
}

/**
 * Tenant for a server-to-server delivery (webhooks, queue jobs).
 *
 * A GitHub webhook arrives at the shared deployment origin — `<app>.vercel.app`
 * — which belongs to no chapter and appears in no tenant_domains row. Resolving
 * purely from the Host header therefore returned null and every delivery died
 * with TENANT_NOT_FOUND before signature verification even ran.
 *
 * So: resolve from Host first (honours multi-tenant custom domains), then fall
 * back to the explicitly configured DEFAULT_TENANT_SLUG. The fallback is
 * configuration, not inference — it cannot be steered by a request header, so
 * it does not widen who can write where.
 */
export async function getTenantFromRequest(request) {
  const host = request.headers.get("host") ?? "";
  const byHost = await resolveTenantFromHost(host);
  if (byHost) return byHost;
  try {
    return await queryTenant(env.DEFAULT_TENANT_SLUG);
  } catch {
    return null;
  }
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
