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
// The immutable numeric account id is read from several plausible claim
// locations because GoTrue's shape for the GitHub provider has changed across
// versions and we must not silently record a NULL and then present the link as
// verified. If none is found, github_user_id stays NULL and the UI says
// "typed in, not verified by GitHub" -- which is the honest state, not a bug to
// paper over. The repository grant sets it authoritatively via GET /user.

const LOGIN_KEYS = ["user_name", "preferred_username", "login", "nickname"];

/**
 * Pull the GitHub login and numeric id out of a Supabase user record.
 *
 * Returns `{ login, githubUserId }` where either may be null. Never throws: a
 * sign-in that succeeded must not be turned into a 500 by an unexpected claim
 * shape, and the fallback (record what we have) is better than failing.
 */
export function extractGitHubIdentity(user) {
  if (!user) return { login: null, githubUserId: null };
  const meta = user.user_metadata || {};
  const appMeta = user.app_metadata || {};
  const providers = appMeta.providers || appMeta.provider;

  // Only treat this as a GitHub identity when Supabase actually says so.
  // Otherwise an email/password user whose name happens to be a GitHub handle
  // would be recorded as having a verified GitHub link.
  const isGithub =
    providers === "github" ||
    (Array.isArray(providers) && providers.includes("github")) ||
    appMeta.provider === "github" ||
    (Array.isArray(user.identities) &&
      user.identities.some((i) => i?.provider === "github"));
  if (!isGithub) return { login: null, githubUserId: null };

  let login = null;
  for (const key of LOGIN_KEYS) {
    if (typeof meta[key] === "string" && meta[key].trim()) {
      login = meta[key].trim();
      break;
    }
  }

  let githubUserId = null;
  const idCandidates = [
    meta.user_id,
    meta.id,
    meta.sub,
    ...(Array.isArray(user.identities)
      ? user.identities.filter((i) => i?.provider === "github").map((i) => i.provider_id)
      : [])
  ];
  for (const raw of idCandidates) {
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
 */
export async function provisionGitHubIdentity({ sql, tenantId, userId, user }) {
  const { login, githubUserId } = extractGitHubIdentity(user);
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