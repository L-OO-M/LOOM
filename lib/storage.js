/**
 * Object storage adapter (Supabase Storage).
 *
 * Server-only: uses the service-role key, so it must never be imported from a
 * client component. Route handlers call this AFTER they have resolved the
 * request context and checked permissions — this module performs no authZ.
 *
 * Supabase Storage was chosen over Cloudflare R2 because the project already
 * depends on @supabase/supabase-js (AGENTS.md forbids adding a dependency to
 * save trivial code); R2 would require the AWS S3 SDK.
 *
 * Bucket layout is one private bucket, partitioned by path:
 *   <scope>/<tenantId>/<entityId>/v<version>-<fileId>-<name>
 * Objects are never public; downloads go through short-lived signed URLs.
 *
 * Upload policy is enforced HERE, not only in the route that happens to call
 * it: size, MIME/extension allowlist, and magic bytes for formats we can
 * identify. A caller that forgets validateUpload() cannot smuggle an oversized
 * or mislabelled object into the bucket.
 */
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { validateUpload, MAX_UPLOAD_BYTES } from "@/lib/media";

export const STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET || "loom-files";
export const SIGNED_URL_TTL_SECONDS = 300;

// OOXML documents are ZIP containers; the bytes alone cannot tell a .docx from
// a plain .zip, so the declared MIME decides which allowed container it is.
const ZIP_CONTAINERS = new Set([
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

function client() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "[storage] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to store files."
    );
  }
  return createServiceRoleSupabase();
}

function byteLength(body) {
  if (!body) return NaN;
  if (typeof body.size === "number") return body.size; // Blob/File
  if (typeof body.byteLength === "number") return body.byteLength; // Buffer/ArrayBuffer/TypedArray
  if (typeof body.length === "number") return body.length;
  return NaN;
}

function asBytes(body) {
  if (!body) return null;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return null; // Blob/File: magic-byte checking needs an async read; size still applies
}

function startsWith(bytes, signature, offset = 0) {
  if (!bytes || bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes, start, end) {
  if (!bytes || bytes.length < end) return "";
  let out = "";
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i]);
  return out;
}

/**
 * Identify common binary formats from their header bytes. Returns null for
 * text formats (txt/md/csv), SVG and legacy .doc, where a byte signature is
 * either absent or not decisive.
 */
export function sniffMime(bytes) {
  if (!bytes) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  if (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "application/zip";
  }
  return null;
}

function fileNameFromPath(path) {
  const parts = String(path || "").split("/");
  return parts[parts.length - 1] || "";
}

/**
 * Pure upload policy check used by uploadObject(). Exported so the boundary can
 * be tested without a Supabase client or credentials.
 *
 * @param {{ path: string, body: unknown, contentType?: string }} input
 * @returns {{ ok: true, mime: string, size: number } | { ok: false, code: string, message: string }}
 */
export function validateStorageUpload({ path, body, contentType }) {
  const size = byteLength(body);
  const check = validateUpload({
    name: fileNameFromPath(path),
    mime: contentType,
    size
  });
  if (!check.ok) return check;

  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Files must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`
    };
  }

  const sniffed = sniffMime(asBytes(body));
  if (sniffed) {
    const compatible =
      sniffed === check.mime ||
      (sniffed === "application/zip" && ZIP_CONTAINERS.has(check.mime));
    if (!compatible) {
      return {
        ok: false,
        code: "TYPE_MISMATCH",
        message: "The file contents do not match the declared file type."
      };
    }
  }

  return { ok: true, mime: check.mime, size };
}

/**
 * Upload one object. `body` may be an ArrayBuffer, Uint8Array, Blob or File.
 * Returns the stored path so the caller can persist it on its row.
 */
export async function uploadObject({ path, body, contentType, upsert = false }) {
  const check = validateStorageUpload({ path, body, contentType });
  if (!check.ok) {
    const error = new Error(`[storage] upload rejected: ${check.code} ${check.message}`);
    error.code = check.code;
    throw error;
  }

  const supabase = await client();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, body, { contentType: check.mime, upsert });
  if (error) throw new Error(`[storage] upload failed: ${error.message}`);
  return path;
}

/**
 * Create a short-lived signed URL for one object. Callers must have already
 * verified the row belongs to the caller's tenant before calling this.
 */
export async function createSignedUrl(path, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const supabase = await client();
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw new Error(`[storage] sign failed: ${error?.message || "no url"}`);
  return data.signedUrl;
}

/** Remove one or more objects. Missing objects are ignored (idempotent delete). */
export async function removeObjects(paths) {
  const list = (Array.isArray(paths) ? paths : [paths]).filter(Boolean);
  if (!list.length) return;
  const supabase = await client();
  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(list);
  if (error) throw new Error(`[storage] remove failed: ${error.message}`);
}
