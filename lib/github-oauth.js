// GitHub OAuth: the server half.
//
// Two distinct grants live here, and conflating them is the mistake worth
// avoiding:
//
//   1. IDENTITY (Flow A) -- handled by Supabase, not by this file. Supabase's
//      GitHub provider requests only `read:user user:email`. It proves WHO
//      someone is. It grants NO repository access, so it cannot prove what they
//      own.
//
//   2. REPOSITORY ACCESS (Flow B) -- what this file implements. Scope `repo`
//      plus `read:user`, exchanged for a bearer token we use to call the REST
//      API as that student. This is the grant that turns "you claim this repo"
//      into "GitHub says you can push to it".
//
// The webhook (POST /api/github/webhook) is a THIRD, independent surface with
// HMAC authentication and no relationship to OAuth. It continues to work
// unchanged for anyone who configures it by hand.

import crypto from "node:crypto";
import { env } from "@/lib/env";
import { open as openSealed } from "@/lib/crypto";

export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_API = "https://api.github.com";

// Pinned per GitHub's versioning policy. Without it, GitHub may change response
// shapes under us and the next deploy inherits the breakage.
const API_VERSION = "2022-11-28";

// `repo` is the classic scope that covers public AND private repositories the
// student owns, plus the ability to create a repository on their account. The
// previous value, `repo:public_repo`, is not a valid scope name; GitHub ignored
// it, so the consent screen claimed less than the token could do and private
// repositories never appeared in the picker.
//
//   repo       -- read/write owned repositories, create repositories
//   read:user  -- GET /user, to bind the immutable account id
//
// We still do NOT ask for `admin:repo_hook`. Installing a hook on the student's
// own repository works with `repo`; asking for admin on every org they belong
// to would be a far broader grant than this feature needs.
export const OAUTH_SCOPES = ["repo", "read:user"];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

// State is the CSRF defence for the whole grant, so it is signed rather than
// merely random: a random value the attacker cannot predict is only half the
// job, because it also has to be *ours*. Signing binds three things that must
// travel together -- the user who started the flow, a single-use nonce, and a
// timestamp -- so a captured callback URL cannot be replayed against another
// account or a week later.
const STATE_TTL_MS = 10 * 60 * 1000;

function stateSecret() {
  const secret = process.env.CREDENTIAL_SECRET || env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("[github-oauth] CREDENTIAL_SECRET (or GITHUB_WEBHOOK_SECRET) is not set — refusing to sign state");
  }
  return secret;
}

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Build the `state` parameter for the authorize redirect. */
export function signState({ userId, nonce }) {
  if (!userId) throw new Error("[github-oauth] signState requires userId");
  if (!nonce) throw new Error("[github-oauth] signState requires a nonce");
  const payload = b64url(JSON.stringify({ u: String(userId), n: String(nonce), t: Date.now() }));
  const sig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Verify a returned `state`.
 *
 * Returns `{ ok: true, userId, nonce }` or `{ ok: false, reason }`. Never
 * throws, because every failure here is an expected condition on a public
 * callback URL -- a bot, a stale tab, a link someone shared -- not an exception
 * worth a 500.
 *
 * The `now` argument is injectable purely so the TTL is testable without
 * faking timers.
 */
export function verifyState({ state, expectedUserId, now = Date.now() }) {
  if (!state || typeof state !== "string") return { ok: false, reason: "MISSING" };
  const parts = state.split(".");
  if (parts.length !== 2) return { ok: false, reason: "MALFORMED" };
  const [payload, sig] = parts;

  const expectedSig = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  if (!timingSafeEqualStr(sig, expectedSig)) return { ok: false, reason: "BAD_SIGNATURE" };

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
  if (!parsed || !parsed.u || !parsed.n || !parsed.t) return { ok: false, reason: "MALFORMED" };
  if (expectedUserId && String(parsed.u) !== String(expectedUserId)) return { ok: false, reason: "USER_MISMATCH" };
  if (now - Number(parsed.t) > STATE_TTL_MS) return { ok: false, reason: "EXPIRED" };
  return { ok: true, userId: parsed.u, nonce: parsed.n };
}

/** The URL we redirect the browser to. */
export function authorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/**
 * Exchange an authorization code for a token.
 *
 * Failure is reported by RETURNING a reason, never by throwing, because the
 * common failure is a student clicking Back or reusing a spent code -- and the
 * response body from GitHub can echo back client input. The caller logs a
 * reason and shows a generic message; it must never surface the raw body,
 * because that is how a client secret or a partial token reaches a log.
 */
export async function exchangeCode({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "OAUTH_NOT_CONFIGURED" };
  }
  if (!code) return { ok: false, reason: "MISSING_CODE" };

  let res;
  try {
    res = await fetchImpl(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        // Without this GitHub replies form-encoded and the body silently parses
        // to a URLSearchParams-shaped string instead of JSON.
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri
      }).toString()
    });
  } catch {
    return { ok: false, reason: "NETWORK" };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "BAD_RESPONSE" };
  }
  if (!res.ok || data?.error || !data?.access_token) {
    // Deliberately does NOT include data.error_description: it can contain
    // client-supplied text, and this project's history already includes one
    // commit for a raw error reaching a log.
    return { ok: false, reason: data?.error === "incorrect_client_credentials" ? "BAD_CLIENT" : "EXCHANGE_FAILED" };
  }
  return {
    ok: true,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    scopes: typeof data.scope === "string" ? data.scope.split(",").map((s) => s.trim()).filter(Boolean) : [],
    expiresIn: data.expires_in ? Number(data.expires_in) : null
  };
}

