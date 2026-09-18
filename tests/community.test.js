import { describe, expect, it } from "vitest";
import { FLAG_REASONS, isFlagReason, parseTags, slugify, toggleVote, voteTableFor } from "@/lib/community";

describe("community helpers", () => {
  it("slugifies titles", () => {
    expect(slugify("React Hooks Deep Dive!")).toBe("react-hooks-deep-dive");
    expect(slugify("  DSA: Trees & Graphs  ")).toBe("dsa-trees-graphs");
    expect(slugify("")).toBe("untitled");
  });

  it("whitelists vote targets", () => {
    expect(voteTableFor("thread")).toBe("forum_threads");
    expect(voteTableFor("reply")).toBe("forum_replies");
    expect(voteTableFor("snippet")).toBe("code_snippets");
    expect(voteTableFor("users; DROP TABLE")).toBeNull();
  });

  it("supports exactly the moderation reasons", () => {
    expect(FLAG_REASONS).toEqual(["spam", "abuse", "off-topic"]);
    expect(isFlagReason("spam")).toBe(true);
    expect(isFlagReason("off-topic")).toBe(true);
    expect(isFlagReason("harassment")).toBe(false);
    expect(isFlagReason("")).toBe(false);
  });

  it("parses tag input simply", () => {
    expect(parseTags("dp, Recursion!,  ,x")).toEqual(["dp", "recursion", "x"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("a,b,c,d,e,f,g")).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("toggles votes and keeps counters in sync", async () => {
    const calls = [];
    const sql = Object.assign(
      async (strings, ...values) => {
        const text = strings.join("?").toLowerCase();
        calls.push(text);
        if (text.includes("from forum_votes")) return sql.__existing;
        return [];
      },
      {
        __existing: [],
        json: (v) => v
      }
    );
    // First click adds the vote.
    const added = await toggleVote({ sql, studentId: "u1", targetType: "thread", targetId: "t1" });
    expect(added).toEqual({ voted: true });
    expect(calls.some((c) => c.includes("insert into forum_votes"))).toBe(true);
    expect(calls.some((c) => c.includes("update forum_threads set upvote_count = upvote_count + 1"))).toBe(true);

    // Second click removes it without dropping below zero.
    calls.length = 0;
    sql.__existing = [{ id: "v1" }];
    const removed = await toggleVote({ sql, studentId: "u1", targetType: "thread", targetId: "t1" });
    expect(removed).toEqual({ voted: false });
    expect(calls.some((c) => c.includes("delete from forum_votes"))).toBe(true);
    expect(calls.some((c) => c.includes("greatest(0, upvote_count - 1)"))).toBe(true);
  });

  it("rejects unknown vote targets", async () => {
    const sql = async () => [];
    await expect(toggleVote({ sql, studentId: "u1", targetType: "admin", targetId: "t1" })).rejects.toThrow("INVALID_TARGET");
  });
});
