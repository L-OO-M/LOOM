import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT = "11111111-1111-4111-8111-111111111111";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);

function formRequest() {
  const form = new FormData();
  form.append("file", new Blob([PNG], { type: "image/png" }), "cover.png");
  form.append("purpose", "event");
  return new Request("http://localhost/api/uploads/images", { method: "POST", body: form });
}

async function loadRoute({ profile, cloudinary = false } = {}) {
  vi.resetModules();
  const actualStorage = await vi.importActual("@/lib/storage");
  const uploadObject = vi.fn(async () => ({}));
  const uploadCloudinaryImage = vi.fn(async () => ({
    url: "https://res.cloudinary.com/demo/image/upload/loom/t/event/a.png",
    width: 1200,
    height: 630
  }));
  vi.doMock("@/lib/auth-server", () => ({
    getRequestContext: async () => ({
      user: { id: "user-1" },
      profile,
      tenant: { id: TENANT },
      sql: null
    })
  }));
  vi.doMock("@/lib/rate-limit", () => ({
    checkRateLimit: async () => ({ ok: true, retryAfter: 0 })
  }));
  vi.doMock("@/lib/storage", () => ({ ...actualStorage, uploadObject }));
  vi.doMock("@/lib/cloudinary", () => ({
    cloudinaryConfigured: () => cloudinary,
    uploadCloudinaryImage
  }));
  const { POST } = await import("@/app/api/uploads/images/route");
  return { POST, uploadObject, uploadCloudinaryImage };
}

describe("image upload route", () => {
  beforeEach(() => vi.resetModules());

  it("refuses a member who cannot author content", async () => {
    const { POST, uploadObject } = await loadRoute({ profile: { role: "student", memberships: [] } });
    const response = await POST(formRequest());
    expect(response.status).toBe(403);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("stores a lead's image under the tenant's public prefix", async () => {
    const { POST, uploadObject } = await loadRoute({ profile: { role: "dept_lead", memberships: [] } });
    const response = await POST(formRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ provider: "supabase" });
    expect(body.data.url.startsWith("/api/media/public/")).toBe(true);
    expect(body.data.path.startsWith(`public/${TENANT}/event/user-1/`)).toBe(true);
    expect(uploadObject).toHaveBeenCalledTimes(1);
  });

  it("uses Cloudinary when it is configured and returns the CDN url", async () => {
    const { POST, uploadObject, uploadCloudinaryImage } = await loadRoute({
      profile: { role: "admin", memberships: [] },
      cloudinary: true
    });
    const response = await POST(formRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.provider).toBe("cloudinary");
    expect(body.data.url.startsWith("https://res.cloudinary.com/")).toBe(true);
    expect(uploadCloudinaryImage).toHaveBeenCalledTimes(1);
    expect(uploadObject).not.toHaveBeenCalled();
  });

  it("rejects SVG even when a caller labels it as an image", async () => {
    const { POST, uploadObject } = await loadRoute({ profile: { role: "admin", memberships: [] } });
    const form = new FormData();
    form.append("file", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "x.svg");
    const response = await POST(new Request("http://localhost/api/uploads/images", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    expect(uploadObject).not.toHaveBeenCalled();
  });
});
