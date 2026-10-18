import { findUnsafeText } from "@/lib/content-safety";

/**
 * The one place that decides which feature requests a viewer may see.
 *
 * The security report found that /student/feature-requests rendered EVERY row
 * (including other people's pending, rejected and abusive submissions) because
 * the page ran its own unfiltered query, while GET /api/feature-requests
 * correctly restricted non-admins to their own rows plus approved/built. Two
 * queries, two rules, and the page was wrong. Routing both through this helper
 * makes the page and the API agree by construction.
 *
 * Admins see everything in their tenant (the moderation surface). A normal
 * member sees only their own submissions plus ideas that have been approved or
 * built -- so a pending or rejected suggestion is never public.
 */
export async function listFeatureRequests({ sql, tenantId, userId, isAdmin }) {
  const tid = tenantId ?? null;
  if (isAdmin) {
    return sql`
      SELECT fr.*, p.name AS requester_name FROM feature_requests fr
      LEFT JOIN profiles p ON p.user_id = fr.requester_id
      WHERE fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL
      ORDER BY fr.created_at DESC LIMIT 100`;
  }
  return sql`
    SELECT fr.*, p.name AS requester_name FROM feature_requests fr
    LEFT JOIN profiles p ON p.user_id = fr.requester_id
    WHERE (fr.tenant_id = ${tid}::uuid OR ${tid}::uuid IS NULL)
      AND (fr.requester_id = ${userId} OR fr.status IN ('approved','built'))
    ORDER BY fr.created_at DESC LIMIT 100`;
}

const SCREENED_FIELDS = ["title", "description", "integration", "tradeoffs", "implementation"];

/** Rejects an abusive suggestion before it is stored. Returns ok or a failure envelope. */
export function screenFeatureRequest(body = {}) {
  for (const field of SCREENED_FIELDS) {
    if (findUnsafeText(body[field])) {
      return {
        ok: false, field, code: "UNSAFE_CONTENT",
        message: "Your idea contains language that is not allowed here"
      };
    }
  }
  return { ok: true };
}
