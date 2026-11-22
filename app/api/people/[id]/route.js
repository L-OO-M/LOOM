import { ok, fail } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { classifyMany } from "@/lib/tiers";
import { fetchRankPositions } from "@/lib/standings";
import { proofCounts } from "@/lib/role-requests";

// GET /api/people/[id] -- the small card behind a name.
//
// Scope: an authenticated member of the same chapter. Tenant comes from the
// caller's profile (lib/auth-server), never from the URL, and the target is
// looked up inside that tenant -- so an id from another chapter answers 404
// rather than leaking that it exists.
//
// What is exposed: what a member already publishes to peers -- name, role,
// domain, departments, their verified record, and where they stand on the
// chapter board. The public /u/ link is offered only when their card is marked
// public; admins additionally get the admin-side record link.

const ROLE_LABEL = {
  student: "Member",
  core: "Core member",
  dept_lead: "Department Head",
  vertical_lead: "Vertical Lead",
  admin: "Admin",
  platform_admin: "Platform Admin"
};

export async function GET(request, { params }) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant, sql } = ctx;
  const { id } = await params;
  if (!id || typeof id !== "string") return fail("INVALID_ID", "A member id is required", 400);

  const [person] = await sql`
    SELECT p.user_id, p.name, p.role, p.primary_domain, p.github_username,
           p.updated_at,
           up.username, up.bio, up.avatar_url, up.location, up.social_links,
           up.is_public
    FROM profiles p
    LEFT JOIN user_profiles up ON up.user_id = p.user_id
    WHERE p.user_id = ${id} AND p.tenant_id = ${tenant.id}::uuid
    LIMIT 1
  `;
  if (!person) return fail("NOT_FOUND", "Member not found", 404);

  const departments = await sql`
    SELECT d.name, d.slug, m.level
    FROM department_memberships m
    JOIN departments d ON d.id = m.department_id
    WHERE m.user_id = ${person.user_id} AND m.tenant_id = ${tenant.id}::uuid
    ORDER BY d.name ASC
    LIMIT 10
  `;

  const tiers = await classifyMany(sql, [person.user_id]);
  const tier = tiers.get(person.user_id)?.tier || "beginner";

  const positions = await fetchRankPositions(sql, {
    tenantId: tenant.id,
    userIds: [person.user_id],
    viewerId: user.id
  });
  const position = positions.get(String(person.user_id)) || null;

  const proof = await proofCounts(sql, { tenantId: tenant.id, userId: person.user_id });
  const isAdmin = profile?.role === "admin" || profile?.role === "platform_admin";

  return ok({
    id: person.user_id,
    name: person.name || "A member",
    username: person.username || null,
    role: person.role || "student",
    roleLabel: ROLE_LABEL[person.role] || "Member",
    domain: person.primary_domain || null,
    github: person.github_username || null,
    bio: person.bio || "",
    avatarUrl: person.avatar_url || null,
    location: person.location || null,
    links: person.social_links || {},
    departments: departments || [],
    tier,
    proof,
    proofTotal: proof.total,
    standing: position?.rank
      ? { rank: position.rank, total: position.total, score: position.score }
      : null,
    // Two different destinations, deliberately: the public page only exists for
    // a public card, and the admin record only for an admin viewer.
    profileHref:
      person.is_public && person.username ? `/u/${person.username}` : null,
    adminHref: isAdmin ? `/admin/students/${person.user_id}` : null,
    isSelf: String(person.user_id) === String(user.id)
  });
}
