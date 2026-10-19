import { fail } from "@/lib/api";
import { getRequestContext, writeAudit, notify } from "@/lib/auth-server";
import {
  ensureWebhook,
  exchangeCode,
  fetchAuthenticatedUser,
  fetchRepoPermissions,
  verifyState
} from "@/lib/github-oauth";
import { seal } from "@/lib/crypto";
import { recomputeScore, recordEvidence } from "@/lib/ranking";
import { env } from "@/lib/env";
import crypto from "node:crypto";

// The OAuth callback: where a repository claim stops being an assertion.
//
// ORDER OF OPERATIONS IS THE SECURITY PROPERTY HERE
//
//   1. session       -- who is this callback for?
//   2. state         -- did THIS user start THIS flow, recently, once?
//   3. nonce cookie  -- and is this the first time it has come back?
//   4. exchange code -- only now is a credential spent
//
// Verifying state before exchanging the code means a forged or replayed callback
// never reaches GitHub at all, so the client secret is never spent on an attack.
// Verifying the nonce AFTER the state signature is sound because the nonce is
// inside the signed payload -- an attacker cannot substitute one.
//
// Every failure path redirects to a page that says what happened. Nothing here
// ever renders the raw GitHub response: the token endpoint echoes back the code
// and, on a bad secret, enough detail to be useful to an attacker.

