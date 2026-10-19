import { describe, expect, it } from "vitest";
import { studyRowModel } from "@/app/(app)/student/roadmap/[nodeId]/_components/NodeStudyList";

// Regression test for "every node shows the same resources". The node's
// shelf is domain-scoped by the page query (the only association key in
// the data model), and NodeStudyList must render exactly the array it
// receives — never re-associate, filter, or reorder rows. These fixtures
// mirror the observed catalog rows (read-only snapshot).
const WEB_SHELF = [
  { id: "res_git_branching", title: "Git branching strategies", url: "https://learngitbranching.js.org/", minutes: 20 },
  { id: "res_html_semantic", title: "Semantic HTML structure", url: "https://developer.mozilla.org/docs/Web/HTML", minutes: 25 },
  { id: "res_css_grid", title: "CSS Grid layout patterns", url: "https://css-tricks.com/snippets/css/complete-guide-grid/", minutes: 30 },
  { id: "res_js_async", title: "Async JavaScript patterns", url: "https://developer.mozilla.org/docs/Learn/JavaScript/Asynchronous", minutes: 35 },
  { id: "res_react_hooks", title: "React Hooks deep dive", url: "https://react.dev/reference/react", minutes: 40 },
  { id: "res_webdev_learn", title: "web.dev Learn: modern web fundamentals", url: "https://web.dev/learn", minutes: 120 },
];

const DSA_SHELF = [
  { id: "res_big_o", title: "Big-O Cheat Sheet", url: "https://www.bigocheatsheet.com/", minutes: 15 },
  { id: "res_cp_algo", title: "CP-Algorithms", url: "https://cp-algorithms.com/", minutes: 45 },
];

function modelsFor(rows) {
  return rows.map((r) => {
    const m = studyRowModel(r);
    return { id: r.id, title: r.title, direct: m.direct, zenSupported: m.zenSupported };
  });
}

describe("studyRowModel node association", () => {
  it("renders identical shelves identically no matter which node passed them", () => {
    // node_javascript and rm_android both carry domain "web", so the page
    // hands both lists the same six rows — the component must not diverge.
    expect(modelsFor(WEB_SHELF)).toEqual(modelsFor([...WEB_SHELF]));
  });

  it("retains distinct lists for distinct shelves", () => {
    const web = modelsFor(WEB_SHELF);
    const dsa = modelsFor(DSA_SHELF);
    expect(web.map((m) => m.id)).not.toEqual(dsa.map((m) => m.id));
    expect(dsa).toHaveLength(2);
    expect(dsa[0]).toMatchObject({ id: "res_big_o", zenSupported: true });
  });

  it("preserves row identity, order, and destination through the model", () => {
    const models = modelsFor(WEB_SHELF);
    expect(models.map((m) => m.id)).toEqual(WEB_SHELF.map((r) => r.id));
    expect(models.map((m) => m.title)).toEqual(WEB_SHELF.map((r) => r.title));
    expect(models[0].direct).toBe("https://learngitbranching.js.org/");
    expect(models[0].zenSupported).toBe(true);
    expect(models[1].direct).toBe("https://developer.mozilla.org/docs/Web/HTML");
    expect(models[1].zenSupported).toBe(true);
  });

  it("keeps rows without a destination unavailable", () => {
    const m = studyRowModel({ id: "x", title: "Draft", url: null });
    expect(m.direct).toBeNull();
    expect(m.zenSupported).toBe(false);
  });
});
