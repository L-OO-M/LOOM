// Shared SEO constants + helpers for public pages.
// Canonical URLs always come from NEXT_PUBLIC_APP_URL so staging and
// production never claim each other's URLs.
export const SITE_NAME = "L.O.O.M.";
export const SITE_TAGLINE = "Learn. Build. Prove. Connect.";
export const SITE_DESCRIPTION =
  "L.O.O.M. is a learning operating system for college developer communities — roadmaps, real GitHub proof, contests, mentorship, and verifiable credentials, run by student departments.";

export function siteUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function absoluteUrl(path = "/") {
  return siteUrl() + (path.startsWith("/") ? path : `/${path}`);
}

/** Spread into a page's metadata export for an absolute canonical URL. */
export function canonicalFor(path) {
  return { alternates: { canonical: absoluteUrl(path) } };
}

/** Default tenant slug for build-time data (sitemap) — same convention as pages. */
export function defaultTenantSlug() {
  return process.env.DEV_TENANT_SLUG || "demo-college";
}
