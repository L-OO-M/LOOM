// Enable the tenant's GitHub social connection for the LOOM application.
//
// Why this exists: GitHub sign-in is a per-application switch on the Auth0
// connection (`enabled_clients`), not a property of the connection's GitHub
// OAuth app. Setting the client id/secret, or adding the connection to the
// tenant, is not enough -- until the LOOM client is in that list, /authorize
// answers as if the connection did not exist and the member lands on Auth0's
// "Oops" page.
//
// It needs a Management API token with `read:connections` and
// `update:connections`. The default M2M grant here has neither, so the script
// explains how to grant them instead of failing with a bare 403.
//
//   node load/auth0-enable-github.js --check   # probe only, no token, no writes
//   node load/auth0-enable-github.js           # enable, then verify
//
// The npm wrappers are `npm run auth:github:check` and `npm run auth:github`.
// The check flag lives in its own script because `npm run … -- --check` drops
// forwarded arguments in this environment (verified: the script receives none).
//
// Exit codes: 0 the connection reaches GitHub, 1 blocked (--check) or the probe
// was unexpected, 2 missing management scope, 3 no GitHub connection, 4 the PATCH
// did not stick, 5 enabled but still not reaching GitHub (OAuth app credentials).
//
// Secrets come from the environment or .env.local (load/env-local.js). Nothing
// is printed except the tenant domain, the client id, the connection name and
// the verification result.
import "./env-local.js";

const DOMAIN = String(process.env.AUTH0_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
const CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const MGMT_ID = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
const MGMT_SECRET = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;
// The callback is only used to build a realistic /authorize request; the probe
// reads the first redirect and never follows it to our app.
const CALLBACK = `${String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.lets-loom.xyz").replace(/\/+$/, "")}/auth/callback`;
const WANTED = "read:connections update:connections";
const checkOnly = process.argv.includes("--check");

function fail(message, code = 1) {
  console.error(`\n✗ ${message}`);
  process.exit(code);
}

if (!DOMAIN || !CLIENT_ID) {
  fail("AUTH0_DOMAIN and AUTH0_CLIENT_ID must be set (env or .env.local).");
}

function authorizeUrl(connection) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: CALLBACK,
    state: `probe-${Math.random().toString(36).slice(2)}`,
    nonce: `probe-${Math.random().toString(36).slice(2)}`,
    connection
  });
  return `https://${DOMAIN}/authorize?${params}`;
}

/**
 * A connection that is usable for this client redirects straight to the
 * provider. One that is absent, renamed, or not enabled for the client bounces
 * to /authorize/resume, which is an error page without a browser session.
 */
async function probe(connection) {
  const res = await fetch(authorizeUrl(connection), { redirect: "manual" });
  const location = res.headers.get("location") || "";
  if (location.includes("github.com")) return { ok: true, status: res.status, location };
  if (location.startsWith("/authorize/resume")) return { ok: false, reason: "not enabled for this client (or the name is wrong)", status: res.status, location };
  if (location.startsWith("/u/login")) return { ok: false, reason: "Auth0 showed Universal Login instead of the provider", status: res.status, location };
  return { ok: false, reason: `unexpected redirect (${res.status})`, status: res.status, location };
}

async function managementToken() {
  const res = await fetch(`https://${DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: MGMT_ID,
      client_secret: MGMT_SECRET,
      audience: `https://${DOMAIN}/api/v2/`,
      scope: WANTED
    })
  });
  const payload = await res.json().catch(() => ({}));
  return { status: res.status, token: payload.access_token, error: payload.error, granted: payload.scope };
}

