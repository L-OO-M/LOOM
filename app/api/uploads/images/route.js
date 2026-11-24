/**
 * Image upload for page imagery (event covers first).
 *
 * Two providers, one contract:
 *   - Supabase Storage (default): the object lives in the private bucket under
 *     `public/...` and is served by /api/media/... at a stable URL.
 *   - Cloudinary (optional): when CLOUDINARY_* is set, returns its CDN URL and
 *     the app uses free on-the-fly resizing for the stored link.
 *
 * Either way the caller gets `{ url, provider }` and persists the URL on its row;
 * no client ever sees a bucket name or a service key. Authorization is the same
 * as authoring content: a department lead or above.
 */
import { randomUUID } from "node:crypto";
import { fail, ok } from "@/lib/api";
import { getRequestContext } from "@/lib/auth-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadObject } from "@/lib/storage";
import { buildPublicImagePath, validateImage } from "@/lib/uploads";
import { cloudinaryConfigured, uploadCloudinaryImage } from "@/lib/cloudinary";

const PURPOSES = new Set(["event", "page", "asset"]);

function canUpload(profile) {
  const role = profile?.role;
  if (["platform_admin", "admin", "vertical_lead", "dept_lead"].includes(role)) return true;
  return (profile?.memberships || []).some(
    (membership) =>
      membership.level === "dept_lead" &&
      (!membership.term_end || new Date(membership.term_end).getTime() >= Date.now())
  );
}

export async function POST(request) {
  const ctx = await getRequestContext();
  if (ctx.error === "UNAUTHORIZED") return fail("UNAUTHORIZED", "Authentication required", 401);
  if (ctx.error) return fail(ctx.error, "Profile not found", 404);
  const { user, profile, tenant } = ctx;
  if (!tenant?.id) return fail("FORBIDDEN", "No chapter context", 403);
  if (!canUpload(profile)) {
    return fail("FORBIDDEN", "Only a department lead or an admin can upload page images.", 403);
  }

  const limit = await checkRateLimit(request, {
    userId: user.id,
    limit: 30,
    windowMs: 10 * 60_000,
    durable: true
  });
  if (!limit.ok) {
    return fail("RATE_LIMITED", `Too many uploads. Retry after ${limit.retryAfter}s`, 429);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "Send the image as multipart form data.", 400);
  }
  const file = form.get("file");
  if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") {
    return fail("VALIDATION_ERROR", "Choose an image to upload.", 400);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const check = validateImage({
    name: file.name,
    mime: file.type,
    size: file.size ?? bytes.length,
    bytes
  });
  if (!check.ok) return fail(check.code, check.message, 400, { field: "file" });

  const purpose = PURPOSES.has(String(form.get("purpose") || "")) ? String(form.get("purpose")) : "page";

  if (cloudinaryConfigured()) {
    try {
      const uploaded = await uploadCloudinaryImage({
        bytes,
        mime: check.mime,
        folder: `loom/${tenant.id}/${purpose}`,
        publicId: `${user.id}-${randomUUID()}`
      });
      return ok({ url: uploaded.url, provider: "cloudinary", width: uploaded.width, height: uploaded.height });
    } catch (error) {
      return fail("UPLOAD_FAILED", error.message.replace(/^\[cloudinary\]\s*/, ""), 502);
    }
  }

  const path = buildPublicImagePath({
    tenantId: tenant.id,
    purpose,
    ownerId: user.id,
    id: randomUUID(),
    ext: check.ext
  });
  try {
    await uploadObject({ path, body: bytes, contentType: check.mime });
  } catch (error) {
    const configured = !String(error.message).includes("required to store files");
    return fail(
      "UPLOAD_FAILED",
      configured
        ? "The image could not be stored. Try again."
        : "Image storage is not configured on this deployment.",
      503
    );
  }
  return ok({ url: `/api/media/${path}`, provider: "supabase", path });
}
