const TOKEN_EXPIRY_SKEW_MS = 60_000;
const DEFAULT_SCOPES = "read:users create:users update:users delete:users";

let tokenCache = { value: "", expiresAt: 0 };

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

function config() {
  const domain = cleanDomain(process.env.AUTH0_DOMAIN);
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
    process.env.AUTH0_MANAGEMENT_CLIENT_ID &&
    process.env.AUTH0_MANAGEMENT_CLIENT_SECRET
  );
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

export function summarizeAuth0Security(user, connection = process.env.AUTH0_DB_CONNECTION || "Username-Password-Authentication") {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  return {
    hasPassword: Boolean(databaseIdentity(user, connection)),
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

export async function ensurePasswordIdentity({ sub, email, password, emailVerified }) {
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

  let created;
  try {
    created = await request("/users", {
      method: "POST",
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        connection,
        email_verified: true,
        verify_email: false
      })
    });
  } catch (error) {
    if (
      error instanceof Auth0ManagementError &&
      (error.status === 409 || /user_exists|already exists/i.test(error.code || ""))
    ) {
      throw new Auth0ManagementError(
        "PASSWORD_IDENTITY_CONFLICT",
        "An account already exists for this email. Sign in with that account before adding a password.",
        409
      );
    }
    throw error;
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
