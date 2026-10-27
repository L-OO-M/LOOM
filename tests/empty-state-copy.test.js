import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { EmptyState } from "@/components/ui";

const read = (path) => readFileSync(path, "utf8");
const FAQ_PAGE = "app/(app)/admin/faq/page.jsx";
const UI = "components/ui.jsx";

describe("EmptyState copy does not imply the state is temporary", () => {
  it("renders no 'for now' wording in the shared primitive", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "No workshops scheduled yet",
        body: "The calendar is published by the lead team.",
      })
    );
    expect(html).not.toMatch(/for now/i);
    expect(html).not.toMatch(/coming soon/i);
    expect(html).toContain("No workshops scheduled yet");
  });

  it("has no 'for now' literal left in components/ui.jsx", () => {
    expect(read(UI)).not.toMatch(/for now/i);
  });

  it("keeps the existing title/body/action API and meta styling", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "Nothing stored yet",
        body: "Rows added here become visible immediately.",
        action: createElement("a", { href: "/admin/faq" }, "Add a row"),
      })
    );
    expect(html).toContain('class="meta"');
    expect(html).toContain("var(--accent)");
    expect(html).toContain("Nothing stored yet");
    expect(html).toContain("Rows added here become visible immediately.");
    expect(html).toContain('href="/admin/faq"');
    expect(html).toContain("Add a row");
  });
});

describe("admin/faq gates the empty state on a resolved fetch", () => {
  const source = read(FAQ_PAGE);

  it("starts in a loading state instead of the empty state", () => {
    expect(source).toMatch(/const \[loading, setLoading\] = useState\(true\)/);
    expect(source).toContain("Loading FAQ rows…");
  });

  it("clears loading only after the request settles, success or failure", () => {
    expect(source).toMatch(/\.finally\(\(\) => \{/);
    expect(source).toMatch(/if \(live\) setLoading\(false\)/);
    expect(source).toMatch(/\.catch\(\(\) => \{/);
  });

  it("renders the empty state only when the fetch settled successfully", () => {
    expect(source).toContain("const settled = !loading && !failed;");
    expect(source).toMatch(/\{loading \? \(/);
    expect(source).toMatch(/\) : failed \? null : filtered\.length === 0 \? \(/);
    expect(source).toContain("{settled && <div className=\"aled-meta\">");
  });

  it("surfaces the API or network error instead of swallowing it", () => {
    expect(source).toMatch(/setErrorMsg\(d\.error\?\.message/);
    expect(source).toContain("Network error — could not reach the FAQ API.");
    expect(source).toContain("{errorMsg || ");
    expect(source).toContain('role="alert"');
  });
});
