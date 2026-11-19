#!/usr/bin/env node
/**
 * Authenticated route + API sweep for LOOM.
 *
 * Signs in once with a real account, then walks EVERY page route in `app/` and
 * EVERY API handler in `app/api/`, including their exported methods, and reports
 * the status each one actually returned. It is deliberately read-only:
 *
 *   - GET/HEAD handlers are called normally (they may read the database).
 *   - POST/PATCH/PUT/DELETE handlers receive a malformed JSON body and an
 *     unknown path id, so auth, CSRF, routing and error handling all run, but a
 *     body-parsing handler rejects the request before writing and a
 *     path-scoped handler cannot find the row.
 *   - Row counts of every user-writable table are snapshotted before and after;
 *     the sweep fails if anything changed.
 *
 * Dynamic segments use REAL ids from the tenant's own rows (events, roadmap
 * nodes, forum threads, profiles, ...), so a dynamic page is tested in the state
 * a signed-in member would actually see; a random id is used only where the
 * table is genuinely empty.
 *
 * Usage:
 *   CHECK_EMAIL=you@example.com CHECK_PASSWORD=... npm run check:auth
 *   node load/check-authenticated.mjs --base=https://www.lets-loom.xyz --pages
 *   node load/check-authenticated.mjs --apis --verbose
 *
 * Exit code 1 if any route returns 5xx, any API breaks the { ok } envelope, or
 * the database changed while the sweep claimed to be read-only.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import "./env-local.js";
import postgres from "postgres";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (arg("--base") || process.env.LIVE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.CHECK_EMAIL || process.env.E2E_LOGIN_EMAIL;
const PASSWORD = process.env.CHECK_PASSWORD || process.env.E2E_LOGIN_PASSWORD;
const VERBOSE = process.argv.includes("--verbose");
const DO_PAGES = !process.argv.includes("--apis");
const DO_APIS = !process.argv.includes("--pages");

const results = { pass: 0, note: 0, fail: 0, skip: 0, failures: [], notes: [], skips: [] };
const jar = new Map();

function arg(name) {
  const hit = process.argv.find((value) => value.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function record(status, line, detail) {
  results[status] += 1;
  const icon = { pass: "PASS", note: "NOTE", fail: "FAIL", skip: "SKIP" }[status];
  if (status !== "pass" || VERBOSE) console.log(`${icon}  ${line}`);
  if (status === "fail") results.failures.push(line);
  if (status === "note") results.notes.push(line + (detail ? ` - ${detail}` : ""));
  if (status === "skip") results.skips.push(line + (detail ? ` - ${detail}` : ""));
}

function storeCookies(response) {
  const cookies = response.headers.getSetCookie?.() ?? [];
  for (const cookie of cookies) {
    const pair = cookie.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(pathname, { method = "GET", body, rawBody, accept = "application/json" } = {}) {
  const headers = { accept, origin: BASE, cookie: cookieHeader() };
  const payload = rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body);
  if (payload !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: payload,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000)
  });
  storeCookies(response);
  return response;
}

async function json(response) {
  const text = await response.text();
  try {
    return { text, body: JSON.parse(text) };
  } catch {
    return { text, body: null };
  }
}

/* ------------------------------------------------------------------ routes */

async function walk(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith("_")) continue;
      await walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function templateFromFile(file) {
  const relative = path.relative(ROOT, file).split(path.sep).join("/");
  const dir = relative.slice(0, relative.lastIndexOf("/"));
  const segments = dir
    .split("/")
    .slice(1) // drop `app`
    .filter((segment) => !segment.startsWith("("));
  return `/${segments.join("/")}`.replace(/\/$/, "") || "/";
}

function collectParams(template) {
  return [...template.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
}

function fill(template, values) {
  return template.replace(/\[([^\]]+)\]/g, (_, name) => values[name] ?? randomUUID());
}

/* -------------------------------------------------------------------- seed */

