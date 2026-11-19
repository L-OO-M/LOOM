import { z } from "zod";
import { ok, fail, validationError } from "@/lib/api";
import { getRequestContext, writeAudit } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { mergeSocialLinks } from "@/lib/profileFolio";
import {
  IDENTITY_PROVIDERS,
  newVerifyToken,
  normalizeIdentityValue,
  providerFor
} from "@/lib/identity";

const saveSchema = z.object({
  provider: z.enum(IDENTITY_PROVIDERS.map((p) => p.key)),
  value: z.string().max(300)
});

function ctxError(ctx) {
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  return null;
}

async function currentConnection(sql, { tenantId, userId, provider }) {
  try {
    if (provider === "github") {
      const [row] = await sql`
        SELECT github_username FROM github_connections WHERE user_id = ${userId} LIMIT 1
      `;
      return row?.github_username || null;
    }
    if (provider === "leetcode") {
      const [row] = await sql`
        SELECT leetcode_username FROM practice_connections
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId} AND active = true
        LIMIT 1
      `;
      return row?.leetcode_username || null;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * GET /api/identity
 * The member's own linked accounts plus the one-time code each unverified
 * provider needs. The code is only returned here, never on a public surface.
 */
export async function GET() {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const rows = await sql`
    SELECT provider, handle, status, method, proof_url, verify_token, verified_at, last_checked_at, check_error
    FROM identity_links
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id}
  `;
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  // Legacy cards stored handles in user_profiles.social_links before this table
  // existed. Surface them as claims so the member can verify instead of
  // retyping, but never present them as verified.
  const [card] = await sql`
    SELECT social_links FROM user_profiles WHERE user_id = ${user.id} LIMIT 1
  `;
  const links = card?.social_links && typeof card.social_links === "object" ? card.social_links : {};

  const providers = IDENTITY_PROVIDERS.map((spec) => {
    const row = byProvider.get(spec.key) || null;
    const stored = links[spec.key];
    const handle = row?.handle || (typeof stored === "string" ? stored : null);
    return {
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      method: row?.method || spec.method,
      hint: spec.hint || null,
      handle: handle || "",
      status: row?.status || (handle ? "claimed" : null),
      proofUrl: row?.proof_url || null,
      verifyToken: row?.verify_token || null,
      verifiedAt: row?.verified_at || null,
      lastCheckedAt: row?.last_checked_at || null,
      checkError: row?.check_error || null
    };
  });

  return ok({
    providers,
    connections: {
      github: await currentConnection(sql, { tenantId: tenant.id, userId: user.id, provider: "github" }),
      leetcode: await currentConnection(sql, { tenantId: tenant.id, userId: user.id, provider: "leetcode" })
    }
  });
}

/**
 * POST /api/identity  { provider, value }
 *
 * Saving a handle records a CLAIM. It becomes `verified` only when an existing
 * OAuth connection matches (GitHub) or a token check already passed; LeetCode
 * becomes `linked` because its API confirms the account exists, not who owns it.
 */
export async function POST(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const limit = await checkRateLimit(request, { userId: user.id, limit: 20, windowMs: 60_000, durable: true });
  if (!limit.ok) return fail("RATE_LIMITED", `Too many requests. Retry after ${limit.retryAfter}s`, 429);

  let body;
  try {
    body = saveSchema.parse(await request.json());
  } catch (error) {
    return validationError(error);
  }

  const { provider } = body;
  const spec = providerFor(provider);
  const normalised = normalizeIdentityValue(provider, body.value);
  if (normalised.error) {
    return fail("VALIDATION_ERROR", normalised.error, 400, { field: provider });
  }
  const handle = normalised.value;

  if (!handle) {
    await sql`
      DELETE FROM identity_links
      WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND provider = ${provider}
    `;
    await clearSocialLink(sql, { userId: user.id, provider });
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant.id,
      action: "identity.unlink", resource: "identity_link", resourceId: provider
    });
    return ok({ provider, handle: "", status: null });
  }

  const connection = await currentConnection(sql, { tenantId: tenant.id, userId: user.id, provider });
  const matchesConnection = connection && connection.toLowerCase() === handle.toLowerCase();
  const status = provider === "github" && matchesConnection
    ? "verified"
    : provider === "leetcode" && matchesConnection
      ? "linked"
      : "claimed";
  const method = status === "verified" ? "oauth" : status === "linked" ? "api" : "claim";
  const token = newVerifyToken();

  const [row] = await sql`
    INSERT INTO identity_links (
      tenant_id, user_id, provider, handle, status, method, verify_token, verified_at, updated_at
    ) VALUES (
      ${tenant.id}::uuid, ${user.id}, ${provider}, ${handle}, ${status}, ${method}, ${token},
      ${status === "verified" ? new Date() : null}, now()
    )
    ON CONFLICT (tenant_id, user_id, provider) DO UPDATE SET
      handle = EXCLUDED.handle,
      -- Changing the handle invalidates any earlier verification: the proof
      -- belonged to the old account.
      status = CASE
        WHEN identity_links.handle <> EXCLUDED.handle THEN EXCLUDED.status
        WHEN identity_links.status = 'verified' THEN 'verified'
        ELSE EXCLUDED.status
      END,
      method = CASE
        WHEN identity_links.handle <> EXCLUDED.handle THEN EXCLUDED.method
        WHEN identity_links.status = 'verified' THEN identity_links.method
        ELSE EXCLUDED.method
      END,
      verify_token = COALESCE(identity_links.verify_token, EXCLUDED.verify_token),
      verified_at = CASE
        WHEN identity_links.handle <> EXCLUDED.handle THEN EXCLUDED.verified_at
        ELSE identity_links.verified_at
      END,
      check_error = NULL,
      updated_at = now()
    RETURNING provider, handle, status, method, verify_token
  `;

  await saveSocialLink(sql, { userId: user.id, provider, value: handle });
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "identity.save", resource: "identity_link", resourceId: provider,
    after: { handle, status }
  });

  return ok({ ...row });
}

