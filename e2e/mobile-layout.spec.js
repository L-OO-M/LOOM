import { test, expect } from "@playwright/test";

/**
 * Mobile layout guard.
 *
 * These failures are invisible to unit tests and to a desktop-only run -- they
 * only exist once real CSS is applied at a real viewport width. Three classes
 * of defect are covered:
 *
 *   1. horizontal overflow  (document scrolls sideways, or a box exceeds the
 *      viewport and gets clipped by an ancestor)
 *   2. sub-44px touch targets (WCAG 2.5.5); text links with no vertical
 *      padding were the dominant instance of this
 *   3. unreadably small text
 *
 * Widths: 390 (iPhone 14/15 class, the common case) and 320 (iPhone SE 1st
 * gen class -- the narrowest screen still in real use, and where fixed-width
 * decorative type and long single words break first).
 */

const WIDTHS = [
  { w: 390, h: 844, label: "390 (modern phone)" },
  { w: 320, h: 844, label: "320 (small phone)" }
];

const ROUTES = [
  "/",
  "/about",
  "/events",
  "/domains",
  "/faq",
  "/login",
  "/register"
];

async function inspect(page, viewportWidth) {
  return page.evaluate((vw) => {
    const problems = [];

    const label = (el) => {
      const id = el.id ? `#${el.id}` : "";
      const cls =
        typeof el.className === "string" && el.className.trim()
          ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
          : "";
      return el.tagName.toLowerCase() + id + cls;
    };

    // --- 1. Page-level horizontal scroll --------------------------------
    const sw = document.documentElement.scrollWidth;
    if (sw > vw + 1) {
      problems.push(`PAGE_HORIZONTAL_SCROLL: scrollWidth=${sw} > viewport=${vw}`);
    }

    // --- 2. Overflowing / offscreen boxes -------------------------------
    for (const el of document.body.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      if (r.width > vw + 1) {
        problems.push(`ELEMENT_TOO_WIDE: ${label(el)} width=${Math.round(r.width)} > ${vw}`);
      }

      if (r.right > vw + 2 || r.left < -2) {
        // Exempt, with reasons:
        //  - inside <svg>: the SVG root clips to its viewBox by UA stylesheet,
        //    so geometry extending past the box is art direction, not overflow.
        //  - pointer-events:none: non-interactive decoration by definition.
        //  - position:fixed: the fixed header is intentionally full-bleed.
        //  - scrollable parent: deliberate horizontal scroller.
        const parent = el.parentElement;
        const scrolls =
          parent && ["auto", "scroll"].includes(getComputedStyle(parent).overflowX);
        const inSvg = Boolean(el.closest("svg"));
        const decorative = cs.pointerEvents === "none";
        if (!scrolls && !inSvg && !decorative && cs.position !== "fixed") {
          problems.push(`OFFSCREEN: ${label(el)} left=${Math.round(r.left)} right=${Math.round(r.right)} vw=${vw}`);
        }
      }
    }

    // --- 3. Touch targets ------------------------------------------------
    const small = [];
    for (const el of document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"]'
    )) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      // The skip link is visually hidden until focused; it is not a tap target
      // in its resting state.
      if (String(el.className || "").includes("sr-only")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      // Inline links inside prose are exempt -- WCAG targets block controls.
      if (cs.display === "inline") continue;
      if (r.height < 44 || r.width < 44) {
        small.push(
          `${label(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || "").trim().slice(0, 24)}"`
        );
      }
    }
    problems.push(...small.map((s) => `SMALL_TOUCH_TARGET: ${s}`));

    // --- 4. Unreadable text ---------------------------------------------
    const tiny = new Set();
    for (const el of document.body.querySelectorAll("*")) {
      if (el.children.length) continue;
      if (!(el.textContent || "").trim()) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px && px < 10) tiny.add(`${label(el)} ${px}px`);
    }
    problems.push(...[...tiny].map((t) => `TINY_TEXT: ${t}`));

    return [...new Set(problems)];
  }, viewportWidth);
}

test.describe("mobile layout", () => {
  for (const vp of WIDTHS) {
    for (const route of ROUTES) {
      test(`${route} @ ${vp.label}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.w, height: vp.h });
        const res = await page.goto(route, { waitUntil: "domcontentloaded" });
        test.skip(!res || res.status() >= 400, `${route} returned a non-2xx (expected for some)`);
        await page.waitForTimeout(250);
        const problems = await inspect(page, vp.w);
        expect(problems, `mobile layout problems on ${route} @${vp.w}px:\n  - ${problems.join("\n  - ")}`).toEqual([]);
      });
    }
  }

  test("dark theme introduces no overflow", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("loom-theme", JSON.stringify({ theme: "dark" }));
      } catch {}
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const res = await page.goto("/about", { waitUntil: "domcontentloaded" });
    test.skip(!res || res.status() >= 400, "about unavailable");
    await page.waitForTimeout(250);
    const problems = (await inspect(page, 390)).filter((p) =>
      /PAGE_HORIZONTAL_SCROLL|ELEMENT_TOO_WIDE|OFFSCREEN/.test(p)
    );
    expect(problems, `about @390 dark:\n  - ${problems.join("\n  - ")}`).toEqual([]);
  });
});
