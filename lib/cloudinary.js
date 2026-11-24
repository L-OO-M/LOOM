/**
 * Cloudinary upload adapter (optional).
 *
 * Supabase Storage is the default for every file. Cloudinary is supported as a
 * second provider because its free tier includes CDN delivery and on-the-fly
 * resizing/format conversion, which costs the chapter nothing while its usage
 * stays inside the free credits. It is enabled only when all three env values
 * are present; otherwise the upload route uses Supabase Storage.
 *
 * Signing is done HERE (server-only) with Node's crypto: Cloudinary's unsigned
 * preset would let anyone upload into the account, so uploads are signed.
 * No SDK: the browser needs nothing, and the server only needs `fetch`.
 */
import { createHash } from "node:crypto";
import { env } from "@/lib/env";

export function cloudinaryConfigured() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET
  );
}

function signParams(params, secret) {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${secret}`).digest("hex");
}

/**
 * Upload one image to Cloudinary. Returns the delivered `secure_url` (already
 * absolute) and the public id so a future delete/transform can target it.
 *
 * @param {{ bytes: Buffer, mime: string, folder?: string, publicId?: string }} input
 */
export async function uploadCloudinaryImage({ bytes, mime, folder = "loom", publicId }) {
  if (!cloudinaryConfigured()) throw new Error("[cloudinary] not configured");
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, timestamp };
  if (publicId) params.public_id = publicId;
  const signature = signParams(params, env.CLOUDINARY_API_SECRET);

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), publicId ? `${publicId}` : "image");
  form.append("api_key", env.CLOUDINARY_API_KEY);
  form.append("timestamp", String(timestamp));
  form.append("signature", signature);
  form.append("folder", folder);
  if (publicId) form.append("public_id", publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.secure_url) {
    const reason = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(`[cloudinary] upload failed: ${reason}`);
  }
  return {
    url: data.secure_url,
    publicId: data.public_id || null,
    width: data.width || null,
    height: data.height || null,
    format: data.format || null
  };
}
