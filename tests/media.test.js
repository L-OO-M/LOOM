import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  ALLOWED_EXT,
  ALLOWED_MIME,
  extensionOf,
  sanitizeFileName,
  validateUpload,
  buildStoragePath
} from "@/lib/media";

describe("upload validation", () => {
  it("accepts the documented document and image types", () => {
    const ok = [
      { name: "MoU.pdf", mime: "application/pdf", size: 1024 },
      { name: "agreement.docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 2048 },
      { name: "logo.png", mime: "image/png", size: 512 },
      { name: "signature.svg", mime: "image/svg+xml", size: 256 },
      { name: "kit.zip", mime: "application/zip", size: 4096 }
    ];
    for (const f of ok) {
      expect(validateUpload(f).ok, f.name).toBe(true);
    }
  });

  it("falls back to the extension when the browser sends a generic MIME", () => {
    // Real .docx uploads frequently arrive as application/octet-stream.
    const r = validateUpload({ name: "MoU final.DOCX", mime: "application/octet-stream", size: 1000 });
    expect(r.ok).toBe(true);
    expect(r.mime).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(r.ext).toBe("docx");
  });

  it("rejects executables and unknown types", () => {
    for (const name of ["payload.exe", "script.sh", "thing.bin", "noext"]) {
      const r = validateUpload({ name, mime: "application/octet-stream", size: 10 });
      expect(r.ok, name).toBe(false);
      expect(r.code).toBe("UNSUPPORTED_TYPE");
    }
  });

  it("rejects empty and oversized files", () => {
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", size: 0 }).code).toBe("EMPTY_FILE");
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", size: undefined }).code).toBe("EMPTY_FILE");
    const big = validateUpload({ name: "a.pdf", mime: "application/pdf", size: MAX_UPLOAD_BYTES + 1 });
    expect(big.code).toBe("FILE_TOO_LARGE");
    expect(validateUpload({ name: "a.pdf", mime: "application/pdf", size: MAX_UPLOAD_BYTES }).ok).toBe(true);
  });

  it("keeps the allowlists in sync", () => {
    // Every accepted MIME has a canonical extension and vice-versa for the
    // extensions we advertise; jpeg/jpg is the one intentional duplicate.
    expect(ALLOWED_MIME.has("application/pdf")).toBe(true);
    expect(ALLOWED_EXT.has("pdf")).toBe(true);
    expect(ALLOWED_EXT.has("exe")).toBe(false);
  });
});

describe("file name and path safety", () => {
  it("extracts extensions case-insensitively", () => {
    expect(extensionOf("Report.PDF")).toBe("pdf");
    expect(extensionOf("no-dot")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });

  it("strips path separators and control characters from names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(sanitizeFileName("my logo (v2).png")).toBe("my_logo_v2_.png");
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("a\u0000b.pdf")).toBe("ab.pdf");
  });

  it("builds a tenant- and scope-partitioned path", () => {
    const path = buildStoragePath({
      scope: "mou",
      tenantId: "11111111-1111-1111-1111-111111111111",
      entityId: "22222222-2222-2222-2222-222222222222",
      fileId: "33333333-3333-3333-3333-333333333333",
      version: 2,
      fileName: "MoU v2.pdf"
    });
    expect(path).toBe(
      "mou/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/v2-33333333-3333-3333-3333-333333333333-MoU_v2.pdf"
    );
  });

  it("refuses an unknown scope or missing identity", () => {
    expect(() => buildStoragePath({ scope: "hax", tenantId: "t", entityId: "e", fileId: "f", fileName: "a" })).toThrow();
    expect(() => buildStoragePath({ scope: "assets", tenantId: "t", entityId: "", fileId: "f", fileName: "a" })).toThrow();
  });
});
