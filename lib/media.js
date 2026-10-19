/**
 * Media validation — pure, dependency-free rules for uploaded files.
 *
 * Shared by every upload surface (asset library, MoU documents, event files).
 * Kept pure so the rules are unit-testable without a bucket: the route handlers
 * read a file, call validateUpload(), and only then talk to storage.
 *
 * There is deliberately NO antivirus step. The mitigation is a tight MIME /
 * extension allowlist and a hard size cap, as documented in
 * docs/15-deploy-and-operations.md. Anything beyond that is a known limitation.
 */

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// The MIME types we accept, mapped to the canonical extension we store them
// under. Browsers are inconsistent: some send application/octet-stream for a
// .docx, some send the correct long form. We therefore accept a file if EITHER
// its declared MIME is known OR its extension maps to a known MIME.
const MIME_TO_EXT = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/csv": "csv",
  "application/zip": "zip"
};

const EXT_TO_MIME = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  zip: "application/zip"
};

export const ALLOWED_MIME = new Set(Object.keys(MIME_TO_EXT));
export const ALLOWED_EXT = new Set(Object.keys(EXT_TO_MIME));

export function extensionOf(fileName) {
  const name = String(fileName || "");
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase().slice(0, 8);
}

/**
 * Reduce a user-supplied name to a storage-safe token. Keeps a plausible
 * filename (so downloads still read well) but strips path separators, control
 * characters and anything a bucket would reject.
 */
export function sanitizeFileName(fileName) {
  const base = String(fileName || "file")
    .replace(/[\\/]+/g, "_")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+/, "")
    .slice(0, 120);
  return base || "file";
}

/**
 * @param {{ name?: string, mime?: string, size?: number }} file
 * @returns {{ ok: true, mime: string, ext: string } | { ok: false, code: string, message: string }}
 */
export function validateUpload(file = {}) {
  const name = String(file.name || "");
  const size = Number(file.size);
  const declared = String(file.mime || "").split(";")[0].trim().toLowerCase();
  const ext = extensionOf(name);

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "The file is empty." };
  }
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `Files must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller.`
    };
  }

  const mime = ALLOWED_MIME.has(declared) ? declared : EXT_TO_MIME[ext] || "";
  if (!mime) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "That file type is not allowed. Use PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, an image, plain text, CSV or ZIP."
    };
  }
  // Canonical extension from the resolved MIME keeps storage paths predictable
  // even when the upload had no extension.
  return { ok: true, mime, ext: MIME_TO_EXT[mime] || ext };
}

const SCOPES = new Set(["assets", "mou", "event"]);

/**
 * Tenant-prefixed, scope-partitioned object path. The tenant segment is what
 * makes a leaked signed URL useless to another chapter, and the scope segment
 * keeps a chapter's MoUs, assets and event files separable for retention.
 */
export function buildStoragePath({ scope, tenantId, entityId, fileId, version = 1, fileName }) {
  if (!SCOPES.has(scope)) throw new Error(`[media] unknown scope: ${scope}`);
  if (!tenantId || !entityId || !fileId) throw new Error("[media] path needs tenantId, entityId and fileId");
  const safe = sanitizeFileName(fileName);
  return `${scope}/${tenantId}/${entityId}/v${version}-${fileId}-${safe}`;
}
