import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { readFileSync } from "node:fs";
import satori from "satori";
import { BuilderCard } from "@/lib/builderCard";
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

const FONT = readFileSync("node_modules/@vercel/og/dist/Geist-Regular.ttf");
const CARD = {
  name: "Ada Lovelace",
  username: "ada",
  domain: "web",
  bio: "Countess of loops and analytical engines.",
  score: 128,
  achievements: 4,
  ossVerified: 3,
  eventsAttended: 2,
  followers: 7,
  siteUrl: "https://loom.example/u/ada"
};

function textOf(node) {
  if (node == null || node === false || node === true) return "";
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  if (typeof node.type === "function") return textOf(node.type(node.props));
  return textOf(node.props?.children);
}

function cardText(data) {
  return textOf(createElement(BuilderCard, { data })).replace(/\s+/g, " ");
}

async function renderCard(data, width, height) {
  return satori(createElement(BuilderCard, { data }), {
    width,
    height,
    fonts: [{ name: "sans-serif", data: FONT, weight: 400, style: "normal" }]
  });
}

describe("builder card content", () => {
  it("shows only real populated stats and the public link", () => {
    const text = cardText({ ...CARD, format: "feed" });
    expect(text).toContain("Ada Lovelace");
    expect(text).toContain("@ADA");
    expect(text).toContain("loom.example/u/ada");
    expect(text).toContain("REPUTATION");
    expect(text).toContain("128");
  });

  it("shows the story layout's proof line and link", () => {
    const text = cardText({ ...CARD, format: "story" });
    expect(text).toContain("PROOF");
    expect(text).toContain("loom.example/u/ada");
  });

  it("shows the square card's link instead of dropping it", () => {
    const text = cardText({ ...CARD, format: "square" });
    expect(text).toContain("loom.example/u/ada");
  });

  it("honest empty state for a new member with no stats", () => {
    const text = cardText({
      name: "New Member",
      username: "a-very-long-public-handle",
      domain: null,
      bio: "",
      score: 0,
      achievements: 0,
      ossVerified: 0,
      eventsAttended: 0,
      followers: 0,
      siteUrl: "https://loom.example/u/a-very-long-public-handle",
      format: "story"
    });
    expect(text).toContain("BUILDING IN PUBLIC");
    expect(text).toContain("BUILDER");
    expect(text).not.toContain("VERIFIED MERGES");
    expect(text).not.toContain("FOLLOWERS");
  });
});

describe("builder card Satori render", () => {
  it("renders the feed card at OG size without throwing", async () => {
    const svg = await renderCard({ ...CARD, format: "feed" }, 1200, 630);
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });

  it("renders the story card at Instagram size", async () => {
    const svg = await renderCard({ ...CARD, format: "story" }, 1080, 1920);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1920"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });

  it("renders the square card at Instagram size", async () => {
    const svg = await renderCard({ ...CARD, format: "square" }, 1080, 1080);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1080"');
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });

  it("renders a new member's empty state without throwing", async () => {
    const svg = await renderCard({
      name: "New Member",
      username: "a-very-long-public-handle",
      domain: null,
      bio: "",
      score: 0,
      achievements: 0,
      ossVerified: 0,
      eventsAttended: 0,
      followers: 0,
      siteUrl: "https://loom.example/u/a-very-long-public-handle",
      format: "story"
    }, 1080, 1920);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("NaN");
  });
});
