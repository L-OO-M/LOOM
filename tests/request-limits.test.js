import { describe, expect, it } from "vitest";
import {
  JSON_BODY_LIMIT,
  UPLOAD_BODY_LIMIT,
  bodyLimitFor,
  checkBodySize
} from "@/lib/request-limits";
import { MAX_UPLOAD_BYTES } from "@/lib/media";

// Route handlers call request.json() / request.formData(), which buffer the
// whole body before zod sees it. These limits are the middleware gate that runs
// first. Before it existed, a 6 MB JSON body reached the login handler and was
// fully parsed (400 VALIDATION_ERROR instead of 413).

// `Content-Length` is a forbidden request header in the fetch spec, so a real
// Request cannot carry it in Node. A minimal header bag is enough: these
// functions only read `headers.get`.
function requestWith(contentLength) {
  const headers = new Map();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return { headers: { get: (name) => headers.get(String(name).toLowerCase()) ?? null } };
}

describe("body limit per path", () => {
  it("caps ordinary JSON APIs at 1 MB", () => {
    expect(bodyLimitFor("/api/auth/login")).toBe(JSON_BODY_LIMIT);
    expect(bodyLimitFor("/api/community/threads")).toBe(JSON_BODY_LIMIT);
    expect(JSON_BODY_LIMIT).toBe(1 * 1024 * 1024);
  });

  it("allows the file routes a full upload plus multipart overhead", () => {
    expect(bodyLimitFor("/api/lead/assets")).toBe(UPLOAD_BODY_LIMIT);
    expect(bodyLimitFor("/api/lead/assets/abc/versions")).toBe(UPLOAD_BODY_LIMIT);
    expect(bodyLimitFor("/api/lead/mous/abc/documents")).toBe(UPLOAD_BODY_LIMIT);
    // The cap must stay above the upload validator's own limit or real uploads
    // would be rejected in middleware before validateUpload() ever runs.
    expect(UPLOAD_BODY_LIMIT).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("does not widen unrelated paths that merely look like uploads", () => {
    expect(bodyLimitFor("/api/lead/assets/abc")).toBe(JSON_BODY_LIMIT);
    expect(bodyLimitFor("/api/assets")).toBe(JSON_BODY_LIMIT);
    expect(bodyLimitFor("/api/lead/mous/abc/documents/../../assets")).toBe(JSON_BODY_LIMIT);
  });

  it("allows signed webhooks a full delivery body", () => {
    expect(bodyLimitFor("/api/github/webhook")).toBe(UPLOAD_BODY_LIMIT);
    expect(bodyLimitFor("/api/webhook")).toBe(UPLOAD_BODY_LIMIT);
  });

  it("ignores a trailing slash", () => {
    expect(bodyLimitFor("/api/lead/assets/")).toBe(UPLOAD_BODY_LIMIT);
    expect(bodyLimitFor("/api/auth/login/")).toBe(JSON_BODY_LIMIT);
  });
});

describe("checkBodySize", () => {
  it("accepts a declared length at or under the cap", () => {
    expect(checkBodySize(requestWith(0), "/api/auth/login")).toMatchObject({ ok: true, declared: 0 });
    expect(checkBodySize(requestWith(JSON_BODY_LIMIT), "/api/auth/login")).toMatchObject({
      ok: true,
      declared: JSON_BODY_LIMIT
    });
  });

  it("rejects an oversized declared length with 413", () => {
    // The exact size that used to be buffered and parsed.
    const result = checkBodySize(requestWith(6 * 1024 * 1024), "/api/auth/login");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(413);
    expect(result.limit).toBe(JSON_BODY_LIMIT);
  });

  it("rejects a malformed or negative length with 400", () => {
    expect(checkBodySize(requestWith("six"), "/api/auth/login")).toMatchObject({ ok: false, status: 400 });
    expect(checkBodySize(requestWith(-1), "/api/auth/login")).toMatchObject({ ok: false, status: 400 });
  });

  it("lets a body with no declared length through to route validation", () => {
    // Chunked/absent Content-Length cannot be measured here. The residual risk
    // is why deployment also needs a proxy-level cap; a route must still
    // validate its input.
    expect(checkBodySize(requestWith(undefined), "/api/auth/login")).toMatchObject({
      ok: true,
      declared: null
    });
  });
});