async function api(token, path, init = {}) {
  const res = await fetch(`https://${DOMAIN}/api/v2${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  console.log(`tenant ${DOMAIN}`);
  console.log(`client ${CLIENT_ID}`);
  console.log(`callback ${CALLBACK}\n`);

  const before = await probe(process.env.AUTH0_GITHUB_CONNECTION || "github");
  console.log(`probe connection=github: ${before.ok ? "reaches github.com" : `blocked — ${before.reason}`}`);

  if (checkOnly) {
    if (before.ok) return;
    console.log("\n--check made no changes. Run without --check (needs a management token with read:connections update:connections).");
    process.exit(1);
  }

  if (!MGMT_ID || !MGMT_SECRET) {
    fail("AUTH0_MANAGEMENT_CLIENT_ID / AUTH0_MANAGEMENT_CLIENT_SECRET are not set.", 2);
  }

  const auth = await managementToken();
  if (!auth.token) {
    if (auth.error === "access_denied") {
      fail(
        "The management application is not granted connection scopes.\n\n" +
          "  Auth0 Dashboard → Applications → [your M2M app] → APIs tab\n" +
          "  → Auth0 Management API → Edit → tick `read:connections` and `update:connections` → Update\n\n" +
          "Then re-run: node load/auth0-enable-github.js",
        2
      );
    }
    fail(`Management token request failed (${auth.status} ${auth.error || "unknown"}).`, 2);
  }
  console.log(`management token ok (${auth.granted})`);

  const list = await api(auth.token, "/connections?strategy=github&per_page=50");
  if (list.status !== 200 || !Array.isArray(list.body)) {
    fail(`Could not list connections (${list.status}). ${JSON.stringify(list.body)?.slice(0, 200)}`, 3);
  }
  if (list.body.length === 0) {
    fail(
      "No GitHub connection exists in this tenant yet. Create one, then re-run:\n\n" +
        "  Auth0 Dashboard → Authentication → Social → Create Connection → GitHub\n" +
        "  → paste the GitHub OAuth App's client id/secret → Applications tab → enable LOOM",
      3
    );
  }

  let changed = 0;
  for (const connection of list.body) {
    const name = connection.name;
    const enabled = Array.isArray(connection.enabled_clients) ? connection.enabled_clients : [];
    if (enabled.includes(CLIENT_ID)) {
      console.log(`\n${name}: already enabled for this client (${enabled.length} client(s))`);
      continue;
    }
    console.log(`\n${name}: enabling for ${CLIENT_ID} (${enabled.length} → ${enabled.length + 1} client(s))`);
    const patch = await api(auth.token, `/connections/${encodeURIComponent(connection.id)}`, {
      method: "PATCH",
      // Additive only: every other application keeps its access.
      body: JSON.stringify({ enabled_clients: [...enabled, CLIENT_ID] })
    });
    if (patch.status !== 200) {
      fail(`PATCH failed (${patch.status}). ${JSON.stringify(patch.body)?.slice(0, 300)}`, 4);
    }
    const after = Array.isArray(patch.body.enabled_clients) ? patch.body.enabled_clients : [];
    if (!after.includes(CLIENT_ID)) fail("PATCH returned 200 but the client is still not in enabled_clients.", 4);
    console.log(`${name}: enabled`);
    changed += 1;
  }

  if (changed === 0) {
    console.log("\nNothing to write — the client was already listed. The problem is elsewhere (check the connection's GitHub OAuth app credentials).");
  }

  // The API and the runtime can disagree for a few seconds; retry before
  // declaring failure so a fresh token cache does not read as a broken toggle.
  let verified = { ok: false, reason: "not checked" };
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    verified = await probe(process.env.AUTH0_GITHUB_CONNECTION || list.body[0].name);
    if (verified.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (verified.ok) {
    console.log("\n✓ GitHub sign-in now redirects to github.com. Sign in at /login → Continue with GitHub.");
  } else {
    fail(
      `The connection is enabled but /authorize still does not reach GitHub — ${verified.reason}.\n` +
        "Check the connection's GitHub OAuth App client id/secret and its authorization callback URL " +
        `(https://${DOMAIN}/login/callback).`,
      5
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
