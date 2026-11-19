// Linked developer accounts, and the difference between a claim and proof.
//
// A handle typed into a form is a claim. This module keeps the provider
// catalogue, normalises input, and runs the one verification that works without
// asking the member for another OAuth app: a one-time code pasted into a public
// page they control.
//
// Why not "just read the passwords saved in Google Password Manager"? There is
// no such API. Browsers expose no interface that lets a website enumerate or
// read credentials stored for other sites, and if one existed it would be a
// cross-site credential disclosure bug, not a login feature. Ownership is proven
// by something the provider itself publishes: an OAuth identity, a public API
// owned by the account, or a code we can fetch from a page the account controls.
//
// Nothing in this file is a secret. The verify token proves control of the page
// it is pasted on; it grants no access to the account.

import { handleFromProfileUrl, normalizeGithubHandle, normalizeLeetCodeHandle } from "@/lib/profileFolio";

export const IDENTITY_PROVIDERS = [
  {
    key: "github",
    label: "GitHub",
    kind: "handle",
    method: "oauth",
    hint: "Your login, not a URL.",
    proofHosts: ["github.com", "gist.github.com", "gist.githubusercontent.com", "raw.githubusercontent.com"]
  },
  { key: "leetcode", label: "LeetCode", kind: "handle", method: "api", hint: "Synced progress comes from LeetCode's API." },
  { key: "linkedin", label: "LinkedIn", kind: "url", method: "token", proofHosts: ["linkedin.com"] },
  { key: "x", label: "X (Twitter)", kind: "url", method: "token", proofHosts: ["x.com", "twitter.com"] },
  { key: "discord", label: "Discord", kind: "handle", method: "token", hint: "Your username, e.g. name or name#1234." },
  { key: "kaggle", label: "Kaggle", kind: "handle", method: "token", proofHosts: ["kaggle.com"] },
  { key: "unstop", label: "Unstop", kind: "handle", method: "token", proofHosts: ["unstop.com"] },
  { key: "devfolio", label: "Devfolio", kind: "handle", method: "token", proofHosts: ["devfolio.co"] },
  { key: "huggingface", label: "Hugging Face", kind: "handle", method: "token", proofHosts: ["huggingface.co", "hf.co"] },
  { key: "website", label: "Personal site", kind: "url", method: "token", proofHosts: null }
];

export const IDENTITY_KEYS = IDENTITY_PROVIDERS.map((p) => p.key);

export function providerFor(key) {
  return IDENTITY_PROVIDERS.find((p) => p.key === key) || null;
}

const HANDLE_PATTERNS = {
  discord: /^[A-Za-z0-9._#]{2,40}$/,
  kaggle: /^[A-Za-z0-9_-]{2,40}$/,
  unstop: /^[A-Za-z0-9._-]{2,60}$/,
  devfolio: /^[A-Za-z0-9._-]{2,60}$/,
  huggingface: /^[A-Za-z0-9._-]{2,60}$/
};

/** Normalise one field. Returns `{ value }` or `{ error }`. */
export function normalizeIdentityValue(provider, raw) {
  const spec = providerFor(provider);
  if (!spec) return { error: "Unknown provider" };
  const text = String(raw ?? "").trim();
  if (!text) return { value: null };

  if (provider === "github") {
    const handle = normalizeGithubHandle(text);
    return handle ? { value: handle } : { error: "GitHub handle must be 1-39 letters, numbers or hyphens" };
  }
  if (provider === "leetcode") {
    const handle = normalizeLeetCodeHandle(text);
    return handle ? { value: handle } : { error: "LeetCode handle must be 1-30 letters, numbers, - or _" };
  }

  if (spec.kind === "handle") {
    const handle = handleFromProfileUrl(provider, text);
    return HANDLE_PATTERNS[provider]?.test(handle || "")
      ? { value: handle }
      : { error: `${spec.label} handle looks invalid` };
  }

  let url;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return { error: `${spec.label} must be an http(s) URL` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: `${spec.label} must be an http(s) URL` };
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const allowed = provider === "linkedin" ? ["linkedin.com"] : provider === "x" ? ["x.com", "twitter.com"] : null;
  if (allowed && !allowed.includes(host)) {
    return { error: `${spec.label} URL must be a ${allowed[0]} link` };
  }
  return { value: url.href.replace(/\/$/, "") };
}

/** Public profile URL for a stored value, or null when the platform has none. */
export function profileUrlFor(provider, value) {
  if (!value) return null;
  if (provider === "linkedin" || provider === "x" || provider === "website") return value;
  if (provider === "github") return `https://github.com/${value}`;
  if (provider === "leetcode") return `https://leetcode.com/u/${value}/`;
  if (provider === "kaggle") return `https://www.kaggle.com/${value}`;
  if (provider === "unstop") return `https://unstop.com/@${value}`;
  if (provider === "devfolio") return `https://devfolio.co/@${value}`;
  if (provider === "huggingface") return `https://huggingface.co/${value}`;
  return null;
}

// ---------------------------------------------------------------------------
// One-time ownership code
// ---------------------------------------------------------------------------

export function newVerifyToken() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `loom-verify-${hex}`;
}