async function loadIds() {
  if (!process.env.DATABASE_URL) return {};
  const sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5, prepare: false });
  const one = async (query) => {
    try {
      const [row] = await query;
      return row ?? null;
    } catch {
      return null;
    }
  };
  const ids = {
    event: (await one(sql`SELECT id FROM events ORDER BY starts_at DESC NULLS LAST LIMIT 1`))?.id,
    department: (await one(sql`SELECT slug FROM departments WHERE active IS TRUE LIMIT 1`))?.slug,
    username: (await one(sql`SELECT username FROM user_profiles ORDER BY created_at ASC LIMIT 1`))?.username,
    certificate: (await one(sql`SELECT code FROM certificates LIMIT 1`))?.code,
    credential: (await one(sql`SELECT id FROM verifiable_credentials LIMIT 1`))?.id,
    thread: (await one(sql`SELECT id FROM forum_threads LIMIT 1`))?.id,
    wiki: (await one(sql`SELECT slug FROM wiki_pages LIMIT 1`))?.slug,
    project: (await one(sql`SELECT id FROM projects ORDER BY created_at DESC LIMIT 1`))?.id,
    resource: (await one(sql`SELECT id FROM resources LIMIT 1`))?.id,
    node: (await one(sql`SELECT id FROM roadmap_nodes LIMIT 1`))?.id,
    contest: (await one(sql`SELECT id FROM contests LIMIT 1`))?.id,
    challenge: (await one(sql`SELECT slug FROM debug_challenges LIMIT 1`))?.slug,
    profile: (await one(sql`SELECT user_id FROM profiles WHERE role = 'student' LIMIT 1`))?.user_id,
    notification: (await one(sql`SELECT id FROM notifications ORDER BY created_at DESC LIMIT 1`))?.id,
    mou: (await one(sql`SELECT id FROM mous LIMIT 1`))?.id,
    mouDocument: (await one(sql`SELECT id FROM mou_documents LIMIT 1`))?.id,
    asset: (await one(sql`SELECT id FROM media_assets LIMIT 1`))?.id,
    handover: (await one(sql`SELECT id FROM lead_handovers LIMIT 1`))?.id,
    task: (await one(sql`SELECT id FROM event_ops_tasks LIMIT 1`))?.id,
    mentorApplication: (await one(sql`SELECT id FROM mentor_applications LIMIT 1`))?.id,
    request: (await one(sql`SELECT id FROM feature_requests LIMIT 1`))?.id,
    snippet: (await one(sql`SELECT id FROM code_snippets LIMIT 1`))?.id,
    announcement: (await one(sql`SELECT id FROM announcements LIMIT 1`))?.id,
    expense: (await one(sql`SELECT id FROM expenses LIMIT 1`))?.id,
    sponsorship: (await one(sql`SELECT id FROM sponsorships LIMIT 1`))?.id,
    report: (await one(sql`SELECT id FROM dept_reports LIMIT 1`))?.id,
    match: (await one(sql`SELECT id FROM help_matches LIMIT 1`))?.id,
    contribution: (await one(sql`SELECT id FROM student_oss_contributions LIMIT 1`))?.id
  };
  await sql.end({ timeout: 5 });
  return Object.fromEntries(Object.entries(ids).filter(([, value]) => value));
}

