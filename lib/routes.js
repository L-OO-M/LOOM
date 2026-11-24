/**
 * Route shapes, without a server runtime.
 *
 * `normalizePath` is used by the telemetry ingest (server) and by the first-visit
 * page intros (client), so it cannot live in lib/telemetry.js: that module also
 * hashes visitor keys with node:crypto, and importing it from a client component
 * drags `node:crypto` into the browser bundle. This module is the shared, pure
 * half; telemetry re-exports both helpers so existing imports keep working.
 */

export const MAX_PATH_LENGTH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
