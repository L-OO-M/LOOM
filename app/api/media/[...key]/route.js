/**
 * Public image delivery from Supabase Storage.
 *
 * Only keys under `public/` are readable. Published HTML embeds a stable
 * `/api/media/public/...` URL instead of a signed URL, so a cover keeps working
 * after any token would have expired, and the path (which contains a random
 * file id) is immutable and safe to cache forever.
 *
 * Service-role access stays server-side; this route never reveals the bucket,
 * the object listing, or a Supabase URL.
 */
import { downloadObject } from "@/lib/storage";
import { imageContentType, publicMediaKey } from "@/lib/uploads";

export async function GET(_request, { params }) {
  const { key } = await params;
  const path = publicMediaKey(key);
  if (!path) return new Response("Not found", { status: 404 });

  let object;
  try {
    object = await downloadObject(path);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "content-type": object.contentType || imageContentType(path),
      "content-length": String(object.size),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox"
    }
  });
}
