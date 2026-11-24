/**
 * First-party usage telemetry, as policy.
 *
 * Pure on purpose: no DB, no session, no React. The ingest route calls these
 * helpers, and tests exercise them without a request. The rules here are the
 * privacy boundary, so they are deliberately stricter than the client:
 *
 *  - only allowlisted event names, so a crafted payload cannot invent a metric;
 *  - paths lose their query string and ids, so no free text or email address
 *    can ride in through a URL;
 *  - metadata is a flat object of short scalars under known-shape keys;
 *  - anonymous visitors are a salted hash that rotates daily, never an IP.
 */
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export const PAGE_VIEW = "page_view";
export const TRACKED_EVENTS = Object.freeze([
  PAGE_VIEW,
  "tour_start",
  "tour_step",
  "tour_complete",
  "tour_skip"
]);

const EVENT_SET = new Set(TRACKED_EVENTS);
export const MAX_EVENTS_PER_BATCH = 10;
export const MAX_PATH_LENGTH = 200;
const MAX_TARGET_LENGTH = 80;
const MAX_METADATA_KEYS = 8;
const MAX_METADATA_VALUE = 160;

// Never accept these as metadata, even though the shape is otherwise generic.
// They are the fields a future caller might casually add and regret.
const FORBIDDEN_META = new Set([
  "email",
  "name",
  "message",
  "search",
  "query",
  "text",
  "url",
  "referrer",
  "ip"
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AREAS = new Set(["public", "student", "lead", "admin"]);

export function areaFromPath(path) {
  if (path === "/student" || path.startsWith("/student/")) return "student";
  if (path === "/lead" || path.startsWith("/lead/")) return "lead";
  if (path === "/admin" || path.startsWith("/admin/")) return "admin";
  return "public";
}

/**
 * Route-shaped path: query/hash removed, UUIDs and numeric ids collapsed, so
 * `/events/3f...` and `/events/8a...` are one destination in the report.
 */
export function normalizePath(value) {
  const raw = String(value || "").split(/[?#]/)[0].trim();
  if (!raw.startsWith("/")) return "/";
  const path = raw
    .replace(/\/{2,}/g, "/")
    .split("/")
    .map((segment) => {
      if (UUID.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":n";
      return segment;
    })
    .join("/")
    .slice(0, MAX_PATH_LENGTH);
  return path || "/";
}

/** A session is a random client id; it carries no identity of its own. */
export function safeSessionKey(value) {
  const key = String(value || "").trim();
  return /^[A-Za-z0-9-]{8,64}$/.test(key) ? key : null;
}

function safeTarget(value) {
  const target = String(value || "").trim();
  return /^[A-Za-z0-9:_-]{1,80}$/.test(target) ? target : null;
}

function safeMetadata(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  let count = 0;
  for (const [key, value] of Object.entries(input)) {
    if (count >= MAX_METADATA_KEYS) break;
    const name = String(key);
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) continue;
    if (FORBIDDEN_META.has(name)) continue;
    if (typeof value === "string") {
      const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_METADATA_VALUE);
      if (!clean) continue;
      output[name] = clean;
    } else if (typeof value === "boolean") {
      output[name] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      output[name] = value;
    } else {
      continue;
    }
    count += 1;
  }
  return output;
}

/**
 * @returns {{ event, path, area, target, sessionKey, metadata } | null}
 */
export function sanitizeEvent(raw, fallbackPath = "/") {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const event = String(raw.event || "");
  if (!EVENT_SET.has(event)) return null;
  const path = normalizePath(raw.path || fallbackPath);
  const area = AREAS.has(raw.area) ? raw.area : areaFromPath(path);
  return {
    event,
    path,
    area,
    target: safeTarget(raw.target),
    sessionKey: safeSessionKey(raw.sessionKey),
    metadata: safeMetadata(raw.metadata)
  };
}

/** @returns {Array} up to MAX_EVENTS_PER_BATCH valid events, in order. */
export function sanitizeBatch(input, fallbackPath = "/") {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map((raw) => sanitizeEvent(raw, fallbackPath))
    .filter(Boolean);
}

/** Bots and previews are excluded so crawler traffic never becomes "students". */
export function isBotUserAgent(value) {
  const ua = String(value || "").trim();
  if (!ua) return true;
  return /(bot|crawl|spider|slurp|headless|phantom|python-requests|curl\/|wget\/|facebookexternalhit|preview|monitor)/i.test(ua);
}

/**
 * Same-origin is the only shape the product sends. `Sec-Fetch-Site` is set by
 * the browser and cannot be forged by page script, so a cross-site POST is
 * refused before any write.
 */
export function isTrustedRequest(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "same-site" && site !== "none") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("host") || "";
    return originHost === host;
  } catch {
    return false;
  }
}

/**
 * Anonymous visitor key: SHA-256 of the day, address, user agent and the
 * deployment secret. The daily salt means yesterday's key cannot be linked to
 * today's, and the raw address is never stored.
 */
export function visitorKeyFor({ ip, userAgent, day, secret }) {
  const stamp = String(day || new Date().toISOString().slice(0, 10));
  const salt = String(secret || env.CREDENTIAL_SECRET || "loom-telemetry");
  return createHash("sha256")
    .update(`${stamp}|${ip || "unknown"}|${String(userAgent || "")}|${salt}`)
    .digest("hex")
    .slice(0, 32);
}

/** Tour state is written only from a completed/skipped tour event. */
export function tourStatePatch(event, metadata) {
  if (event !== "tour_complete" && event !== "tour_skip") return null;
  const tour = String(metadata?.tour || "").trim();
  const version = Number(metadata?.version);
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(tour)) return null;
  if (!Number.isInteger(version) || version < 1 || version > 99) return null;
  return { [tour]: version };
}
