import { describe, expect, it } from "vitest";
import { clampPage, pageCount, pageWindow } from "@/lib/pagination";

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
