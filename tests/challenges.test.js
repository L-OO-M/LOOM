import { describe, expect, it } from "vitest";
import { challengeNudge } from "@/lib/challenges";

const overview = { debug: { total: 2, items: [] }, contests: { total: 1, items: [] } };

describe("challengeNudge", () => {
  it("sends a member with fewer than three verified nodes back to the path", () => {
    const nudge = challengeNudge({ verifiedCount: 1, total: 10, domain: "web", overview });
    expect(nudge.title).toMatch(/foundations/i);
    expect(nudge.href).toBe("/student/roadmap");
  });

  it("opens the challenge hub on the track the member is reading", () => {
    const nudge = challengeNudge({ verifiedCount: 4, total: 10, domain: "ai_ml", overview });
    expect(nudge.title).toMatch(/learned enough/i);
    expect(nudge.body).toContain("AI / ML");
    expect(nudge.href).toBe("/student/challenges?domain=ai_ml");
  });

  it("normalises a stored display label before building the link", () => {
    const nudge = challengeNudge({ verifiedCount: 4, total: 10, domain: "Web Development", overview });
    expect(nudge.href).toBe("/student/challenges?domain=web");
  });

  it("counts curated open-source repositories as domain work", () => {
    const nudge = challengeNudge({
      verifiedCount: 4,
      total: 10,
      domain: "dsa",
      overview: { debug: { total: 0 }, contests: { total: 0 }, opensource: { total: 3 } }
    });
    expect(nudge.body).toMatch(/open-source issues/i);
  });

  it("never claims a domain challenge exists when none is published", () => {
    const nudge = challengeNudge({
      verifiedCount: 5,
      total: 10,
      domain: "blockchain",
      overview: { debug: { total: 0 }, contests: { total: 0 }, opensource: { total: 0 } }
    });
    expect(nudge.body).toMatch(/no blockchain challenge is published yet/i);
  });

  it("congratulates a finished track without inventing work", () => {
    const nudge = challengeNudge({ verifiedCount: 10, total: 10, domain: "web", overview: { debug: { total: 0 }, contests: { total: 0 } } });
    expect(nudge.title).toMatch(/path complete/i);
    expect(nudge.body).toMatch(/ship something/i);
  });
});
