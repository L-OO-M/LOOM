import { describe, expect, it } from "vitest";
import { EVENT_PALETTES, bannerFor, eventHash } from "@/lib/eventArt";
import { departmentArt, domainArt, eventArt } from "@/lib/artwork";

// Art is derived, never stored: the public banner and the unfurl card must draw
// the same thing for the same event, on every server, forever. That only holds
// while these helpers stay pure and deterministic.

describe("eventHash", () => {
  it("is deterministic and non-negative", () => {
    for (const value of ["", "evt_1", "web:workshop:abc", "अक्षर"]) {
      const hash = eventHash(value);
      expect(hash).toBe(eventHash(value));
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(hash)).toBe(true);
    }
  });

  it("separates different inputs", () => {
    expect(eventHash("event-a")).not.toBe(eventHash("event-b"));
  });

  it("stringifies non-string input instead of throwing", () => {
    expect(eventHash(42)).toBe(eventHash("42"));
    expect(eventHash(null)).toBe(eventHash("null"));
  });
});

describe("bannerFor", () => {
  const event = { id: "evt_1", domain: "web", event_type: "workshop" };

  it("returns the same art for the same event", () => {
    expect(bannerFor(event)).toEqual(bannerFor({ ...event }));
  });

  it("uses a palette from the shared list", () => {
    const banner = bannerFor(event);
    expect(EVENT_PALETTES).toContainEqual(banner.pal);
  });

  it("produces seven nodes and five lines inside the canvas", () => {
    const { nodes, lines } = bannerFor(event);
    expect(nodes).toHaveLength(7);
    expect(lines).toHaveLength(5);

    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(6);
      expect(node.x).toBeLessThanOrEqual(93);
      expect(node.y).toBeGreaterThanOrEqual(10);
      expect(node.y).toBeLessThanOrEqual(89);
      expect(node.r).toBeGreaterThanOrEqual(10);
      expect(node.r).toBeLessThanOrEqual(43);
      expect(node.o).toBeGreaterThanOrEqual(0.16);
      expect(node.o).toBeLessThanOrEqual(0.41);
    }

    for (const line of lines) {
      for (const key of ["x1", "y1", "x2", "y2"]) {
        expect(line[key]).toBeGreaterThanOrEqual(0);
        expect(line[key]).toBeLessThanOrEqual(99);
      }
      expect(line.o).toBeGreaterThanOrEqual(0.1);
      expect(line.o).toBeLessThanOrEqual(0.27);
    }
  });

  it("changes the seed when the domain or type changes", () => {
    const base = bannerFor(event).seed;
    expect(bannerFor({ ...event, domain: "dsa" }).seed).not.toBe(base);
    expect(bannerFor({ ...event, event_type: "hackathon" }).seed).not.toBe(base);
  });

  it("still renders for a missing event", () => {
    const banner = bannerFor(null);
    expect(banner.nodes).toHaveLength(7);
    expect(banner.pal).toBeTruthy();
  });
});

describe("domainArt", () => {
  it("maps canonical keys and human spellings to the same asset", () => {
    expect(domainArt("ai_ml")).toBe("/domains-art/domain-ai.png");
    expect(domainArt("AI ML")).toBe("/domains-art/domain-ai.png");
    expect(domainArt("machine-learning")).toBe("/domains-art/domain-ai.png");
    expect(domainArt("Web Development")).toBe("/domains-art/domain-web.png");
    expect(domainArt("devops")).toBe("/domains-art/domain-infra.png");
  });

  it("returns null for an unknown or empty domain", () => {
    expect(domainArt("quantum-computing")).toBe(null);
    expect(domainArt("")).toBe(null);
    expect(domainArt(null)).toBe(null);
  });
});

describe("eventArt", () => {
  it("maps event types, including spelling variants", () => {
    expect(eventArt("Workshop")).toBe("/events/event-workshop.png");
    expect(eventArt("talk")).toBe("/events/event-talk.png");
    expect(eventArt("hackathon")).toBe("/events/event-hackathon.png");
    expect(eventArt("CTF")).toBe("/events/event-contest.png");
    expect(eventArt("mentoring")).toBe("/events/event-workshop.png");
  });

  it("falls back to the contest art for unknown or missing types", () => {
    expect(eventArt("party")).toBe("/events/event-contest.png");
    expect(eventArt("")).toBe("/events/event-contest.png");
    expect(eventArt(null)).toBe("/events/event-contest.png");
  });
});

describe("departmentArt", () => {
  it("matches a department name by theme", () => {
    expect(departmentArt("Artificial Intelligence & ML")).toBe("/domains-art/domain-ai.png");
    expect(departmentArt("Web Development")).toBe("/domains-art/domain-web.png");
    expect(departmentArt("Cyber Security")).toBe("/domains-art/domain-infra.png");
    expect(departmentArt("Design and Creative")).toBe("/domains-art/domain-creative.png");
    expect(departmentArt("Sponsorship")).toBe("/domains-art/domain-creative.png");
  });

  it("returns null for a name with no matching theme", () => {
    expect(departmentArt("Sports")).toBe(null);
    expect(departmentArt("")).toBe(null);
    expect(departmentArt(null)).toBe(null);
  });

  it("is case and separator insensitive", () => {
    expect(departmentArt("WEB-development")).toBe(departmentArt("web development"));
    expect(departmentArt("AI/ML")).toBe(departmentArt("ai ml"));
  });
});
