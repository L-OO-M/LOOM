import { describe, expect, it } from "vitest";
import {
  IMAGE_MAX_BYTES,
  buildPublicImagePath,
  imageContentType,
  publicMediaKey,
  validateImage
} from "@/lib/uploads";
import { optimizedImageUrl } from "@/lib/media-url";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe("image upload policy", () => {
  it("accepts raster images and rejects everything else", () => {
    expect(validateImage({ name: "cover.png", mime: "image/png", size: 1000, bytes: PNG })).toMatchObject({
      ok: true,
      mime: "image/png",
      ext: "png"
    });
    expect(validateImage({ name: "photo", mime: "image/jpeg", size: 10, bytes: JPEG })).toMatchObject({
      ok: true,
      mime: "image/jpeg"
    });
    // SVG is a script-capable document and must not be served same-origin.
    expect(validateImage({ name: "x.svg", mime: "image/svg+xml", size: 10 })).toMatchObject({
      ok: false,
      code: "UNSUPPORTED_IMAGE"
    });
    expect(validateImage({ name: "x.pdf", mime: "application/pdf", size: 10 })).toMatchObject({
      ok: false
    });
  });

  it("rejects a file whose bytes are not the declared image", () => {
    expect(validateImage({ name: "cover.png", mime: "image/png", size: 10, bytes: JPEG })).toMatchObject({
      ok: false,
      code: "TYPE_MISMATCH"
    });
    expect(validateImage({ name: "x.png", mime: "image/png", size: 10, bytes: Buffer.from("hello") })).toMatchObject({
      ok: false,
      code: "NOT_AN_IMAGE"
    });
  });

  it("caps size and requires a non-empty file", () => {
    expect(validateImage({ name: "x.png", mime: "image/png", size: 0 })).toMatchObject({ ok: false, code: "EMPTY_FILE" });
    expect(validateImage({ name: "x.png", mime: "image/png", size: IMAGE_MAX_BYTES + 1 })).toMatchObject({
      ok: false,
      code: "IMAGE_TOO_LARGE"
    });
  });
});

describe("public media paths", () => {
  it("builds a tenant-scoped path and keeps extensions derivable", () => {
    const path = buildPublicImagePath({
      tenantId: "11111111-1111-4111-8111-111111111111",
      purpose: "event",
      ownerId: "user-1",
      id: "abc",
      ext: "png"
    });
    expect(path).toBe("public/11111111-1111-4111-8111-111111111111/event/user-1/abc.png");
    expect(imageContentType(path)).toBe("image/png");
  });

  it("only allows keys under public/ and refuses traversal", () => {
    expect(publicMediaKey(["public", "t", "event", "u", "x.png"])).toBe("public/t/event/u/x.png");
    expect(publicMediaKey(["assets", "t", "event", "u", "x.png"])).toBeNull();
    expect(publicMediaKey(["public", "..", "x.png"])).toBeNull();
    expect(publicMediaKey(["public", "t", "a b.png"])).toBeNull();
    expect(publicMediaKey(["public", "t"])).toBeNull();
    expect(publicMediaKey(null)).toBeNull();
  });
});

describe("Cloudinary delivery shaping", () => {
  it("adds free auto-format, quality and width transforms", () => {
    const url = "https://res.cloudinary.com/demo/image/upload/loom/t/event/abc.jpg";
    expect(optimizedImageUrl(url, 1200)).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto:good,c_limit,w_1200/loom/t/event/abc.jpg"
    );
  });

  it("leaves other hosts and already-transformed URLs untouched", () => {
    const local = "/api/media/public/t/event/u/x.png";
    expect(optimizedImageUrl(local, 800)).toBe(local);
    const transformed = "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/w_600/loom/x.jpg";
    expect(optimizedImageUrl(transformed, 1200)).toBe(transformed);
    expect(optimizedImageUrl("not a url", 600)).toBe("not a url");
  });
});
