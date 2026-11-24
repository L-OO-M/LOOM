import { describe, expect, it } from "vitest";
import {
  EVENT_PAGE_TEMPLATES,
  EVENT_SECTION_TYPES,
  safeImage,
  safeLink,
  sanitizeEventPage,
  sanitizeSections,
  sectionsFromRow
} from "@/lib/event-page";

describe("event page sections", () => {
  it("keeps every shipped section type and drops nothing the author typed", () => {
    expect(EVENT_SECTION_TYPES.map((entry) => entry.type)).toEqual([
      "overview",
      "problem",
      "prizes",
      "schedule",
      "rules",
      "faq",
      "resources"
    ]);
    const sections = sanitizeSections([
      { type: "problem", heading: "Problem statements", bullets: ["A", "", "B"] },
      { type: "unknown", body: "Falls back to overview" }
    ]);
    expect(sections).toHaveLength(2);
    expect(sections[0].bullets).toEqual(["A", "B"]);
    expect(sections[1]).toMatchObject({ type: "overview", heading: "Full overview", body: "Falls back to overview" });
  });

  it("drops an empty block instead of publishing a blank heading", () => {
    expect(sanitizeSections([{ type: "rules" }, { type: "faq", heading: "   " }])).toEqual([]);
  });

  it("refuses javascript links and non-https images", () => {
    expect(safeLink("javascript:alert(1)")).toBe("");
    expect(safeLink("https://example.com/brief")).toBe("https://example.com/brief");
    expect(safeLink("http://example.com/brief")).toBe("");
    expect(safeImage("/events/cover.png")).toBe("/events/cover.png");
    expect(safeImage("//evil.test/x.png")).toBeNull();
    expect(safeImage("data:image/png;base64,abc")).toBeNull();
    expect(safeImage("https://cdn.example.com/x.png")).toBe("https://cdn.example.com/x.png");
  });

  it("filters link rows that would render as dead buttons", () => {
    const sections = sanitizeSections([
      {
        type: "resources",
        heading: "Resources",
        links: [
          { label: "Dataset", url: "https://example.com/data" },
          { label: "Bad", url: "javascript:alert(1)" },
          { label: "", url: "https://example.com/x" }
        ]
      }
    ]);
    expect(sections[0].links).toEqual([{ label: "Dataset", url: "https://example.com/data" }]);
  });

  it("caps size so one event cannot store an unbounded page", () => {
    const sections = sanitizeSections(
      Array.from({ length: 20 }, (_, index) => ({ type: "overview", heading: `H${index}`, body: "x".repeat(9000) }))
    );
    expect(sections).toHaveLength(12);
    expect(sections[0].body.length).toBe(5000);
  });

  it("reads a jsonb row whether it arrives parsed or as text", () => {
    const raw = [{ type: "prizes", heading: "Prizes", bullets: ["First: ₹5,000"] }];
    expect(sectionsFromRow(raw)).toHaveLength(1);
    expect(sectionsFromRow(JSON.stringify(raw))).toHaveLength(1);
    expect(sectionsFromRow("not json")).toEqual([]);
    expect(sectionsFromRow(null)).toEqual([]);
  });

  it("normalizes the whole page payload in one call", () => {
    const page = sanitizeEventPage({
      tagline: "  36 hours. One dataset.  ",
      coverImageUrl: "javascript:alert(1)",
      sections: [{ type: "overview", heading: "Why", body: "Because the chapter needs it." }]
    });
    expect(page).toMatchObject({ tagline: "36 hours. One dataset.", coverImageUrl: null });
    expect(page.sections).toHaveLength(1);
    expect(sanitizeEventPage({}).tagline).toBeNull();
  });

  it("does not publish a heading whose block was never filled in", () => {
    const page = sanitizeEventPage({ sections: [{ type: "schedule", heading: "Schedule" }] });
    expect(page.sections).toEqual([]);
  });

  it("ships starter block sets per event type, in reading order", () => {
    expect(EVENT_PAGE_TEMPLATES.hackathon.types).toEqual([
      "overview",
      "problem",
      "prizes",
      "schedule",
      "rules",
      "faq",
      "resources"
    ]);
    for (const [type, template] of Object.entries(EVENT_PAGE_TEMPLATES)) {
      expect(template.types.length, type).toBeGreaterThan(1);
      expect(new Set(template.types).size, type).toBe(template.types.length);
      for (const block of template.types) {
        expect(EVENT_SECTION_TYPES.some((entry) => entry.type === block), block).toBe(true);
      }
    }
  });
});
