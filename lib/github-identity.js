// Identity provisioning after a GitHub sign-in.
//
// Supabase performed the OAuth exchange; this reads what it verified and records
// it, so the rest of the app can treat the connection as vouched-for rather than
// typed.
//
// HONEST LIMIT, STATED PLAINLY
//
// A Supabase GitHub sign-in proves identity and a verified email. It does NOT
// give us a repository token, and it is NOT the ownership proof -- that is the
// separate grant at /api/github/oauth/callback.
//
// WHERE THE IDENTITY COMES FROM
//
// Only two sources are trusted:
//
//   1. `user.identities[]`, written by the identity provider. `identity_data`
//      and `provider_id` are provider-owned; a signed-in member cannot edit
//      them.
//   2. GET /user with a real repository token, when the caller supplies one
//      (the OAuth callback path). This is authoritative and is preferred when
//      available.
//
// `user.user_metadata` is deliberately NOT read. Supabase lets the signed-in
// user update their own user_metadata, so a member could claim any GitHub
// handle there; trusting it would recreate the typed-handle vulnerability that
// migrations 035 and 038 closed, just through a different field.
//
// If neither provider identities nor /user yields a handle, github_user_id
// stays NULL and the UI says "typed in, not verified by GitHub". That is the
// honest state, not a bug to paper over.

import { fetchAuthenticatedUser } from "@/lib/github-oauth";

const LOGIN_KEYS = ["user_name", "preferred_username", "login", "nickname"];

function githubIdentities(user) {
  if (!Array.isArray(user?.identities)) return [];
  return user.identities.filter((identity) => identity?.provider === "github");
}

function identityData(identity) {
  return identity?.identity_data && typeof identity.identity_data === "object"
    ? identity.identity_data
    : {};
}

function isGithubSession(user) {
  if (!user) return false;
  const appMeta = user.app_metadata || {};
  const providers = appMeta.providers || appMeta.provider;
  return (
    providers === "github" ||
    (Array.isArray(providers) && providers.includes("github")) ||
    appMeta.provider === "github" ||
    githubIdentities(user).length > 0
  );
}

/**
 * Pull the GitHub login and numeric id out of a Supabase user record.
 *
 * Returns `{ login, githubUserId }` where either may be null. Never throws: a
 * sign-in that succeeded must not be turned into a 500 by an unexpected claim
 * shape, and the fallback (record what we have) is better than failing.
 */
export function extractGitHubIdentity(user) {
  if (!user || !isGithubSession(user)) return { login: null, githubUserId: null };

  const identities = githubIdentities(user);
  const dataList = identities.map(identityData);

  // One login per identity. A renamed GitHub account is reflected in
  // identity_data on the next sign-in; nothing here reads the editable profile
  // metadata.
  let login = null;
  for (const data of dataList) {
    for (const key of LOGIN_KEYS) {
      if (typeof data[key] === "string" && data[key].trim()) {
        login = data[key].trim();
        break;
      }
    }
    if (login) break;
  }

  // The immutable numeric account id. `provider_id` is Supabase's stable link;
  // identity_data.id is the provider's own id. Both are provider-owned. A
  // server-controlled app_metadata.provider_id is accepted as a last-resort
  // migration-compatible fallback, never a user_metadata field.
  const candidates = [
    ...identities.map((identity) => identity.provider_id),
    ...dataList.map((data) => data.id),
    ...dataList.map((data) => data.user_id),
    ...dataList.map((data) => data.sub),
    user.app_metadata?.provider_id
  ];

  let githubUserId = null;
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n > 0) {
      githubUserId = n;
      break;
    }
  }

  return { login, githubUserId };
}

/**
 * Record the identity on github_connections.
 *
 * Returns `{ linked, reason }`. Deliberately does NOT write an access token —
 * Supabase never gives us one, and minting a token here would require
 * re-implementing its client exchange for no gain.
 *
 * Optional `accessToken` (plus `fetchImpl` for tests) asks GitHub `/user` when
 * the provider identity is incomplete. This is the authoritative path for the
 * repository grant; provisionGitHubIdentity itself remains usable without it.
 */
export async function provisionGitHubIdentity({
  sql,
  tenantId,
  userId,
  user,
  accessToken = null,
  fetchImpl = fetch
}) {
  let { login, githubUserId } = extractGitHubIdentity(user);

  if ((!login || githubUserId == null) && accessToken) {
    const me = await fetchAuthenticatedUser({ accessToken, fetchImpl });
    if (me.ok) {
      login = login || me.login;
      githubUserId = githubUserId ?? me.id;
    }
  }

  if (!login) return { linked: false, reason: "NO_GITHUB_LOGIN_IN_SESSION" };

  // One GitHub account per LOOM account. Enforced in the database by a unique
  // index on github_user_id (migration 038) whenever the id is known; without
  // the id we can still refuse an obviously-taken handle.
  if (githubUserId != null) {
    const [clash] = await sql`
      SELECT user_id FROM github_connections
      WHERE github_user_id = ${githubUserId} AND user_id <> ${userId}
      LIMIT 1
    `;
    if (clash) return { linked: false, reason: "GITHUB_ACCOUNT_ALREADY_LINKED" };
  }

  const existing = await sql`
    INSERT INTO github_connections (user_id, github_username, github_user_id, verified_at, oauth_linked_at)
    VALUES (${userId}, ${login}, ${githubUserId}, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      github_username = EXCLUDED.github_username,
      -- COALESCE: never downgrade an authoritative id from the repository grant
      -- back to NULL because this lighter flow ran afterwards.
      github_user_id = COALESCE(public.github_connections.github_user_id, EXCLUDED.github_user_id),
      verified_at = NOW(),
      oauth_linked_at = NOW()
    RETURNING github_user_id
  `;

  // profiles.github_username is the fallback in resolveStudentIdByLogin, so it
  // must track the verified login or attribution silently splits in two.
  await sql`UPDATE profiles SET github_username = ${login} WHERE user_id = ${userId}`;

  return { linked: true, login, immutable: existing?.[0]?.github_user_id != null };
}
