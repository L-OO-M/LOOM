import { getSql } from "@/lib/db";
import { absoluteUrl, defaultTenantSlug } from "@/lib/seo";

export const revalidate = 86400;

async function activeDepartmentSlugs() {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT d.slug FROM departments d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE t.slug = ${defaultTenantSlug()} AND d.is_active
      ORDER BY d.slug ASC
    `;
    return rows.map((r) => r.slug);
  } catch {
    return [];
  }
}

async function publicUsernames() {
  try {
    const sql = getSql();
    const rows = await sql`SELECT username, updated_at FROM user_profiles WHERE is_public = true ORDER BY updated_at DESC LIMIT 500`;
    return rows;
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const now = new Date();
  const pages = [
    { path: "/", priority: 1.0, changeFrequency: "daily" },
    { path: "/about", priority: 0.8, changeFrequency: "monthly" },
    { path: "/events", priority: 0.9, changeFrequency: "daily" },
    { path: "/domains", priority: 0.8, changeFrequency: "weekly" },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" }
  ];
  const entries = pages.map((p) => ({
    url: absoluteUrl(p.path),
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority
  }));
  for (const slug of await activeDepartmentSlugs()) {
    entries.push({
      url: absoluteUrl(`/domains/${slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7
    });
  }
  for (const u of await publicUsernames()) {
    entries.push({
      url: absoluteUrl(`/u/${u.username}`),
      lastModified: u.updated_at || now,
      changeFrequency: "weekly",
      priority: 0.6
    });
  }
  return entries;
}
