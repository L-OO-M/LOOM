/**
 * Public image uploads (Supabase Storage).
 *
 * Documents live in the private bucket and are read through short-lived signed
 * URLs. Event covers and other page imagery must render for anonymous visitors,
 * so they are stored under a `public/` path and served by `app/api/media/[...key]`
 * — one bucket, one service-role adapter, and no expiring tokens in published
 * HTML. The route only ever reads keys that start with `public/`, so a document
 * path cannot be guessed into a public URL.
 *
 * Pure policy here (size, MIME, path, key validation) so it is testable without
 * a bucket. The upload route calls this, then `uploadObject()`.
 */
import { sniffMime } from "@/lib/storage";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

// Deliberately excludes SVG: an SVG is a script-capable document, and it would
// be served same-origin from /api/media. Raster formats cannot execute.
const IMAGE_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif"
};

const EXT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

export const PUBLIC_MEDIA_PREFIX = "public";

export function imageExtension(mime) {
  return IMAGE_TYPES[String(mime || "").toLowerCase()] || "";
}

/** Storage-safe token: no separators, no leading dot, bounded length. */
export function safeSegment(value) {
  return String(value || "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

/**
 * @param {{ tenantId: string, purpose?: string, ownerId?: string, id: string, ext: string }} input
 * @returns {string} `public/<tenant>/<purpose>/<owner>/<id>.<ext>`
 */
export function buildPublicImagePath({ tenantId, purpose = "page", ownerId = "shared", id, ext }) {
  const tenant = safeSegment(tenantId);
  const scope = safeSegment(purpose) || "page";
  const owner = safeSegment(ownerId) || "shared";
  const fileId = safeSegment(id);
  const extension = String(ext || "").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5);
  if (!tenant || !fileId || !extension) throw new Error("[uploads] incomplete image path");
  return `${PUBLIC_MEDIA_PREFIX}/${tenant}/${scope}/${owner}/${fileId}.${extension}`;
}

/**
 * Validate the key a media request asks for. Returns the normalized path or
 * null. Only `public/...` keys are readable, and every segment must be plain.
 */
export function publicMediaKey(segments) {
  if (!Array.isArray(segments) || segments.length < 3) return null;
  if (segments[0] !== PUBLIC_MEDIA_PREFIX) return null;
  if (segments.length > 8) return null;
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") return null;
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) return null;
    if (segment.length > 80) return null;
  }
  const key = segments.join("/");
  return key.length <= 400 ? key : null;
}

export function imageContentType(key) {
  const ext = String(key || "").split(".").pop().toLowerCase();
  return EXT_TYPES[ext] || "application/octet-stream";
}

/**
 * @param {{ name?: string, mime?: string, size?: number, bytes?: Uint8Array|Buffer }} file
 * @returns {{ ok: true, mime: string, ext: string } | { ok: false, code: string, message: string }}
 */
export function validateImage({ name = "", mime = "", size, bytes } = {}) {
  const declared = String(mime).split(";")[0].trim().toLowerCase();
  const extension = String(name).split(".").pop().toLowerCase();
  const resolved = IMAGE_TYPES[declared] ? declared : EXT_TYPES[extension] || "";
  if (!resolved) {
    return { ok: false, code: "UNSUPPORTED_IMAGE", message: "Use a PNG, JPEG, WebP or GIF image." };
  }
  const total = Number(size);
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The image is empty." };
  }
  if (total > IMAGE_MAX_BYTES) {
    return { ok: false, code: "IMAGE_TOO_LARGE", message: "Images must be 8 MB or smaller." };
  }
  if (bytes) {
    const sniffed = sniffMime(bytes);
    if (!sniffed || !IMAGE_TYPES[sniffed]) {
      return { ok: false, code: "NOT_AN_IMAGE", message: "The file contents are not a supported image." };
    }
    if (sniffed !== resolved) {
      return { ok: false, code: "TYPE_MISMATCH", message: "The image contents do not match its file type." };
    }
  }
  return { ok: true, mime: resolved, ext: IMAGE_TYPES[resolved] };
}
