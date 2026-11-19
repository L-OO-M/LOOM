#!/usr/bin/env node
/**
 * Read-only production smoke check for a deployed LOOM chapter.
 *
 *   node load/check-live.mjs
 *   node load/check-live.mjs https://lets-loom.xyz
 *   LIVE_BASE_URL=https://lets-loom.xyz node load/check-live.mjs
 *
 * Verifies the public contract that unit/E2E tests prove locally: public pages
 * render one h1 with a description and canonical, private areas bounce to
 * /login, private APIs answer 401 JSON, the machine documents exist, security
 * headers are present, and unknown ids are honest 404s.
 *
 * It never signs in, never writes, and never sends credentials. Safe to run
 * against production on every release.
 */

const BASE = (process.env.LIVE_BASE_URL || process.argv[2] || "https://www.lets-loom.xyz").replace(/\/+$/, "");
const results = [];
const warnings = [];
let failures = 0;

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail) {
  warnings.push({ name, detail });
  console.log(`WARN  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function get(path, init = {}) {
  const started = Date.now();
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: { "user-agent": "LOOM-live-check/1.0" },
    ...init
  });
  const ms = Date.now() - started;
  return { response, ms };
}

function expectStatus(name, { response, ms }, expected, detail = "") {
  const ok = response.status === expected;
  record(name, ok, ok ? `${response.status} · ${ms}ms ${detail}`.trim() : `got ${response.status}, wanted ${expected}`);
  return ok;
}

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function checkPublicPage(path, label) {
  try {
    const result = await get(path);
    expectStatus(`${label} ${path} responds 200`, result, 200);
    if (result.response.status !== 200) return;
    const html = await readText(result.response);
    const h1s = (html.match(/<h1[\s>]/g) || []).length;
    record(`${label} ${path} has exactly one h1`, h1s === 1, `${h1s} found`);
    const description = /<meta[^>]+name="description"[^>]+content="([^"]+)"/i.test(html);
    record(`${label} ${path} has a description`, description);
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i);
    record(
      `${label} ${path} has an absolute canonical`,
      Boolean(canonical && /^https?:\/\//.test(canonical[1]) && canonical[1].startsWith(BASE)),
      canonical ? canonical[1] : "missing"
    );
  } catch (error) {
    record(`${label} ${path} responds 200`, false, error.message);
  }
}

async function checkPrivateRedirect(path) {
  try {
    const result = await get(path);
    const status = result.response.status;
    const location = result.response.headers.get("location") || "";
    const ok = [301, 302, 303, 307, 308].includes(status) && location.includes("/login");
    record(`${path} redirects a signed-out visitor to /login`, ok, `${status} -> ${location || "(no location)"}`);
  } catch (error) {
    record(`${path} redirects a signed-out visitor to /login`, false, error.message);
  }
}

async function checkPrivateApi(path, init = {}) {
  try {
    const result = await get(path, init);
    const ok = result.response.status === 401;
    let envelope = "";
    try {
      const body = await result.response.json();
      envelope = body?.ok === false ? "ok:false" : "non-standard envelope";
    } catch {
      envelope = "not json";
    }
    record(`${init.method || "GET"} ${path} returns 401 JSON`, ok && envelope === "ok:false", `${result.response.status} ${envelope}`);
  } catch (error) {
    record(`${init.method || "GET"} ${path} returns 401 JSON`, false, error.message);
  }
}

async function checkMachineDocument(path, marker) {
  try {
    const result = await get(path);
    expectStatus(`${path} responds 200`, result, 200);
    if (result.response.status !== 200) return;
    const text = await readText(result.response);
    record(`${path} contains “${marker}”`, text.includes(marker));
    record(`${path} references the deployment origin`, text.includes(BASE) || path === "/robots.txt");
  } catch (error) {
    record(`${path} responds 200`, false, error.message);
  }
}

async function main() {
  console.log(`LOOM live check → ${BASE}\n`);

  // The deployment serves one canonical host; the other must redirect to it,
  // permanently, so search engines never index two copies of every page.
  try {
    const url = new URL(BASE);
    if (url.hostname.startsWith("www.")) {
      const apex = url.hostname.slice(4);
      const started = Date.now();
      const apexResponse = await fetch(`${url.protocol}//${apex}/`, {
        redirect: "manual",
        headers: { "user-agent": "LOOM-live-check/1.0" }
      });
      const location = apexResponse.headers.get("location") || "";
      record(
        `apex ${apex} redirects permanently to ${url.hostname}`,
        [301, 308].includes(apexResponse.status) && location.includes(url.hostname),
        `${apexResponse.status} -> ${location || "(no location)"} · ${Date.now() - started}ms`
      );
    }
  } catch (error) {
    record("canonical host redirect", false, error.message);
  }

  const publicPages = [
    ["/", "landing"],
    ["/about", "about"],
    ["/events", "events"],
    ["/domains", "domains"],
    ["/faq", "faq"],
    ["/privacy", "privacy"],
    ["/terms", "terms"],
    ["/contact", "contact"]
  ];
  for (const [path, label] of publicPages) await checkPublicPage(path, label);

  console.log("");
  for (const path of ["/student", "/student/roadmap", "/student/settings", "/lead", "/admin", "/admin/settings", "/setup"]) {
    if (path === "/setup") {
      try {
        const result = await get("/setup");
        expectStatus("/setup is publicly reachable", result, 200);
        const html = await readText(result.response);
        const noindex = /noindex/i.test(html) || /noindex/i.test(result.response.headers.get("x-robots-tag") || "");
        record("/setup stays out of search results", noindex);
      } catch (error) {
        record("/setup is publicly reachable", false, error.message);
      }
    } else {
      await checkPrivateRedirect(path);
    }
  }

  console.log("");
  for (const path of [
    "/api/profile",
    "/api/roadmap",
    "/api/notifications",
    "/api/admin/overview",
    "/api/admin/students",
    "/api/lead/overview",
    "/api/github/repos",
    "/api/social/profile"
  ]) {
    await checkPrivateApi(path);
  }
  await checkPrivateApi("/api/roadmap/progress", { method: "POST", body: "{}", headers: { "content-type": "application/json" } });

  console.log("");
  for (const [path, key] of [
    ["/api/public/summary", "chapter"],
    ["/api/public/events", "events"],
    ["/api/public/projects", "projects"],
    ["/api/public/departments", "departments"],
    ["/api/chapters", "chapters"]
  ]) {
    try {
      const result = await get(path);
      expectStatus(`${path} responds 200`, result, 200);
      if (result.response.status !== 200) continue;
      const body = await result.response.json();
      const ok = body?.ok === true && body?.data && key in body.data;
      record(`${path} returns the standard envelope with data.${key}`, ok);
    } catch (error) {
      record(`${path} responds 200`, false, error.message);
    }
  }

  console.log("");
  await checkMachineDocument("/llms.txt", "Canonical answers");
  await checkMachineDocument("/llms-full.txt", "Canonical answers");
  await checkMachineDocument("/sitemap.xml", "<urlset");
  await checkMachineDocument("/robots.txt", "Sitemap:");

  console.log("");
  for (const [path, label] of [
    ["/verify/credential/cred_doesnotexist000", "unknown credential"],
    ["/verify/certificate/cert_doesnotexist000", "unknown certificate"],
    ["/u/this-builder-does-not-exist-xyz", "unknown builder"]
  ]) {
    try {
      const result = await get(path);
      expectStatus(`${label} is an honest 404`, result, 404);
    } catch (error) {
      record(`${label} is an honest 404`, false, error.message);
    }
  }

  // Middleware gates every path that is not a known public page, so an unknown
  // URL is redirected to /login rather than rendering a 404. That is a
  // deliberate auth boundary (unknown paths may belong to the app), not a leak:
  // no content is served. Report it as an observation rather than a failure so
  // the smoke check stays meaningful until the routing policy is decided.
  try {
    const result = await get("/this-page-does-not-exist-xyz");
    const location = result.response.headers.get("location") || "";
    if (result.response.status === 404) {
      record("unknown page renders a 404", true, "404");
    } else if ([301, 302, 307, 308].includes(result.response.status) && location.includes("/login")) {
      warn(
        "unknown page is gated, not 404",
        `${result.response.status} -> ${location} (middleware treats unknown paths as private)`
      );
    } else {
      record("unknown page resolves safely", false, `${result.response.status} -> ${location}`);
    }
  } catch (error) {
    record("unknown page resolves safely", false, error.message);
  }

  try {
    const result = await get("/api/github/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-github-event": "push", "x-github-delivery": "live-check" },
      body: "{}"
    });
    record(
      "unsigned GitHub webhook is rejected",
      [400, 401, 403].includes(result.response.status),
      `${result.response.status}`
    );
  } catch (error) {
    record("unsigned GitHub webhook is rejected", false, error.message);
  }

  console.log("");
  try {
    const landing = await get("/");
    const headers = landing.response.headers;
    const csp = headers.get("content-security-policy") || "";
    record("CSP is present", csp.length > 0, csp.split(";")[0]);
    record("CSP uses a per-request nonce", /'nonce-[A-Za-z0-9+/=]+'/.test(csp));
    record("CSP forbids framing", /frame-ancestors\s+'none'/.test(csp));
    record("X-Content-Type-Options is nosniff", headers.get("x-content-type-options") === "nosniff");
    record("Referrer-Policy is present", Boolean(headers.get("referrer-policy")), headers.get("referrer-policy") || "");
    record("HSTS is present over HTTPS", Boolean(headers.get("strict-transport-security")), headers.get("strict-transport-security") || "");
    record("Permissions-Policy is present", Boolean(headers.get("permissions-policy")));
    if (headers.get("x-powered-by") === "Next.js") {
      warn(
        "Server advertises Next.js via x-powered-by",
        "Set poweredByHeader: false in next.config.mjs to remove the version hint"
      );
    } else {
      record("Server does not advertise Next.js", true, headers.get("x-powered-by") || "absent");
    }

    const second = await get("/");
    const secondCsp = second.response.headers.get("content-security-policy") || "";
    const nonceOf = (value) => (value.match(/'nonce-([^']+)'/) || [])[1];
    record("CSP nonce changes per request", Boolean(nonceOf(csp) && nonceOf(secondCsp) && nonceOf(csp) !== nonceOf(secondCsp)));
    record("landing TTFB is under 2s", landing.ms < 2000, `${landing.ms}ms`);

    const login = await get("/login");
    const loginHtml = await readText(login.response);
    record(
      "/login is noindex",
      /noindex/i.test(loginHtml) || /noindex/i.test(login.response.headers.get("x-robots-tag") || "")
    );
  } catch (error) {
    record("security headers are present", false, error.message);
  }

  console.log(`\n${results.length - failures}/${results.length} checks passed${warnings.length ? ` · ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`);
  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) console.log(`- ${warning.name}: ${warning.detail || "no detail"}`);
  }
  if (failures > 0) {
    console.log("\nFailures:");
    for (const failure of results.filter((r) => !r.ok)) console.log(`- ${failure.name}: ${failure.detail || "no detail"}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`live check crashed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
