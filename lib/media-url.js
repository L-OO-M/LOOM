/**
 * Image URL shaping, shared by client and server.
 *
 * Supabase-hosted images already come back at one size. Cloudinary can deliver
 * the same asset as WebP/AVIF at the width the layout actually needs, which is
 * the main reason to use its free tier; this pure helper turns a stored
 * Cloudinary URL into that delivery URL without storing a second field.
 */

const CLOUDINARY_HOST = "res.cloudinary.com";

/**
 * @param {string} url stored image URL
 * @param {number} width target CSS pixel width (DPR is handled by f_auto/q_auto)
 */
export function optimizedImageUrl(url, width = 1600) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (parsed.hostname !== CLOUDINARY_HOST) return raw;
  const marker = "/upload/";
  const at = parsed.pathname.indexOf(marker);
  if (at < 0) return raw;
  // Do not stack transformations on an already-transformed URL.
  const after = parsed.pathname.slice(at + marker.length);
  if (/^(?:[a-z]_[^/]+\/)+/.test(after)) return raw;
  const safeWidth = Math.min(2400, Math.max(240, Math.round(Number(width) || 1600)));
  const transform = `f_auto,q_auto:good,c_limit,w_${safeWidth}`;
  parsed.pathname = `${parsed.pathname.slice(0, at + marker.length)}${transform}/${after}`;
  return parsed.toString();
}
