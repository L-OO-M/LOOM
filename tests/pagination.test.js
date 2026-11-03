import { describe, expect, it } from "vitest";
import {
  clampPage,
  pageCount,
  pageHref,
  pageSizeParam,
  pageWindow,
  paginationMeta,
  requestPage,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX
} from "@/lib/pagination";

const SIZE = 50;

describe("clampPage", () => {
  it("treats 0, negatives, NaN and non-numeric input as page 1", () => {
    expect(clampPage(0, 120, SIZE)).toBe(1);
    expect(clampPage(-3, 120, SIZE)).toBe(1);
    expect(clampPage(NaN, 120, SIZE)).toBe(1);
    expect(clampPage("abc", 120, SIZE)).toBe(1);
    expect(clampPage("", 120, SIZE)).toBe(1);
    expect(clampPage(undefined, 120, SIZE)).toBe(1);
    expect(clampPage(null, 120, SIZE)).toBe(1);
  });

  it("clamps a page past the end to the last page", () => {
    expect(clampPage(4, 120, SIZE)).toBe(3);
    expect(clampPage(999, 120, SIZE)).toBe(3);
    expect(clampPage("1e9", 120, SIZE)).toBe(3);
  });

  it("treats a non-finite value as garbage, not as the last page", () => {
    // ?page=Infinity must not be read as "999999..." and must not crash.
    expect(clampPage(Infinity, 120, SIZE)).toBe(1);
    expect(clampPage(-Infinity, 120, SIZE)).toBe(1);
  });

  it("keeps in-range pages untouched", () => {
    expect(clampPage(1, 120, SIZE)).toBe(1);
    expect(clampPage(2, 120, SIZE)).toBe(2);
    expect(clampPage(3, 120, SIZE)).toBe(3);
    expect(clampPage("2", 120, SIZE)).toBe(2);
    expect(clampPage(2.7, 120, SIZE)).toBe(2);
  });

  it("returns page 1 when there is nothing to page", () => {
    expect(clampPage(1, 0, SIZE)).toBe(1);
    expect(clampPage(7, 0, SIZE)).toBe(1);
    expect(clampPage(1, undefined, SIZE)).toBe(1);
  });
});

describe("pageCount", () => {
  it("uses ceil(total / pageSize)", () => {
    expect(pageCount(120, SIZE)).toBe(3);
    expect(pageCount(101, SIZE)).toBe(3);
    expect(pageCount(100, SIZE)).toBe(2);
    expect(pageCount(51, SIZE)).toBe(2);
    expect(pageCount(50, SIZE)).toBe(1);
    expect(pageCount(1, SIZE)).toBe(1);
  });

  it("reports zero pages for an empty result set", () => {
    expect(pageCount(0, SIZE)).toBe(0);
    expect(pageCount(undefined, SIZE)).toBe(0);
    expect(pageCount(-5, SIZE)).toBe(0);
  });

  it("respects the page size it is given", () => {
    expect(pageCount(100, 25)).toBe(4);
    expect(pageCount(120, 25)).toBe(5);
    expect(pageCount(120, 100)).toBe(2);
  });
});

describe("pageWindow", () => {
  it("describes the first page", () => {
    const win = pageWindow(120, 1, SIZE);
    expect(win).toMatchObject({
      page: 1, pages: 3, offset: 0, from: 1, to: 50,
      hasPrev: false, hasNext: true, outOfRange: false
    });
  });

  it("describes a middle page", () => {
    const win = pageWindow(120, 2, SIZE);
    expect(win).toMatchObject({
      page: 2, pages: 3, offset: 50, from: 51, to: 100,
      hasPrev: true, hasNext: true, outOfRange: false
    });
  });

  it("describes a short last page", () => {
    const win = pageWindow(120, 3, SIZE);
    expect(win).toMatchObject({
      page: 3, pages: 3, offset: 100, from: 101, to: 120,
      hasPrev: true, hasNext: false, outOfRange: false
    });
  });

  it("clamps and flags an out-of-range page without pretending it was page 1", () => {
    const win = pageWindow(120, 9, SIZE);
    expect(win).toMatchObject({
      page: 3, pages: 3, offset: 100, from: 101, to: 120,
      hasPrev: true, hasNext: false, outOfRange: true, requestedPage: 9
    });

    expect(pageWindow(120, -3, SIZE)).toMatchObject({ page: 1, outOfRange: false, requestedPage: 1 });
    expect(pageWindow(120, "abc", SIZE)).toMatchObject({ page: 1, outOfRange: false });
  });

  it("yields from=to=0 and no pages for an empty result set", () => {
    const win = pageWindow(0, 1, SIZE);
    expect(win).toMatchObject({
      page: 1, pages: 0, total: 0, offset: 0, from: 0, to: 0,
      hasPrev: false, hasNext: false, outOfRange: false
    });
  });

  it("respects a non-default page size and slices consecutively", () => {
    const total = 75;
    const size = 10;
    const seen = [];
    for (let page = 1; page <= pageCount(total, size); page += 1) {
      const win = pageWindow(total, page, size);
      expect(win.pageSize).toBe(size);
      expect(win.to - win.from + 1).toBeLessThanOrEqual(size);
      seen.push(...Array.from({ length: win.to - win.from + 1 }, (_, i) => win.from + i));
    }
    expect(pageWindow(total, 1, size)).toMatchObject({ from: 1, to: 10 });
    expect(pageWindow(total, 4, size)).toMatchObject({ from: 31, to: 40, hasNext: true });
    expect(pageWindow(total, 8, size)).toMatchObject({ from: 71, to: 75, hasNext: false });
    // Disjoint and complete: every row number appears exactly once.
    expect(seen).toEqual(Array.from({ length: total }, (_, i) => i + 1));
  });
});

