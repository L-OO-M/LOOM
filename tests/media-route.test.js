import { describe, expect, it, vi } from "vitest";

async function loadRoute(object = null) {
  vi.resetModules();
  const downloadObject = vi.fn(async () => object);
  vi.doMock("@/lib/storage", () => ({ downloadObject }));
  const { GET } = await import("@/app/api/media/[...key]/route");
  return { GET, downloadObject };
}

describe("public media route", () => {
  it("streams a public/ object with immutable caching", async () => {
    const body = Buffer.from("png-bytes");
    const { GET, downloadObject } = await loadRoute({ body, contentType: "image/png", size: body.length });
    const response = await GET(new Request("http://localhost/api/media/public/t/event/u/x.png"), {
      params: Promise.resolve({ key: ["public", "t", "event", "u", "x.png"] })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(downloadObject).toHaveBeenCalledWith("public/t/event/u/x.png");
  });

  it("never reads a private object path", async () => {
    const { GET, downloadObject } = await loadRoute({ body: Buffer.from("x"), contentType: "", size: 1 });
    const response = await GET(new Request("http://localhost/api/media/assets/t/x.pdf"), {
      params: Promise.resolve({ key: ["assets", "t", "x.pdf"] })
    });
    expect(response.status).toBe(404);
    expect(downloadObject).not.toHaveBeenCalled();
  });

  it("returns 404 when the object is missing", async () => {
    const { GET } = await loadRoute(null);
    const response = await GET(new Request("http://localhost/api/media/public/t/event/u/x.png"), {
      params: Promise.resolve({ key: ["public", "t", "event", "u", "x.png"] })
    });
    expect(response.status).toBe(404);
  });
});
