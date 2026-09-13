import { describe, expect, it } from "vitest";
import { slugify, voteTableFor } from "@/lib/community";

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
});