// ---------------------------------------------------------------------------
// REST calls
// ---------------------------------------------------------------------------

/** Authenticated GitHub REST call. Returns `{ ok, status, data }` -- never throws. */
export async function githubFetch({ path, accessToken, method = "GET", body, fetchImpl = fetch }) {
  if (!accessToken) return { ok: false, status: 401, reason: "NO_TOKEN" };
  let res;
  try {
    res = await fetchImpl(`${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": API_VERSION,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch {
    return { ok: false, status: 0, reason: "NETWORK" };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * The authenticated account.
 *
 * `id` is the value that matters. `login` is a display name a user can change
 * at any time; binding identity to it means a rename silently reassigns a
 * student's proof. `id` is immutable for the life of the account.
 */
export async function fetchAuthenticatedUser({ accessToken, fetchImpl = fetch }) {
  const res = await githubFetch({ path: "/user", accessToken, fetchImpl });
  if (!res.ok || !res.data?.login) return { ok: false, reason: "USER_LOOKUP_FAILED" };
  return {
    ok: true,
    id: Number(res.data.id),
    login: String(res.data.login),
    name: res.data.name || null
  };
}

/**
 * What can this token actually do in this repository?
 *
 * `permissions` reflects the TOKEN's rights, not merely the repo's existence,
 * so `canPush` distinguishes "you own it" from "you have read access to it".
 */
export async function fetchRepoPermissions({ accessToken, fullName, fetchImpl = fetch }) {
  const res = await githubFetch({ path: `/repos/${fullName}`, accessToken, fetchImpl });
  if (!res.ok || !res.data) {
    return { ok: false, reason: res.status === 404 ? "REPO_NOT_FOUND" : "REPO_LOOKUP_FAILED" };
  }
  const perms = res.data.permissions || {};
  return {
    ok: true,
    fullName: String(res.data.full_name || fullName),
    owner: String(res.data.owner?.login || ""),
    // Private or nonexistent repos return 404 to a token without access, so a
    // 404 means "cannot prove" rather than "does not exist".
    private: res.data.private === true,
    canPush: perms.push === true,
    canAdmin: perms.admin === true,
    description: res.data.description || null
  };
}

/**
 * Unseal the caller's OAuth token.
 *
 * This is the first read path for the sealed credential. It deliberately does
 * NOT fall back to a typed handle or a cached grant: a missing or unreadable
 * token means the GitHub-backed features are unavailable until the student
 * re-links. Returning a half-working identity would make the picker look
 * connected while every write failed.
 */
export async function readAccessToken({ sql, userId }) {
  const [conn] = await sql`
    SELECT access_token_cipher, token_expires_at, token_scopes, github_user_id
    FROM github_connections WHERE user_id = ${userId} LIMIT 1
  `;
  if (!conn?.access_token_cipher) return { ok: false, reason: "NOT_LINKED" };
  if (conn.token_expires_at && new Date(conn.token_expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "TOKEN_EXPIRED" };
  }
  try {
    return {
      ok: true,
      accessToken: openSealed(conn.access_token_cipher),
      scopes: Array.isArray(conn.token_scopes) ? conn.token_scopes : [],
      githubUserId: conn.github_user_id == null ? null : Number(conn.github_user_id)
    };
  } catch {
    return { ok: false, reason: "TOKEN_UNREADABLE" };
  }
}

function mapRepo(r) {
  return {
    githubId: Number(r.id) || null,
    fullName: String(r.full_name),
    owner: String(r.owner?.login || r.full_name.split("/")[0]),
    name: String(r.name || r.full_name.split("/")[1] || ""),
    htmlUrl: String(r.html_url || `https://github.com/${r.full_name}`),
    description: r.description ? String(r.description).slice(0, 500) : null,
    language: r.language || null,
    stars: Number(r.stargazers_count) || 0,
    forks: Number(r.forks_count) || 0,
    openIssues: Number(r.open_issues_count) || 0,
    topics: Array.isArray(r.topics) ? r.topics.slice(0, 20) : [],
    isPrivate: r.private === true,
    isFork: r.fork === true,
    defaultBranch: r.default_branch || null,
    pushedAt: r.pushed_at || null,
    canPush: r.permissions?.push === true,
    canAdmin: r.permissions?.admin === true
  };
}

/** One page of repositories the token can write to -- for a picker, not a URL box. */
export async function listWritableRepos({ accessToken, page = 1, perPage = 100, fetchImpl = fetch }) {
  const res = await githubFetch({
    path: `/user/repos?per_page=${perPage}&page=${page}&affiliation=owner,collaborator,organization_member&sort=pushed`,
    accessToken,
    fetchImpl
  });
  if (!res.ok || !Array.isArray(res.data)) {
    return {
      ok: false,
      status: res.status,
      reason:
        res.status === 401
          ? "TOKEN_REJECTED"
          : res.status === 403
            ? "SCOPE_MISSING"
            : "REPO_LIST_FAILED"
    };
  }
  return { ok: true, repos: res.data.filter((r) => r?.full_name).map(mapRepo) };
}

/** Create a repository on the authenticated account. */
export async function createUserRepo({ accessToken, name, description = "", isPrivate = false, fetchImpl = fetch }) {
  const res = await githubFetch({
    path: "/user/repos",
    accessToken,
    method: "POST",
    body: { name, description, private: isPrivate, auto_init: true },
    fetchImpl
  });
  if (!res.ok || !res.data?.full_name) {
    if (res.status === 422) return { ok: false, reason: "NAME_TAKEN" };
    if (res.status === 401) return { ok: false, reason: "TOKEN_REJECTED" };
    if (res.status === 403) return { ok: false, reason: "SCOPE_MISSING" };
    return { ok: false, reason: "CREATE_FAILED" };
  }
  return { ok: true, repo: mapRepo(res.data) };
}

// ---------------------------------------------------------------------------
// Webhook installation
// ---------------------------------------------------------------------------

/**
 * Ensure a repository webhook points at this deployment.
 *
 * WHY THE DEDUPE CHECK IS NOT OPTIONAL
 *
 * GitHub sends one delivery PER SUBSCRIBED HOOK. Two hooks on the same repo
 * means the same push arrives twice with two DIFFERENT X-GitHub-Delivery ids.
 * The ingest path dedupes on `${deliveryId}-${eventName}`, so a replay cannot be
 * detected -- these are two distinct, genuinely-received events. Every commit in
 * that push would be counted twice, inflating the student's score with no
 * attacker involved. That is a correctness bug, not an exploit, and it would
 * happen to anyone who added our webhook by hand and then linked via OAuth.
 *
 * So: list first, install only if our URL is absent. GET /repos/{o}/{r}/hooks
 * requires admin on the repo, which is exactly the permission needed to install
 * one -- if the list fails we skip rather than guess, because a duplicate hook
 * is worse than a missing one.
 */
export async function ensureWebhook({ accessToken, fullName, webhookUrl, secret, fetchImpl = fetch }) {
  if (!accessToken) return { ok: false, reason: "NO_TOKEN" };
  if (!webhookUrl) return { ok: false, reason: "NO_WEBHOOK_URL" };
  if (!/^https?:\/\//.test(webhookUrl)) return { ok: false, reason: "INVALID_WEBHOOK_URL" };

  const existing = await githubFetch({
    path: `/repos/${fullName}/hooks`,
    accessToken,
    fetchImpl
  });
  if (!existing.ok) {
    // 403 = no admin on the repo (common for org repos). Not fatal: the
    // project can still be confirmed by a lead in /admin/ranking.
    return { ok: false, reason: existing.status === 403 ? "NEEDS_ADMIN" : "HOOK_LIST_FAILED" };
  }
  const hooks = Array.isArray(existing.data) ? existing.data : [];
  const already = hooks.some((h) => h?.config?.url === webhookUrl);
  if (already) {
    return { ok: true, installed: false, alreadyPresent: true, count: hooks.length };
  }

  const created = await githubFetch({
    path: `/repos/${fullName}/hooks`,
    accessToken,
    method: "POST",
    body: {
      name: "web",
      active: true,
      // Pushes prove work happened; pull_request opened/reopened carry commits.
      // Deliberately NOT subscribed to `issues`, `issue_comment` or `*` --
      // none of those are evidence of building and each one costs rate limit.
      events: ["push", "pull_request"],
      config: {
        url: webhookUrl,
        content_type: "json",
        secret,
        insecure_ssl: "0"
      }
    },
    fetchImpl
  });
  if (!created.ok) {
    return { ok: false, reason: created.status === 403 ? "NEEDS_ADMIN" : "HOOK_CREATE_FAILED" };
  }
  return { ok: true, installed: true, alreadyPresent: false, id: created.data?.id ?? null };
}

/** Parse `owner/repo` strictly. Reuse lib/ranking.js's parser rather than a second one. */
export function parseFullName(fullName) {
  if (typeof fullName !== "string") return null;
  const m = /^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(fullName.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2], fullName: `${m[1]}/${m[2]}` };
}