import { describe, expect, it } from "vitest";
import { RESERVED_USERNAMES, reputationForMany, scoreReputation, validUsername } from "@/lib/reputation";

// Static single-segment routes under /student/<segment> win over the
// [username] dynamic route, so these names must never become usernames.
const STATIC_SEGMENTS = [
  "certificates",
  "community",
  "contests",
  "credentials",
  "discover",
  "events",
  "github",
  "insights",
  "leaderboard",
  "mentorship",
  "network",
  "notifications",
  "onboarding",
  "opensource",
  "privacy",
  "projects",
  "resources",
  "roadmap",
  "settings"
];

describe("people username policy", () => {
  it("rejects every static student route segment", () => {
    for (const name of STATIC_SEGMENTS) {
      expect(validUsername(name)).toBe(false);
    }
  });

  it("rejects reserved names case-insensitively", () => {
    expect(validUsername("Discover")).toBe(false);
    expect(validUsername("NETWORK")).toBe(false);
    expect(validUsername("Projects")).toBe(false);
  });

  it("keeps the reserved list in sync with the static segments", () => {
    expect([...RESERVED_USERNAMES].sort()).toEqual([...STATIC_SEGMENTS].sort());
  });

  it("still accepts ordinary usernames", () => {
    expect(validUsername("aanya-dev_99")).toBe(true);
    expect(validUsername("ab")).toBe(true);
    expect(validUsername("discoverer")).toBe(true);
    expect(validUsername("my-network")).toBe(true);
  });

  it("still rejects malformed usernames", () => {
    expect(validUsername("a")).toBe(false);
    expect(validUsername("-bad")).toBe(false);
    expect(validUsername("has space")).toBe(false);
    expect(validUsername("")).toBe(false);
  });
});

describe("reputationForMany", () => {
  // Minimal stand-in for the postgres template tag: routes each of the six
  // GROUP BY queries to canned rows by matching the source table name.
  function fakeSql(tables) {
    return async (strings) => {
      const q = strings.join("?");
      for (const [key, rows] of Object.entries(tables)) {
        if (q.includes(`FROM ${key} `) || q.includes(`FROM ${key}\n`)) return rows;
      }
      return [];
    };
  }

  it("returns an empty map for no students without querying", async () => {
    let calls = 0;
    const sql = async () => { calls++; return []; };
    const out = await reputationForMany(sql, []);
    expect(out.size).toBe(0);
    expect(calls).toBe(0);
  });

  it("aggregates the same six sources with the same weights", async () => {
    const sql = fakeSql({
      student_achievements: [{ id: "u1", n: 2 }],
      student_oss_contributions: [{ id: "u1", n: 1 }, { id: "u2", n: 3 }],
      forum_replies: [{ id: "u2", n: 1 }],
      wiki_pages: [],
      event_registrations: [{ id: "u1", n: 4 }],
      user_endorsements: [{ id: "u1", n: 5 }]
    });
    const out = await reputationForMany(sql, ["u1", "u2"]);
    const u1 = out.get("u1");
    expect(u1).toMatchObject({ achievements: 2, ossVerified: 1, solutions: 0, wikiPages: 0, eventsAttended: 4, endorsements: 5 });
    expect(u1.score).toBe(scoreReputation(u1));
    const u2 = out.get("u2");
    expect(u2).toMatchObject({ achievements: 0, ossVerified: 3, solutions: 1, wikiPages: 0, eventsAttended: 0, endorsements: 0 });
    expect(u2.score).toBe(scoreReputation(u2));
  });

  it("dedupes ids and ignores blanks", async () => {
    const sql = fakeSql({
      student_achievements: [],
      student_oss_contributions: [],
      forum_replies: [],
      wiki_pages: [],
      event_registrations: [],
      user_endorsements: []
    });
    const out = await reputationForMany(sql, ["u1", "u1", null, ""]);
    expect(out.size).toBe(1);
    expect(out.get("u1").score).toBe(0);
  });
});