/** Accepts the raw token, a message containing it, or a proof page's text. */
export function tokenPresent(text, token) {
  if (!token || typeof text !== "string") return false;
  return text.toLowerCase().includes(String(token).toLowerCase());
}

// ---------------------------------------------------------------------------
// Host safety
// ---------------------------------------------------------------------------
// The verifier fetches a member-supplied URL, so it must never become a probe
// into the deployment's own network. We refuse IP literals and private names,
// and when a provider declares proof hosts we require one of them.

function isPrivateHost(host) {
  const h = String(host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) {
      return true;
    }
  }
  return false;
}

export function proofHostAllowed(provider, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.port && url.port !== "80" && url.port !== "443") return false;
  if (isPrivateHost(url.hostname)) return false;
  const spec = providerFor(provider);
  if (!spec) return false;
  if (!spec.proofHosts) return true;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  return spec.proofHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/**
 * Fetch a proof page with a hard timeout, no redirects, and a size cap.
 * Returns the body as text or `{ error }`.
 */
export async function fetchProofPage(rawUrl, { fetchImpl = fetch, timeoutMs = 8000, maxBytes = 512 * 1024 } = {}) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { error: "That is not a valid URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Proof URL must be http(s)" };
  // Only the standard web ports: a member's proof page lives at :80/:443, and
  // refusing odd ports removes a cheap way to probe internal services.
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { error: "Proof URL must use the standard web port" };
  }
  if (isPrivateHost(url.hostname)) return { error: "Proof URL must be a public page" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url.href, {
      redirect: "manual",
      signal: controller.signal,
      headers: { "user-agent": "LOOM-verify/1.0 (+https://www.lets-loom.xyz)" }
    });
    if (res.status >= 300 && res.status < 400) return { error: "Proof URL redirected; use the final public URL" };
    if (!res.ok) return { error: `Proof URL returned ${res.status}` };
    const length = Number(res.headers?.get?.("content-length") || 0);
    if (length && length > maxBytes) return { error: "Proof page is too large to check" };
    const text = await res.text();
    if (text.length > maxBytes) return { error: "Proof page is too large to check" };
    return { text };
  } catch (error) {
    return { error: error?.name === "AbortError" ? "Proof URL timed out" : "Could not reach the proof URL" };
  } finally {
    clearTimeout(timer);
  }
}

/** The public label for a status — used by the editor and the card. */
export function identityStatusLabel(status) {
  return {
    verified: "Verified",
    linked: "Linked",
    claimed: "Claimed",
    rejected: "Check failed"
  }[status] || "Claimed";
}

/**
 * Provider -> status for one member. A public card uses this to decide whether
 * a chip gets a tick; absence means no check has ever passed.
 */
export async function loadIdentityStatus(sql, { userId, tenantId } = {}) {
  if (!sql || !userId || !tenantId) return {};
  try {
    const rows = await sql`
      SELECT provider, status FROM identity_links
      WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}
    `;
    return Object.fromEntries(rows.map((row) => [row.provider, row.status]));
  } catch {
    // Older deployment without 083: every link stays a claim, which is honest.
    return {};
  }
}
