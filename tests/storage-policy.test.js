import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "@/lib/media";
import { sniffMime, validateStorageUpload } from "@/lib/storage";

// Upload policy is the last line of defence before a byte stream reaches the
// bucket. The route can forget to call validateUpload(), but uploadObject()
// cannot: these cases pin what the storage boundary itself accepts.

function bytes(...values) {
  return Buffer.from(values);
}

function pdf() {
  return Buffer.from("%PDF-1.7\nbody");
}

describe("sniffMime", () => {
  it("identifies PDF, PNG, JPEG, GIF and WEBP headers", () => {
    expect(sniffMime(pdf())).toBe("application/pdf");
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffMime(Buffer.from("GIF87a...."))).toBe("image/gif");
    expect(sniffMime(Buffer.from("GIF89a...."))).toBe("image/gif");
    expect(sniffMime(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("identifies every ZIP local-file header variant as a container", () => {
    expect(sniffMime(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("application/zip");
    expect(sniffMime(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("application/zip");
    expect(sniffMime(bytes(0x50, 0x4b, 0x07, 0x08))).toBe("application/zip");
  });

  it("returns null for text, SVG and unrecognised bytes", () => {
    expect(sniffMime(Buffer.from("hello world"))).toBe(null);
    expect(sniffMime(Buffer.from("<svg></svg>"))).toBe(null);
    expect(sniffMime(bytes(0x00, 0x01))).toBe(null);
  });

  it("returns null for short, empty or absent input instead of throwing", () => {
    expect(sniffMime(null)).toBe(null);
    expect(sniffMime(undefined)).toBe(null);
    expect(sniffMime(bytes())).toBe(null);
    expect(sniffMime(bytes(0x25))).toBe(null);
    expect(sniffMime(bytes(0x52, 0x49, 0x46, 0x46))).toBe(null); // RIFF but no WEBP marker
  });
});

describe("validateStorageUpload", () => {
  it("accepts a genuine PDF under its declared type", () => {
    const result = validateStorageUpload({
      path: "assets/tenant/entity/v1-file-report.pdf",
      body: pdf(),
      contentType: "application/pdf"
    });
    expect(result).toMatchObject({ ok: true, mime: "application/pdf", size: pdf().length });
  });

  it("rejects a file whose bytes contradict the declared type", () => {
    const result = validateStorageUpload({
      path: "assets/tenant/entity/v1-file-photo.png",
      body: pdf(),
      contentType: "image/png"
    });
    expect(result).toMatchObject({ ok: false, code: "TYPE_MISMATCH" });
  });

  it("accepts an OOXML document as a ZIP container", () => {
    const result = validateStorageUpload({
      path: "mou/tenant/entity/v1-file-agreement.docx",
      body: bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a plain ZIP declared as a PDF", () => {
    const result = validateStorageUpload({
      path: "assets/tenant/entity/v1-file-bundle.pdf",
      body: bytes(0x50, 0x4b, 0x03, 0x04),
      contentType: "application/pdf"
    });
    expect(result).toMatchObject({ ok: false, code: "TYPE_MISMATCH" });
  });

  it("rejects an empty or sizeless body", () => {
    expect(validateStorageUpload({ path: "a/x/v1-f-empty.pdf", body: Buffer.alloc(0), contentType: "application/pdf" }))
      .toMatchObject({ ok: false, code: "EMPTY_FILE" });
    expect(validateStorageUpload({ path: "a/x/v1-f-empty.pdf", body: null, contentType: "application/pdf" }))
      .toMatchObject({ ok: false, code: "EMPTY_FILE" });
  });

  it("rejects a file above the hard cap using the declared size", () => {
    const body = { size: MAX_UPLOAD_BYTES + 1 };
    const result = validateStorageUpload({ path: "a/x/v1-f-big.pdf", body, contentType: "application/pdf" });
    expect(result).toMatchObject({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("rejects an unsupported extension when no usable MIME is declared", () => {
    const result = validateStorageUpload({
      path: "a/x/v1-f-script.exe",
      body: Buffer.from("MZ"),
      contentType: "application/octet-stream"
    });
    expect(result).toMatchObject({ ok: false, code: "UNSUPPORTED_TYPE" });
  });

  it("derives the MIME from the extension when the browser sends octet-stream", () => {
    const result = validateStorageUpload({
      path: "a/x/v1-f-notes.pdf",
      body: pdf(),
      contentType: "application/octet-stream"
    });
    expect(result).toMatchObject({ ok: true, mime: "application/pdf" });
  });

  it("allows text formats with no byte signature", () => {
    const result = validateStorageUpload({
      path: "a/x/v1-f-notes.md",
      body: Buffer.from("# Notes"),
      contentType: "text/markdown"
    });
    expect(result.ok).toBe(true);
  });

  it("uses only the basename of the path for extension checks", () => {
    const result = validateStorageUpload({
      path: "assets/tenant/.hidden/entity/v1-file-report.pdf",
      body: pdf(),
      contentType: "application/pdf"
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a Blob and applies the size cap without reading magic bytes", () => {
    const result = validateStorageUpload({
      path: "a/x/v1-f-note.txt",
      body: new Blob(["hello"], { type: "text/plain" }),
      contentType: "text/plain"
    });
    expect(result.ok).toBe(true);
    expect(result.size).toBe(5);
  });
});
