import { describe, expect, it } from "vitest";
import { challengeNudge } from "@/lib/challenges";

const overview = { debug: { total: 2, items: [] }, contests: { total: 1, items: [] } };

describe("challengeNudge", () => {
  it("sends a member with fewer than three verified nodes back to the path", () => {
    const nudge = challengeNudge({ verifiedCount: 1, total: 10, domain: "web", overview });
    expect(nudge.title).toMatch(/foundations/i);
    expect(nudge.href).toBe("/student/roadmap");
  });

  it("invites a member with context into their domain challenges", () => {
    const nudge = challengeNudge({ verifiedCount: 4, total: 10, domain: "ai_ml", overview });
    expect(nudge.title).toMatch(/learned enough/i);
    expect(nudge.body).toContain("AI / ML");
    expect(nudge.href).toBe("/student/challenges");
  });

  it("never claims a domain challenge exists when none is published", () => {
    const nudge = challengeNudge({
      verifiedCount: 5,
      total: 10,
      domain: "blockchain",
      overview: { debug: { total: 0 }, contests: { total: 0 } }
    });
    expect(nudge.body).toMatch(/no blockchain challenge is published yet/i);
  });

  it("congratulates a finished track without inventing work", () => {
    const nudge = challengeNudge({ verifiedCount: 10, total: 10, domain: "web", overview: { debug: { total: 0 }, contests: { total: 0 } } });
    expect(nudge.title).toMatch(/path complete/i);
    expect(nudge.body).toMatch(/ship something/i);
  });
});
