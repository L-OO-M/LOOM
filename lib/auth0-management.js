const TOKEN_EXPIRY_SKEW_MS = 60_000;
const DEFAULT_SCOPES = "read:users create:users update:users delete:users";
const POLICY_CACHE_MS = 5 * 60_000;

// What the tenant's database connection enforces. The app must never advertise
// a weaker rule than the provider: on 2026-11-24 the connection required a
// 15-character password and a username at signup, while this code sent neither,
// so every "add a password" attempt was rejected and reported as "use a
// stronger password" no matter what the member typed. getPasswordPolicy() reads
// the live values; these constants are the fallback when read:connections is
// not granted to the management app.
export const PASSWORD_MIN_LENGTH = 15;
export const USERNAME_MAX_LENGTH = 15;

let tokenCache = { value: "", expiresAt: 0 };
let policyCache = { value: null, expiresAt: 0 };

export class Auth0ManagementError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "Auth0ManagementError";
    this.code = code;
    this.status = status;
  }
}

function cleanDomain(value) {
  return String(value || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/**
 * Domain used for Management API calls.
 *
 * AUTH0_MANAGEMENT_DOMAIN exists because a custom sign-in domain changes
 * AUTH0_DOMAIN for the SDK, while Auth0 requires the Management API *audience*
 * to stay the tenant domain (`https://<tenant>.auth0.com/api/v2/`). A token
 * minted for `https://auth.example.com/api/v2/` is rejected, which would break
 * password management and the config verifier without any obvious error at
 * sign-in time. Set AUTH0_MANAGEMENT_DOMAIN to the tenant domain and keep
 * AUTH0_DOMAIN on the custom domain.
 */
export function auth0ManagementDomain() {
  return cleanDomain(process.env.AUTH0_MANAGEMENT_DOMAIN || process.env.AUTH0_DOMAIN);
}

function config() {
  const domain = auth0ManagementDomain();
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
  const connection = process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication";
  if (!domain || !clientId || !clientSecret) {
    throw new Auth0ManagementError(
      "AUTH0_MANAGEMENT_NOT_CONFIGURED",
      "Password management is not configured for this deployment.",
      503
    );
  }
  return { domain, clientId, clientSecret, connection };
}

export function isAuth0ManagementConfigured() {
  return Boolean(
    cleanDomain(process.env.AUTH0_DOMAIN) &&
    auth0ManagementDomain() &&
    process.env.AUTH0_MANAGEMENT_CLIENT_ID &&
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET
  );
}

/**
 * The password rule the tenant actually enforces.
 *
 * Auth0's database connection owns the policy (length, complexity, history,
 * dictionary) and the signup attributes (is a username required?). The app used
 * to assume 8 characters and no username, which is how a member ended up in an
 * endless "use a stronger password" loop. Reading it here keeps the UI and the
 * request in step with the tenant instead of with a stale constant.
 *
 * Returns null when the connection cannot be read (missing scope, wrong
 * AUTH0_DB_CONNECTION, provider outage); callers fall back to the constants
 * above rather than blocking password setup.
 */
export async function getPasswordPolicy() {
  const now = Date.now();
  if (policyCache.value && policyCache.expiresAt > now) return policyCache.value;

  const connectionId = process.env.AUTH0_DB_CONNECTION_ID;
  const connectionName = process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication";
  const path = connectionId
    ? `/connections/${encodeURIComponent(connectionId)}`
    : `/connections?name=${encodeURIComponent(connectionName)}`;

  let connection;
  try {
    const result = await request(path);
    connection = Array.isArray(result) ? result[0] : result;
  } catch {
    return null;
  }

  const complexity = connection?.options?.password_options?.complexity;
  const minLength = Number(complexity?.min_length);
  const policy = {
    minLength: Number.isFinite(minLength) && minLength > 0 ? minLength : PASSWORD_MIN_LENGTH,
    requiresUsername: connection?.options?.attributes?.username?.signup?.status === "required"
  };
  policyCache = { value: policy, expiresAt: now + POLICY_CACHE_MS };
  return policy;
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.value && tokenCache.expiresAt - TOKEN_EXPIRY_SKEW_MS > now) {
    return tokenCache.value;
  }

  const { domain, clientId, clientSecret } = config();
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    audience: `https://${domain}/api/v2/`,
    scope: process.env.AUTH0_MANAGEMENT_SCOPES || DEFAULT_SCOPES
  });

  const response = await fetch(`https://${domain}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Auth0ManagementError(
      "AUTH0_MANAGEMENT_AUTH_FAILED",
      "The identity provider rejected its management credentials.",
      503
    );
  }

  const expiresIn = Number(payload.expires_in) || 300;
  tokenCache = {
    value: payload.access_token,
    expiresAt: now + expiresIn * 1000
  };
  return tokenCache.value;
}

async function request(path, options = {}) {
  const { domain } = config();
  const token = await getToken();
  const response = await fetch(`https://${domain}/api/v2${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(options.headers || {})
    },
    cache: "no-store"
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.errorCode || payload?.error || "AUTH0_MANAGEMENT_REQUEST_FAILED";
    throw new Auth0ManagementError(code, payload?.message || "The identity provider request failed.", response.status);
  }
  return payload;
}

function databaseIdentity(user, connection) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return identities.find((identity) => {
    if (!identity || identity.provider !== "auth0") return false;
    return !identity.connection || identity.connection === connection;
  }) || null;
}