const STATE_COOKIE = "loom_gh_oauth";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const denied = searchParams.get("error_description") || searchParams.get("error");

  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") {
    return redirect(`${origin}/login?error=github_session_expired`);
  }
  if (ctx.error) return redirect(`${origin}/student/github?error=github_no_profile`);
  const { user, tenant, sql } = ctx;

  // The student pressed "Cancel" on GitHub's consent screen. Not an error worth
  // alarming anyone about.
  if (denied && !code) {
    return redirect(`${origin}/student/github?notice=github_cancelled`);
  }
  if (!code) return redirect(`${origin}/student/github?error=github_missing_code`);

  // --- 2. state ---
  const checked = verifyState({ state, expectedUserId: user.id });
  if (!checked.ok) {
    // Not an exception: someone bookmarked this URL, a tab sat open too long,
    // or someone is probing. All are expected on a public callback.
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: "github_oauth_state_rejected", resource: "github_oauth", resourceId: checked.reason,
      after: { reason: checked.reason }
    });
    return redirect(`${origin}/student/github?error=github_invalid_state`);
  }

  // --- 3. single use ---
  const cookieHeader = request.headers.get("cookie") || "";
  const rawCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${STATE_COOKIE}=`));
  const cookieValue = rawCookie ? rawCookie.slice(STATE_COOKIE.length + 1) : "";
  const [cookieNonce, encodedRepos] = cookieValue.split(".");
  if (!cookieNonce || !timingSafe(cookieNonce, checked.nonce)) {
    // The cookie is the second, independent half of the CSRF defence. A valid
    // signature replayed without the matching cookie does not get through.
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: "github_oauth_state_rejected", resource: "github_oauth", resourceId: "NONCE_MISMATCH"
    });
    return redirect(`${origin}/student/github?error=github_invalid_state`);
  }
  // Consume the cookie regardless of what follows, so a legitimate retry after a
  // mid-flow failure cannot reuse it.
  const cleared = clearStateCookie(env.NEXT_PUBLIC_APP_URL.startsWith("https"));

  const redirectUri = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/github/oauth/callback`;

  // --- 4. exchange ---
  const exchanged = await exchangeCode({
    code,
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    redirectUri
  });
  if (!exchanged.ok) {
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: "github_oauth_exchange_failed", resource: "github_oauth",
      resourceId: exchanged.reason
    });
    return cleared(redirect(`${origin}/student/github?error=github_exchange_failed`));
  }

  // --- identity: GitHub's immutable numeric id ---
  const me = await fetchAuthenticatedUser({ accessToken: exchanged.accessToken });
  if (!me.ok) {
    return cleared(redirect(`${origin}/student/github?error=github_identity_failed`));
  }

  // One GitHub account, one LOOM account. Checked BEFORE any write so the loser
  // of a collision changes nothing.
  const [existing] = await sql`
    SELECT user_id FROM github_connections
    WHERE github_user_id = ${me.id} AND user_id <> ${user.id}
    LIMIT 1
  `;
  if (existing) {
    await writeAudit({
      sql, actorId: user.id, tenantId: tenant?.id,
      action: "github_oauth_rejected", resource: "github_oauth", resourceId: "ACCOUNT_ALREADY_LINKED"
    });
    return cleared(redirect(`${origin}/student/github?error=github_already_linked`));
  }

  // A handle rename must not orphan the connection: rebind the display name
  // unconditionally, since GitHub has just told us what it currently is.
  //
  // The token is stored sealed, but nothing reads it back yet. That is
  // deliberate: there is no feature that needs it today (grants are cached in
  // github_repo_grants), and a stored-credential read path with no caller is
  // attack surface for no benefit. When re-verification is wired, unseal through
  // lib/crypto.js `open()` at that point.
  await sql`
    INSERT INTO github_connections
      (user_id, github_username, github_user_id, access_token_cipher, refresh_token_cipher,
       token_scopes, token_expires_at, verified_at, oauth_linked_at)
    VALUES (
      ${user.id}, ${me.login}, ${me.id}, ${seal(exchanged.accessToken)},
      ${exchanged.refreshToken ? seal(exchanged.refreshToken) : null},
      ${sql.array(exchanged.scopes)}, ${expiresAt(exchanged.expiresIn)}, NOW(), NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      github_username = EXCLUDED.github_username,
      github_user_id = EXCLUDED.github_user_id,
      access_token_cipher = EXCLUDED.access_token_cipher,
      refresh_token_cipher = EXCLUDED.refresh_token_cipher,
      token_scopes = EXCLUDED.token_scopes,
      token_expires_at = EXCLUDED.token_expires_at,
      verified_at = NOW(),
      oauth_linked_at = NOW()
    RETURNING *
  `;
  // profiles.github_username is the fallback in resolveStudentIdByLogin, so it
  // must track the verified login or attribution silently splits in two.
  await sql`UPDATE profiles SET github_username = ${me.login} WHERE user_id = ${user.id}`;

  // --- repository grants ---
  const requested = decodeRepos(encodedRepos);
  const results = [];
  for (const fullName of requested) {
    const perm = await fetchRepoPermissions({ accessToken: exchanged.accessToken, fullName });
    if (!perm.ok) {
      results.push({ repo: fullName, ok: false, reason: perm.reason });
      continue;
    }
    // The token's rights AND the account must match. A collaborator with push
    // access is NOT the owner, and the project claim is about authorship.
    const ownsIt = perm.canPush && perm.owner.toLowerCase() === me.login.toLowerCase();
    await sql`
      INSERT INTO github_repo_grants
        (user_id, tenant_id, repo_full_name, github_user_id, owner_login, can_push, can_admin, is_private, verified_at, updated_at)
      VALUES (
        ${user.id}, ${tenant?.id ?? null}::uuid, ${perm.fullName}, ${me.id}, ${perm.owner},
        ${ownsIt}, ${perm.canAdmin}, ${perm.private}, NOW(), NOW()
      )
      ON CONFLICT (user_id, repo_full_name) DO UPDATE SET
        github_user_id = EXCLUDED.github_user_id,
        owner_login = EXCLUDED.owner_login,
        can_push = EXCLUDED.can_push,
        can_admin = EXCLUDED.can_admin,
        is_private = EXCLUDED.is_private,
        verified_at = NOW(),
        updated_at = NOW()
    `;
    results.push({ repo: perm.fullName, ok: true, canPush: ownsIt, canAdmin: perm.canAdmin });

    // Install the webhook only when we hold admin, and only after the grant is
    // stored. ensureWebhook dedupes first -- see its comment for why a second
    // hook would double-count every commit in every push.
    if (perm.canAdmin) {
      const hook = await ensureWebhook({
        accessToken: exchanged.accessToken,
        fullName: perm.fullName,
        webhookUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/github/webhook`,
        secret: env.GITHUB_WEBHOOK_SECRET
      });
      if (hook.ok && hook.installed) {
        await sql`UPDATE github_connections SET webhook_installed_at = NOW() WHERE user_id = ${user.id}`;
      }
      results[results.length - 1].webhook = hook.ok
        ? (hook.installed ? "installed" : "already present")
        : hook.reason;
    }
  }

  // --- activate any provisional project the new grant now proves ---
  const activated = await activateProvenProjects({ sql, tenant, userId: user.id, grants: results.filter((r) => r.ok && r.canPush) });

  await writeAudit({
    sql, actorId: user.id, tenantId: tenant?.id,
    action: "linked_github_oauth", resource: "github_connection", resourceId: user.id,
    after: { login: me.login, githubUserId: me.id, scopes: exchanged.scopes, repos: requested.length, activated }
  });

  await notify({
    sql, tenantId: tenant?.id, userId: user.id,
    type: "github",
    title: `GitHub linked as @${me.login}`,
    body: activated
      ? `Your identity is verified, and ${activated} project${activated === 1 ? "" : "s"} moved from pending to verified.`
      : "Your identity is verified. Claim a project repository to have it verified automatically.",
    link: "/student/github"
  });

  const params = new URLSearchParams({ notice: "github_linked" });
  if (results.some((r) => !r.ok)) params.set("warning", "some_repos_unverified");
  if (activated) params.set("activated", String(activated));
  return cleared(redirect(`${origin}/student/github?${params.toString()}`));
}

/**
 * A grant is proof of authorship; a provisional project that names the same repo
 * is now proven. This is what closes the gap docs/20 recorded as unsolved --
 * it works even when the repository has never sent us a single delivery.
 */
async function activateProvenProjects({ sql, tenant, userId, grants }) {
  if (!tenant?.id || !grants.length) return 0;
  let activated = 0;
  for (const grant of grants) {
    const [project] = await sql`
      SELECT id, title FROM projects
      WHERE owner_id = ${userId}
        AND tenant_id = ${tenant.id}::uuid
        AND lower(repo_full_name) = lower(${grant.repo})
        AND evidence_state = 'provisional'
      LIMIT 1
    `;
    if (!project) continue;
    const [updated] = await sql`
      UPDATE projects
         SET evidence_state = 'verified', verified_at = NOW(), verified_by = ${`github:${grant.repo}`}, updated_at = NOW()
       WHERE id = ${project.id} AND evidence_state = 'provisional'
      RETURNING *
    `;
    if (!updated) continue; // lost the race to a concurrent delivery or an admin
    await recordEvidence({
      sql, tenantId: tenant.id, userId, kind: "project_verified", refId: project.id,
      verifiedBy: `github:${grant.repo}`, source: "webhook",
      evidence: { repository: grant.repo, via: "oauth_repo_grant" }
    });
    activated += 1;
  }
  if (activated) await recomputeScore(sql, tenant.id, userId);
  return activated;
}

function decodeRepos(encoded) {
  if (!encoded) return [];
  let raw = "";
  try {
    raw = decodeURIComponent(encoded);
  } catch {
    return [];
  }
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 10);
}

function expiresAt(seconds) {
  if (!seconds) return null;
  return new Date(Date.now() + Number(seconds) * 1000).toISOString();
}

function timingSafe(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function redirect(to) {
  return new Response(null, { status: 302, headers: { Location: to, "Cache-Control": "no-store" } });
}

function clearStateCookie(secure) {
  return (response) => {
    response.headers.append(
      "Set-Cookie",
      `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
    );
    return response;
  };
}