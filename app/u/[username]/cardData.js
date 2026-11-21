import { getSql } from "@/lib/db";
import { reputationFor } from "@/lib/reputation";
import { absoluteUrl } from "@/lib/seo";
import { isFieldVisible, isPassportPublic, passportPrivacy } from "@/lib/passport-privacy";

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
      SELECT p.name, p.primary_domain, p.tenant_id, p.passport_privacy,
             t.settings AS tenant_settings
      FROM profiles p
      JOIN tenants t ON t.id = p.tenant_id
      WHERE p.user_id = ${card.user_id}
      LIMIT 1`;
    if (!profile || !isPassportPublic(profile.passport_privacy)) return null;
    const privacy = passportPrivacy(profile.passport_privacy);
    const publicField = (fieldLevel) => isFieldVisible({
      fieldLevel,
      isOwner: false,
      isSameChapter: false
    });
    const showProjects = publicField(privacy.show_department_work);
    const showGithub = publicField(privacy.show_github_stats);
    const showCertificates = publicField(privacy.show_certificates);
    const showUnverifiedProjects =
      profile.tenant_settings?.public_passport_defaults?.show_unverified_projects === true;
    const rep = await reputationFor(sql, card.user_id).catch(() => ({}));
    const [{ followers = 0 } = {}] = await sql`
      SELECT COUNT(*)::int AS followers FROM followers WHERE following_id = ${card.user_id}`;

    // Proof numbers for the image. Each source is isolated: a card must still
    // render when one feature table is unavailable, and an absent number is
    // omitted by BuilderCard rather than printed as zero.
    let projects = 0;
    let mergedPrs = 0;
    let certificates = 0;
    let reposVerified = 0;
    let activeDays = 0;
    try {
      if (showProjects) {
        const [{ n: projectCount = 0 } = {}] = await sql`
          SELECT COUNT(*)::int AS n FROM projects
          WHERE owner_id = ${card.user_id}
            AND tenant_id = ${profile.tenant_id}::uuid
            AND (${showUnverifiedProjects} OR evidence_state = 'verified')`;
        projects = projectCount;
      }
      const [{ n: merged = 0 } = {}] = await sql`
        SELECT COUNT(*)::int AS n FROM student_oss_contributions
        WHERE student_id = ${card.user_id}
          AND tenant_id = ${profile.tenant_id}::uuid
          AND status = 'verified'`;
      mergedPrs = merged;
      if (showCertificates) {
        const [{ n: certs = 0 } = {}] = await sql`
          SELECT COUNT(*)::int AS n FROM certificates
          WHERE student_id = ${card.user_id}
            AND tenant_id = ${profile.tenant_id}::uuid
            AND revoked_at IS NULL
            AND (expires_at IS NULL OR expires_at > NOW())`;
        certificates = certs;
      }
      if (showGithub) {
        const [{ n: repos = 0 } = {}] = await sql`
          SELECT COUNT(*)::int AS n FROM github_repo_grants
          WHERE user_id = ${card.user_id}
            AND tenant_id = ${profile.tenant_id}::uuid
            AND can_push = true`;
        reposVerified = repos;
        const [{ n: days = 0 } = {}] = await sql`
          SELECT COUNT(*)::int AS n FROM student_daily_activity
          WHERE student_id = ${card.user_id}
            AND tenant_id = ${profile.tenant_id}::uuid
            AND day >= CURRENT_DATE - INTERVAL '120 days'
            AND (commits + pull_requests + reviews > 0 OR github_contributions > 0)`;
        activeDays = days;
      }
    } catch {
      /* a missing feature table must not reduce the card to "not found" */
    }

    let solved = 0;
    try {
      const [practice] = await sql`
        SELECT leetcode_stats FROM practice_connections
        WHERE user_id = ${card.user_id} AND tenant_id = ${profile.tenant_id}::uuid
        LIMIT 1`;
      const total = Number(practice?.leetcode_stats?.total);
      solved = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
    } catch {
      solved = 0;
    }

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
      projects,
      mergedPrs,
      certificates,
      reposVerified,
      activeDays,
      solved,
      // absoluteUrl, never a hardcoded host. The previous card baked in
      // "loom.sh/u/...", which was the wrong domain -- every card produced by
      // the platform pointed somewhere the recipient could not open.
      siteUrl: absoluteUrl(`/u/${clean}`).replace(/\/$/, "")
    };
  } catch {
    return null;
  }
}