/**
 * A username the database connection will accept.
 *
 * The connection can require a username at signup (attributes.username). It
 * allows 1–15 characters and rejects values shaped like an email or a phone
 * number, so anything we derive is lowercased, reduced to [a-z0-9._-], capped
 * at USERNAME_MAX_LENGTH, and dropped when it is all digits.
 */
function sanitizeUsername(value) {
  const cleaned = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[-._]+/, "")
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/[-._]+$/, "");
  if (!cleaned || /^\d+$/.test(cleaned)) return "";
  return cleaned;
}

/**
 * Last-resort username: opaque, stable, and effectively collision-free.
 *
 * `u_` plus 12 characters of the canonical user id is 14 characters, inside the
 * connection's 15-character ceiling. The member never types it — email is the
 * identifier they sign in with — so it only has to be unique and valid.
 */
function fallbackUsername(seed) {
  const hex = String(seed || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  if (hex) return `u_${hex}`;
  return `u_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Username to store on a new database identity.
 *
 * Prefers something the member would recognise (their public handle, then their
 * GitHub handle, then the local part of their address) and falls back to the
 * opaque id when none of them survives validation.
 */
export function auth0Username({ handle, githubUsername, email, userId } = {}) {
  const localPart = typeof email === "string" ? email.split("@")[0] : "";
  for (const candidate of [handle, githubUsername, localPart]) {
    const value = sanitizeUsername(candidate);
    if (value) return value;
  }
  return fallbackUsername(userId);
}

/**
 * True only when Auth0 rejected the password itself (strength, dictionary,
 * history, or personal information). Anything else that comes back as a 400 is
 * our request's fault and must not be reported to the member as "weak password"
 * — that is exactly what hid this bug.
 */
export function isPasswordPolicyError(error) {
  if (!(error instanceof Auth0ManagementError) || error.status !== 400) return false;
  const text = `${error.code || ""} ${error.message || ""}`;
  return /password(strength|dictionary|history|no_?user_?info)|password is too weak|password is too common/i.test(text);
}

export function summarizeAuth0Security(user, connection = process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication") {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return {
    hasPassword: Boolean(databaseIdentity(user, connection)),
    // The onboarding password card names the address the member must type into
    // Auth0's sign-in form. Without it, someone whose account was created through
    // Google has no idea which email to use.
    email: typeof user?.email === "string" ? user.email : null,
    emailVerified: user?.email_verified === true,
    identities: identities.map((identity) => ({
      provider: identity.provider || null,
      connection: identity.connection || null,
      isSocial: identity.isSocial === true
    }))
  };
}

export async function getAuth0User(sub) {
  if (typeof sub !== "string" || !sub) {
    throw new Auth0ManagementError("AUTH0_SUBJECT_MISSING", "The signed-in identity has no subject.", 400);
  }
  return request(`/users/${encodeURIComponent(sub)}`);
}

export async function getAuth0Security(sub) {
  const user = await getAuth0User(sub);
  return summarizeAuth0Security(user, config().connection);
}

export async function ensurePasswordIdentity({ sub, email, password, emailVerified, username, userId }) {
  const { connection } = config();
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail || emailVerified !== true) {
    throw new Auth0ManagementError(
      "EMAIL_UNVERIFIED",
      "Verify your email before adding a password.",
      400
    );
  }

  const user = await getAuth0User(sub);
  if (user?.email_verified !== true) {
    throw new Auth0ManagementError("EMAIL_UNVERIFIED", "Verify your email before adding a password.", 400);
  }

  const existing = databaseIdentity(user, connection);
  if (existing) {
    await request(`/users/${encodeURIComponent(existing.user_id)}`, {
      method: "PATCH",
      body: JSON.stringify({ password, connection })
    });
    return { hasPassword: true, created: false };
  }

  // A connection that requires a username rejects the create with
  // `invalid_body: Missing required property: username` BEFORE it looks at the
  // password, so it must be sent even though the app signs people in by email.
  const preferred = auth0Username({ handle: username, email: normalizedEmail, userId: userId || sub });
  const fallback = fallbackUsername(userId || sub);
  const candidates = preferred === fallback ? [preferred] : [preferred, fallback];

  let created = null;
  for (const candidate of candidates) {
    try {
      created = await request("/users", {
        method: "POST",
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          username: candidate,
          connection,
          email_verified: true,
          verify_email: false
        })
      });
      break;
    } catch (error) {
      const conflict = error instanceof Auth0ManagementError &&
        (error.status === 409 || /user_exists|already exists/i.test(error.code || ""));
      // A conflict is either a taken username or an address that already has an
      // account. Only the last candidate can be the address, so retry the
      // opaque one first and report the conflict only when that collides too.
      if (!conflict) throw error;
      if (candidate === candidates[candidates.length - 1]) {
        throw new Auth0ManagementError(
          "PASSWORD_IDENTITY_CONFLICT",
          "An account already exists for this email. Sign in with that account before adding a password.",
          409
        );
      }
    }
  }

  if (!created) {
    throw new Auth0ManagementError(
      "PASSWORD_IDENTITY_CONFLICT",
      "An account already exists for this email. Sign in with that account before adding a password.",
      409
    );
  }

  try {
    await request(`/users/${encodeURIComponent(sub)}/identities`, {
      method: "POST",
      body: JSON.stringify({ provider: "auth0", user_id: created.user_id })
    });
  } catch (error) {
    await request(`/users/${encodeURIComponent(created.user_id)}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }

  return { hasPassword: true, created: true };
}
