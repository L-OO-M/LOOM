import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import satori from "satori";
import { bannerFor } from "@/lib/eventArt";
import { EventCard, EVENT_CARD_SIZE, clip, eventDateLine, seatsLine } from "@/lib/eventCard";

const FONT = readFileSync("node_modules/@vercel/og/dist/Geist-Regular.ttf");

const EVENT = {
  id: "7a1f5e6c-1d2b-4c3a-9e8f-0a1b2c3d4e5f",
  event_type: "hackathon",
  title: "Midnight Build Sprint",
  domain: "web",
  starts_at: "2026-11-14T12:30:00Z",
  ends_at: "2026-11-15T06:00:00Z",
  location: "Innovation Lab, Block C",
  capacity: 120,
  registered_count: 84,
  is_online: false,
  status: "upcoming",
  siteUrl: "https://loom.example/events"
};

function textOf(node) {
  if (node == null || node === false || node === true) return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  if (typeof node.type === "function") return textOf(node.type(node.props));
  return textOf(node.props?.children);
}

function cardText(event) {
  return textOf(createElement(EventCard, { event })).replace(/\s+/g, " ");
}

async function render(event) {
  return satori(createElement(EventCard, { event }), {
    ...EVENT_CARD_SIZE,
    fonts: [{ name: "sans-serif", data: FONT, weight: 400, style: "normal" }]
  });
}

describe("event artwork", () => {
  it("derives the same art for the same event and different art for another", () => {
    expect(bannerFor(EVENT)).toEqual(bannerFor({ ...EVENT }));
    expect(bannerFor(EVENT)).not.toEqual(bannerFor({ ...EVENT, id: "another-event" }));
  });

  it("only uses real capacity numbers", () => {
    expect(seatsLine(EVENT)).toBe("36 of 120 seats left");
    expect(seatsLine({ capacity: 10, registered_count: 10 })).toBe("Full — waitlist");
    expect(seatsLine({ capacity: null, registered_count: 4 })).toBe("Open registration");
  });

  it("collapses a multi-line title and clips it to one card-sized line", () => {
    expect(clip("  Build\n\nsomething   real  ")).toBe("Build something real");
    const long = "x".repeat(200);
    expect(clip(long).length).toBeLessThan(long.length);
    expect(clip(long).endsWith("…")).toBe(true);
  });

  it("formats a real start date and degrades to an empty string", () => {
    expect(eventDateLine(EVENT.starts_at)).toMatch(/14 Nov/);
    expect(eventDateLine("not-a-date")).toBe("");
  });
});

describe("event card content", () => {
  it("shows the title, type, date, venue, seats, and real destination", () => {
    const text = cardText(EVENT);
    expect(text).toContain("Midnight Build Sprint");
    expect(text).toContain("HACKATHON");
    expect(text).toContain("14 Nov");
    expect(text).toContain("Innovation Lab, Block C");
    expect(text).toContain("36 of 120 seats left");
    expect(text).toContain("loom.example/events");
    expect(text).toContain("SIGN IN TO CLAIM A SEAT");
  });

  it("marks a concluded event without inviting registration", () => {
    const text = cardText({ ...EVENT, status: "past" });
    expect(text).toContain("Event concluded");
    expect(text).toContain("EVENT CONCLUDED");
    expect(text).not.toContain("SIGN IN TO CLAIM A SEAT");
  });

  it("renders honest fallbacks for an event with no venue or title", () => {
    const text = cardText({ ...EVENT, title: "", location: null, capacity: null });
    expect(text).toContain("L.O.O.M. event");
    expect(text).toContain("Venue announced soon");
    expect(text).toContain("Open registration");
  });
});

describe("event card Satori render", () => {
  it("renders at unfurl size without throwing", async () => {
    const svg = await render(EVENT);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });

  it("renders the concluded state", async () => {
    const svg = await render({ ...EVENT, status: "past" });
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });
});
