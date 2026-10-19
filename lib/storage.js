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
 */
import { createServiceRoleSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";

export const STORAGE_BUCKET = env.SUPABASE_STORAGE_BUCKET || "loom-files";
export const SIGNED_URL_TTL_SECONDS = 300;

function client() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "[storage] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to store files."
    );
  }
  return createServiceRoleSupabase();
}

/**
 * Upload one object. `body` may be an ArrayBuffer, Uint8Array, Blob or File.
 * Returns the stored path so the caller can persist it on its row.
 */
export async function uploadObject({ path, body, contentType, upsert = false }) {
  const supabase = await client();
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, body, { contentType, upsert });
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