const RULES = [
  [/^\/api\/admin\/events\//, "event"],
  [/^\/api\/events\//, "event"],
  [/^\/api\/admin\/students\//, "profile"],
  [/^\/api\/departments\//, "department"],
  [/^\/api\/community\/threads\//, "thread"],
  [/^\/api\/community\/snippets\//, "snippet"],
  [/^\/api\/community\/wiki\//, "wiki"],
  [/^\/api\/projects\//, "project"],
  [/^\/api\/roadmap\/progress/, "node"],
  [/^\/api\/notifications\//, "notification"],
  [/^\/api\/feature-requests\/([^/]+)\//, "request"],
  [/^\/api\/help\/matches\//, "match"],
  [/^\/api\/opensource\/contributions\//, "contribution"],
  [/^\/api\/lead\/assets\//, "asset"],
  [/^\/api\/lead\/event-ops\//, "task"],
  [/^\/api\/lead\/handover\//, "handover"],
  [/^\/api\/lead\/mous\/([^/]+)\/documents/, "mouDocument"],
  [/^\/api\/lead\/mous\//, "mou"],
  [/^\/api\/lead\/directory\//, "profile"],
  [/^\/api\/reports\//, "report"],
  [/^\/api\/contests\/manage/, "contest"],
  [/^\/api\/mentorship\//, "mentorApplication"],
  [/^\/api\/volunteers\//, "event"],
  [/^\/api\/announcements\//, "announcement"],
  [/^\/api\/finance\/expenses/, "expense"],
  [/^\/api\/finance\/sponsorships/, "sponsorship"],
  [/^\/api\/admin\/contests\//, "contest"],
  [/^\/api\/admin\/achievements/, "profile"],
  [/^\/api\/admin\/badges/, "node"],
  [/^\/student\/community\/forums\//, "thread"],
  [/^\/student\/community\/wiki\//, "wiki"],
  [/^\/student\/contests\//, "contest"],
  [/^\/student\/debug\//, "challenge"],
  [/^\/student\/events\//, "event"],
  [/^\/student\/projects\//, "project"],
  [/^\/student\/resources\//, "resource"],
  [/^\/student\/roadmap\//, "node"],
  [/^\/student\/network\//, "username"],
  [/^\/student\/certificates\//, "certificate"],
  [/^\/student\/[^/]+$/, "username"],
  [/^\/admin\/events\//, "event"],
  [/^\/admin\/students\//, "profile"],
  [/^\/events\//, "event"],
  [/^\/domains\//, "department"],
  [/^\/u\//, "username"],
  [/^\/verify\/certificate\//, "certificate"],
  [/^\/verify\/credential\//, "credential"]
];

const PARAM_DEFAULTS = {
  username: "username",
  code: "certificate",
  nodeId: "node",
  resourceId: "resource",
  userId: "profile",
  documentId: "mouDocument"
};

function resolveParams(template, ids, { unknown = false } = {}) {
  const ruleKey = RULES.find(([pattern]) => pattern.test(template))?.[1];
  const values = {};
  for (const name of collectParams(template)) {
    const key = ruleKey || PARAM_DEFAULTS[name];
    values[name] = unknown ? randomUUID() : ids[key] ?? randomUUID();
  }
  return values;
}

/* ------------------------------------------------------------------ checks */

// A server component that throws does NOT always produce a 5xx: Next streams a
// 200 whose HTML contains the app's error boundary instead. The previous markers
// were the literal source entities ("didn&rsquo;t load"), which never appear in a
// serialized response — every broken page passed. Match the rendered copy, in
// both entity and real-character form, and the RSC error strings.
//
// KNOWN LIMIT: when the throw happens after the shell is flushed, the boundary
// copy and the RSC error string are never in the initial HTML at all (verified
// against a page that was failing for every event: 200, boundary only after
// hydration). No HTTP-level check can see that class; e2e/admin-audit.spec.js
// covers it by watching console/page errors in a real browser. Keep both.
const ERROR_MARKERS = [
  "something snagged a thread",
  "this page didn't load",
  "this page didn’t load",
  "something broke on our side",
  "an error occurred in the server components render",
  "application error: a server-side exception",
  "__next_error__"
];

async function checkPage(template, ids) {
  const pathname = fill(template, resolveParams(template, ids));
  let response;
  try {
    response = await request(pathname, { accept: "text/html" });
  } catch (error) {
    return record("fail", `PAGE ${pathname}`, `request failed: ${error.message}`);
  }
  const location = response.headers.get("location") || "";
  const dynamic = collectParams(template).length > 0;

  if (response.status >= 500) {
    return record("fail", `PAGE ${pathname}`, `HTTP ${response.status}`);
  }
  if (response.status >= 300 && response.status < 400) {
    const target = location ? new URL(location, BASE) : null;
    const internal = Boolean(target) && target.origin === new URL(BASE).origin;
    return record(internal ? "note" : "fail", `PAGE ${pathname}`, `${response.status} -> ${target?.pathname ?? "no location"}`);
  }
  if (response.status === 404) {
    return record(dynamic ? "pass" : "fail", `PAGE ${pathname}`, "404");
  }
  if (response.status !== 200) {
    return record("fail", `PAGE ${pathname}`, `HTTP ${response.status}`);
  }
  const text = (await response.text()).toLowerCase();
  const marker = ERROR_MARKERS.find((needle) => text.includes(needle));
  if (marker) return record("fail", `PAGE ${pathname}`, `rendered the error boundary (${marker})`);
  if (!text.includes("<html")) return record("fail", `PAGE ${pathname}`, "200 but not an HTML document");
  return record("pass", `PAGE ${pathname}`);
}

const BINARY_TYPES = [
  "application/pdf",
  "application/zip",
  "application/octet-stream",
  "text/csv",
  "text/calendar",
  "image/png",
  "image/svg+xml",
  "text/plain",
  "text/markdown"
];

// Endpoints that act on the session or the queue with no body to validate. A
// malformed payload cannot stop them, so calling them would create real side
// effects (an OAuth state, a provider sync, a queued job). They are named
// explicitly instead of being skipped inside a generic branch.
const NO_BODY_SIDE_EFFECTS = new Map([
  ["/api/practice/refresh", "starts a provider sync and writes practice rows"],
  ["/api/github/sync", "talks to GitHub and rewrites repositories"],
  ["/api/consent", "records a consent row for the session user"],
  ["/api/jobs/run", "dispatches a background job"],
  ["/api/auth/login", "already exercised by the sweep's own sign-in (and rate limited)"]
]);

// Mutating methods get an unknown id plus a malformed JSON body: zod .parse()
// throws before a write and a path-scoped handler cannot find the row. The
// row-count guard below proves the claim.
const MALFORMED_JSON = '{"__sweep_probe": ';

async function checkApi(method, template, ids, source) {
  if (NO_BODY_SIDE_EFFECTS.has(template)) {
    return record("skip", `API ${method} ${template}`, NO_BODY_SIDE_EFFECTS.get(template));
  }
  const mutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method);
  const hasParams = collectParams(template).length > 0;
  // A state-changing method with neither a path id nor a parsed body cannot be
  // constrained by anything this sweep controls: DELETE /api/github unlinks the
  // caller's account outright. Those are skipped by name-of-rule rather than
  // fired at a real account.
  if (mutating && !hasParams && !parsesBody(source, method)) {
    return record("skip", `API ${method} ${template}`, "state change with no id or body to constrain it");
  }
  const pathname = fill(template, resolveParams(template, ids, { unknown: mutating }));
  let response;
  try {
    response = await request(pathname, { method, rawBody: mutating ? MALFORMED_JSON : undefined });
  } catch (error) {
    return record("fail", `API ${method} ${pathname}`, `request failed: ${error.message}`);
  }

  if (response.status >= 500) {
    const body = await json(response);
    return record("fail", `API ${method} ${pathname}`, `HTTP ${response.status} ${body.text.slice(0, 120)}`);
  }
  if (response.status === 429) {
    return record("note", `API ${method} ${pathname}`, "429 rate limited (handler ran)");
  }
  if (response.status >= 300 && response.status < 400) {
    return record("pass", `API ${method} ${pathname}`, `${response.status} -> ${response.headers.get("location")}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    const binary = BINARY_TYPES.some((type) => contentType.includes(type)) || contentType === "";
    return record(binary ? "pass" : "fail", `API ${method} ${pathname}`, `HTTP ${response.status} ${contentType}`);
  }

  const { body, text } = await json(response);
  if (!body || typeof body !== "object" || typeof body.ok !== "boolean") {
    return record("fail", `API ${method} ${pathname}`, `envelope missing ok: ${text.slice(0, 120)}`);
  }
  if (body.ok === false && !body.error?.code) {
    return record("fail", `API ${method} ${pathname}`, "ok:false without error.code");
  }
  return record("pass", `API ${method} ${pathname}`, `${response.status}${body.ok ? "" : ` ${body.error.code}`}`);
}

function methodsOf(source) {
  const methods = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) {
    methods.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*=/g)) {
    methods.add(match[1]);
  }
  return [...methods];
}

// The source slice for one exported handler, so "does THIS method read a body"
// is answered per method instead of per file. DELETE /api/github shares a file
// with a POST that parses JSON; treating the file as body-parsing is exactly how
// a sweep unlinks an account.
function methodSource(source, method) {
  const start = source.search(new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b`));
  if (start < 0) return "";
  const rest = source.slice(start + 10);
  const next = rest.search(/export\s+(?:async\s+)?(?:function|const)\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
  return next < 0 ? rest : rest.slice(0, next);
}

function parsesBody(source, method) {
  return /request\.json\(\)/.test(methodSource(source, method));
}

/* ------------------------------------------------------------------ guards */

const WRITABLE = [
  "audit_logs",
  "notifications",
  "announcements",
  "faqs",
  "events",
  "event_registrations",
  "event_materials",
  "project_members",
  "projects",
  "project_milestones",
  "followers",
  "user_endorsements",
  "user_profiles",
  "profiles",
  "forum_threads",
  "forum_replies",
  "forum_votes",
  "forum_flags",
  "wiki_pages",
  "wiki_edit_requests",
  "code_snippets",
  "feature_requests",
  "feature_request_comments",
  "consent_records",
  "help_signals",
  "help_matches",
  "student_roadmap_progress",
  "resource_progress",
  "planner_sessions",
  "practice_connections",
  "github_connections",
  "media_assets",
  "departments",
  "department_memberships",
  "contests",
  "contest_registrations",
  "mentor_applications",
  "mentor_sessions",
  "mous",
  "expenses",
  "sponsorships",
  "volunteer_signups",
  "dept_reports",
  "report_revisions",
  "lead_handovers",
  "event_ops_tasks",
  "student_achievements",
  "member_contributions"
];

async function snapshot() {
  if (!process.env.DATABASE_URL) return null;
  const sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5, prepare: false });
  const rows = {};
  for (const table of WRITABLE) {
    try {
      // eslint-disable-next-line no-restricted-syntax -- the table name comes from the WRITABLE constant above (never from input), and COUNT(*) needs a dynamic FROM; a tagged template cannot interpolate an identifier.
      const [row] = await sql.unsafe(`SELECT COUNT(*)::int AS n FROM ${table}`);
      rows[table] = row?.n ?? 0;
    } catch {
      /* table may not exist in this deployment */
    }
  }
  await sql.end({ timeout: 5 });
  return rows;
}

/* -------------------------------------------------------------------- main */

if (!EMAIL || !PASSWORD) {
  console.error("Set CHECK_EMAIL / CHECK_PASSWORD (or E2E_LOGIN_EMAIL / E2E_LOGIN_PASSWORD).");
  process.exit(2);
}

console.log(`LOOM authenticated sweep - ${BASE}`);
const before = await snapshot();

const login = await request("/api/auth/login", {
  method: "POST",
  body: { email: EMAIL, password: PASSWORD }
});
const loginBody = await json(login);
if (login.status !== 200 || !loginBody.body?.ok) {
  console.error(`Sign-in failed (${login.status}): ${loginBody.text.slice(0, 200)}`);
  process.exit(2);
}
const me = await request("/api/profile");
const meBody = await json(me);
if (me.status !== 200 || !meBody.body?.ok) {
  console.error(`/api/profile failed for a signed-in user (${me.status})`);
  process.exit(2);
}
const role = meBody.body?.data?.profile?.role ?? "unknown";
const tenant = meBody.body?.data?.profile?.tenant_id ?? "unknown";
console.log(`Signed in as ${EMAIL} - role: ${role}, tenant: ${tenant}\n`);

const ids = await loadIds();
const files = await walk(path.join(ROOT, "app"));

if (DO_PAGES) {
  const pages = files.filter((file) => /[\\/]page\.jsx$/.test(file));
  console.log(`- Pages (${pages.length}) -`);
  for (const file of pages) await checkPage(templateFromFile(file), ids);
  console.log("");
}

if (DO_APIS) {
  const routes = files.filter((file) => /[\\/]route\.js$/.test(file));
  console.log(`- API handlers (${routes.length}) -`);
  for (const file of routes) {
    const template = templateFromFile(file);
    const source = await readFile(file, "utf8");
    const methods = methodsOf(source);
    if (!methods.length) {
      record("skip", `API ${template}`, "no exported HTTP method");
      continue;
    }
    for (const method of methods) {
      // HEAD is answered by Next from GET and OPTIONS is framework-generated.
      if (method === "HEAD" || method === "OPTIONS") {
        record("skip", `API ${method} ${template}`, "framework-handled");
        continue;
      }
      await checkApi(method, template, ids, source);
    }
  }
}

const after = await snapshot();
if (before && after) {
  const changed = Object.entries(after)
    .filter(([table, count]) => count !== before[table])
    .map(([table, count]) => `${table} ${before[table]}->${count}`);
  if (changed.length) {
    console.log(`\nWARNING: database changed during a supposedly read-only sweep: ${changed.join(", ")}`);
    results.failures.push(`row counts changed: ${changed.join(", ")}`);
    results.fail += 1;
  } else {
    console.log("\nNo user-visible table changed - the sweep really was read-only.");
  }
}

console.log(`\n${results.pass} passed | ${results.note} notes | ${results.fail} failed | ${results.skip} skipped`);
if (results.notes.length) console.log(`\nNotes:\n- ${results.notes.join("\n- ")}`);
if (results.skips.length) console.log(`\nSkipped:\n- ${results.skips.join("\n- ")}`);
if (results.failures.length) {
  console.log(`\nFailures:\n- ${results.failures.join("\n- ")}`);
  process.exitCode = 1;
}