describe("pageSizeParam", () => {
  it("defaults to the shared page size when missing or unusable", () => {
    expect(pageSizeParam(undefined)).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeParam("")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeParam("abc")).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeParam(0)).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeParam(-20)).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeParam(NaN)).toBe(PAGE_SIZE_DEFAULT);
  });

  it("caps a client-supplied size at the server maximum", () => {
    expect(pageSizeParam(25)).toBe(25);
    expect(pageSizeParam("25")).toBe(25);
    expect(pageSizeParam(100)).toBe(PAGE_SIZE_MAX);
    expect(pageSizeParam(5000)).toBe(PAGE_SIZE_MAX);
    expect(pageSizeParam("1e9")).toBe(PAGE_SIZE_MAX);
  });

  it("honours a caller-specific default (mentor sessions page at 20)", () => {
    expect(pageSizeParam(undefined, 20)).toBe(20);
    expect(pageSizeParam(10, 20)).toBe(10);
    expect(pageSizeParam(1000, 20)).toBe(PAGE_SIZE_MAX);
  });

  it("never returns a fractional size", () => {
    expect(pageSizeParam(12.9)).toBe(12);
  });
});

describe("requestPage", () => {
  it("reads page and pageSize from URLSearchParams", () => {
    const params = new URLSearchParams("page=3&pageSize=25");
    expect(requestPage(params)).toEqual({ page: "3", pageSize: 25 });
  });

  it("reads a plain Next searchParams object", () => {
    expect(requestPage({ page: "2" })).toEqual({ page: "2", pageSize: PAGE_SIZE_DEFAULT });
  });

  it("survives a missing source and junk values", () => {
    expect(requestPage(undefined)).toEqual({ page: undefined, pageSize: PAGE_SIZE_DEFAULT });
    expect(requestPage(new URLSearchParams("page=abc&pageSize=0")))
      .toEqual({ page: "abc", pageSize: PAGE_SIZE_DEFAULT });
  });

  it("supports a second list with its own param names", () => {
    const params = new URLSearchParams("page=2&sessionPage=4&sessionPageSize=10");
    expect(requestPage(params, { pageKey: "sessionPage", pageSizeKey: "sessionPageSize", defaultPageSize: 20 }))
      .toEqual({ page: "4", pageSize: 10 });
  });

  it("clamps the page through pageWindow, not here", () => {
    const { page, pageSize } = requestPage(new URLSearchParams("page=999"));
    expect(pageWindow(120, page, pageSize)).toMatchObject({ page: 3, pages: 3, outOfRange: true });
  });
});

describe("paginationMeta", () => {
  it("reports page, pageSize, total and totalPages for an API envelope", () => {
    const win = pageWindow(120, 2, 50);
    expect(paginationMeta(win)).toEqual({
      page: 2,
      pageSize: 50,
      total: 120,
      totalPages: 3,
      from: 51,
      to: 100,
      hasPrev: true,
      hasNext: true,
      outOfRange: false,
      requestedPage: 2
    });
  });

  it("reports an out-of-range request honestly", () => {
    const meta = paginationMeta(pageWindow(10, 7, 50));
    expect(meta).toMatchObject({ page: 1, totalPages: 1, total: 10, outOfRange: true, requestedPage: 7 });
  });
});

describe("pageHref", () => {
  it("keeps every active filter and omits empty ones", () => {
    expect(pageHref("/admin/projects", { q: "loom", status: "", page: "" }, 2))
      .toBe("/admin/projects?q=loom&page=2");
    expect(pageHref("/admin/mentors", { q: "a", domain: "web", kind: "doc" }, 3))
      .toBe("/admin/mentors?q=a&domain=web&kind=doc&page=3");
  });

  it("keeps page 1 implicit", () => {
    expect(pageHref("/admin/resources", { kind: "video" }, 1)).toBe("/admin/resources?kind=video");
    expect(pageHref("/admin/resources", {}, 1)).toBe("/admin/resources");
  });

  it("drops the page key carried in params and ignores junk page numbers", () => {
    expect(pageHref("/admin/projects", { q: "x", page: "4" }, 2)).toBe("/admin/projects?q=x&page=2");
    expect(pageHref("/admin/projects", { q: "x" }, "abc")).toBe("/admin/projects?q=x");
  });

  it("pages a second list independently without losing the first list's page", () => {
    expect(pageHref("/admin/mentors", { page: "2" }, 3, "sessionPage"))
      .toBe("/admin/mentors?page=2&sessionPage=3");
    expect(pageHref("/admin/mentors", { page: "2" }, 1, "sessionPage"))
      .toBe("/admin/mentors?page=2");
  });
});
