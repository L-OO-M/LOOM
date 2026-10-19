import { describe, expect, it } from "vitest";
import { loadPublicBuilderCard } from "@/app/u/[username]/cardData";
import { scoreReputation } from "@/lib/reputation";

/**
 * Regression: the public builder card (the image behind /u/<name>/opengraph-image
 * and /u/<name>/card/<format>) selected only `username, bio, is_public` from
 * user_profiles and then read `card.user_id` for the reputation + follower
 * lookups. `user_id` was undefined, postgres.js rejects an undefined parameter,
 * and the throw was swallowed by cardData's own catch -- so EVERY public card
 * rendered the "BUILDER NOT FOUND" placeholder. Nobody noticed because no test
 * ever exercised loadPublicBuilderCard.
 *
 * The fake `sql` below scrapes the SELECT list from each query and returns only
 * the columns that were actually requested, exactly like a real projection. It
 * also rejects undefined bind parameters the way postgres.js does. Together
 * those two behaviours make this test fail on the old code and pass on the fix.
 */

const USER_ROW = { user_id: "u1", username: "ada", bio: "Countess of loops", is_public: true };

function project(firstChunk) {
  const m = firstChunk.match(/SELECT\s+([\s\S]+?)\s+FROM\s+user_profiles/i);
  if (!m) return USER_ROW;
  return Object.fromEntries(
    m[1].split(",").map((c) => c.trim().split(/\s+/).pop().replace(/[^a-z_]/gi, "")).filter(Boolean)
      .map((k) => [k, USER_ROW[k]])
  );
}

function makeSql({ rows = USER_ROW } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const first = strings[0] || "";
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    calls.push({ text, values });
    // Mimic postgres.js: an undefined bind parameter is a hard error.
    if (values.some((v) => v === undefined)) throw new Error("UNDEFINED_VALUE: bind parameter is undefined");

    if (/from user_profiles/i.test(text)) return rows ? [project(first)] : [];
    if (/from profiles/i.test(text)) return [{ name: "Ada Lovelace", primary_domain: "web" }];
    if (/from followers/i.test(text)) return [{ followers: 7 }];
    if (/count\(\*\)/i.test(text)) {
      return [{ achievements: 4, ossVerified: 3, solutions: 0, wikiPages: 0, eventsAttended: 2, endorsements: 1 }];
    }
    return [];
  };
  sql.json = (v) => v;
  sql.__calls = calls;
  return sql;
}

describe("public builder card", () => {
  it("loads a populated card instead of the not-found placeholder", async () => {
    const sql = makeSql();
    const data = await loadPublicBuilderCard("ada", sql);

    expect(data).not.toBeNull();
    expect(data.username).toBe("ada");
    expect(data.name).toBe("Ada Lovelace");
    expect(data.domain).toBe("web");
    expect(data.bio).toBe("Countess of loops");
    expect(data.followers).toBe(7);
    // reputationFor ran off a real id, so the score is the real weighted total.
    expect(data.score).toBe(
      scoreReputation({ achievements: 4, ossVerified: 3, solutions: 0, wikiPages: 0, eventsAttended: 2, endorsements: 1 })
    );
    expect(data.score).toBeGreaterThan(0);
    expect(data.siteUrl).toContain("/u/ada");
  });

  it("selects user_id from user_profiles (the column that was missing)", async () => {
    const sql = makeSql();
    await loadPublicBuilderCard("ada", sql);
    const cardQuery = sql.__calls.find((c) => /from user_profiles/i.test(c.text));
    expect(cardQuery).toBeTruthy();
    expect(cardQuery.text).toMatch(/select[^]*user_id[^]*from user_profiles/i);
  });

  it("keys the reputation and follower lookups off the real user id", async () => {
    const sql = makeSql();
    await loadPublicBuilderCard("ada", sql);
    const idBearing = sql.__calls.filter((c) => /from followers|from student_achievements/i.test(c.text));
    expect(idBearing.length).toBeGreaterThan(0);
    for (const c of idBearing) expect(c.values).toContain("u1");
  });

  it("returns null for a missing or private profile rather than throwing", async () => {
    const sql = makeSql({ rows: null });
    expect(await loadPublicBuilderCard("ghost", sql)).toBeNull();
  });

  it("returns null for a blank username without touching the database", async () => {
    const sql = makeSql();
    expect(await loadPublicBuilderCard("", sql)).toBeNull();
    expect(sql.__calls.length).toBe(0);
  });
});