/** DELETE /api/identity?provider=github */
export async function DELETE(request) {
  const ctx = await getRequestContext();
  const err = ctxError(ctx);
  if (err) return err;
  const { user, tenant, sql } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);

  const provider = new URL(request.url).searchParams.get("provider");
  const spec = providerFor(provider);
  if (!spec) return fail("VALIDATION_ERROR", "Unknown provider", 400);

  await sql`
    DELETE FROM identity_links
    WHERE tenant_id = ${tenant.id}::uuid AND user_id = ${user.id} AND provider = ${spec.key}
  `;
  await clearSocialLink(sql, { userId: user.id, provider: spec.key });
  await writeAudit({
    sql, actorId: user.id, tenantId: tenant.id,
    action: "identity.unlink", resource: "identity_link", resourceId: spec.key
  });
  return ok({ provider: spec.key, removed: true });
}

// The public card still reads social_links. Keep the two stores in step so a
// saved account is visible without a second save, and a removal disappears.
async function saveSocialLink(sql, { userId, provider, value }) {
  const [card] = await sql`SELECT social_links FROM user_profiles WHERE user_id = ${userId} LIMIT 1`;
  if (!card) return;
  const { links, errors } = mergeSocialLinks(card.social_links, { [provider]: value });
  if (errors.length) return;
  await sql`
    UPDATE user_profiles SET social_links = ${sql.json(links)}, updated_at = now() WHERE user_id = ${userId}
  `;
}

async function clearSocialLink(sql, { userId, provider }) {
  const [card] = await sql`SELECT social_links FROM user_profiles WHERE user_id = ${userId} LIMIT 1`;
  if (!card) return;
  const { links } = mergeSocialLinks(card.social_links, { [provider]: null });
  await sql`
    UPDATE user_profiles SET social_links = ${sql.json(links)}, updated_at = now() WHERE user_id = ${userId}
  `;
}
