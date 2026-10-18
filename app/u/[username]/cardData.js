import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";

/**
 * Loads the real, public builder-card payload.
 *
 * Shared by the unfurl endpoint and the sized download endpoint so the two
 * cannot drift -- a card previewed in the share sheet must be the same card a
 * recipient sees. Returns null when the profile is missing or not public, which
 * is the single condition for "not found".
 */
export async function loadPublicBuilderCard(clean, sqlOverride) {
  if (!clean) return null;
  try {
    const sql = sqlOverride || getSql();
    // user_id MUST be selected: reputationFor() and the follower count key off
    // it. Omitting it made card.user_id undefined, and postgres.js rejects an
    // undefined parameter -- the throw was swallowed by the catch below, so
    // every card silently rendered the "BUILDER NOT FOUND" placeholder.
    const [card] = await sql`
      SELECT user_id, username, bio, is_public FROM user_profiles
      WHERE username = ${clean} AND is_public = true LIMIT 1`;
    if (!card) return null;

    const [profile] = await sql`
      SELECT p.name, p.primary_domain FROM profiles p
      WHERE p.user_id = ${card.user_id}
      LIMIT 1`;
    const rep = await reputationFor(sql, card.user_id).catch(() => ({}));
    const [{ followers = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${card.user_id}`;

    return {
      name: profile?.name || card.username,
      username: card.username,
      domain: profile?.primary_domain || null,
      bio: card.bio || "",
      score: rep?.score ?? 0,
      achievements: rep?.achievements ?? 0,
      ossVerified: rep?.ossVerified ?? 0,
      eventsAttended: rep?.eventsAttended ?? 0,
      followers,
      // absoluteUrl, never a hardcoded host. The previous card baked in
      // "loom.sh/u/...", which was the wrong domain -- every card produced by
      // the platform pointed somewhere the recipient could not open.
      siteUrl: absoluteUrl(`/u/${clean}`).replace(/\/$/, "")
    };
  } catch {
    return null;
  }
}
