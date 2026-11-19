// Multi-track following.
//
// A member used to have exactly one roadmap: profiles.primary_domain. That is
// the right default, but plenty of people are learning a second track at the
// same time (web now, AI/ML next term) and the dashboard only ever counted the
// first. student_tracks records the extra roadmaps a member explicitly follows;
// the primary track is always included, so every member tracks at least one.
//
// Pure functions here so the counters can be tested without a database. Reads
// stay sequential in the caller (AGENTS.md pooler rule).

import { DOMAIN_ORDER, domainLabel } from "@/lib/domains";

export function isTrackDomain(value) {
  return typeof value === "string" && DOMAIN_ORDER.includes(value);
}

/** Domains this member follows, in follow order. Missing table degrades to none. */
export async function loadFollowedTracks(sql, { userId, tenantId } = {}) {
  if (!sql || !userId || !tenantId) return [];
  try {
    const rows = await sql`
      SELECT domain FROM student_tracks
      WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
      ORDER BY created_at ASC
    `;
    return rows.map((row) => row.domain).filter(isTrackDomain);
  } catch {
    return [];
  }
}

/**
 * The tracks to show: primary first, then every followed track that has nodes
 * in this chapter's catalogue. A followed domain with no published nodes is
 * dropped rather than rendered as an empty card.
 */
export function trackedDomains({ followed = [], primary = null, available = [] } = {}) {
  const present = new Set(available);
  const out = [];
  const push = (domain) => {
    if (isTrackDomain(domain) && present.has(domain) && !out.includes(domain)) out.push(domain);
  };
  push(primary);
  for (const domain of followed) push(domain);
  return out;
}

/**
 * Per-domain progress over rows the caller already loaded. `nodes` must be in
 * roadmap order; `next` is the first unverified node in that order.
 */
export function trackProgress({ nodes = [], verifiedIds = [], followed = [], primary = null } = {}) {
  const verified = new Set(verifiedIds);
  const available = [...new Set(nodes.map((node) => node.domain))];
  return trackedDomains({ followed, primary, available }).map((domain) => {
    const own = nodes.filter((node) => node.domain === domain);
    const done = own.filter((node) => verified.has(node.id)).length;
    const next = own.find((node) => !verified.has(node.id)) || null;
    return {
      domain,
      label: domainLabel(domain),
      total: own.length,
      done,
      percent: own.length > 0 ? Math.round((done / own.length) * 100) : 0,
      next: next ? { id: next.id, title: next.title } : null
    };
  });
}
