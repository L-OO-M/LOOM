import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { highlight } from "@/lib/highlight";

const types = (tokens) => tokens.map((t) => t.type);
const find = (tokens, type, text) => tokens.find((t) => t.type === type && t.text === text);

describe("highlight", () => {
  it("classifies keywords, numbers and comments in JavaScript", () => {
    const tokens = highlight("const x = 1; // note", "javascript");
    expect(find(tokens, "keyword", "const")).toBeTruthy();
    expect(find(tokens, "number", "1")).toBeTruthy();
    expect(find(tokens, "comment", "// note")).toBeTruthy();
  });

  it("classifies strings", () => {
    const tokens = highlight('greet("hello world")', "python");
    expect(find(tokens, "string", '"hello world"')).toBeTruthy();
  });

  it("treats # as a comment only in hash-comment languages", () => {
    expect(types(highlight("# note", "python"))).toContain("comment");
    expect(types(highlight("#fff { color: red }", "css"))).not.toContain("comment");
  });

  it("treats -- as a comment only in dash-comment languages (SQL)", () => {
    expect(find(highlight("-- note", "sql"), "comment", "-- note")).toBeTruthy();
    expect(types(highlight("let a = --b", "javascript"))).not.toContain("comment");
  });

  it("highlights SQL keywords", () => {
    const tokens = highlight("SELECT id FROM users", "sql");
    expect(find(tokens, "keyword", "SELECT")).toBeTruthy();
    expect(find(tokens, "keyword", "FROM")).toBeTruthy();
  });

  it("merges adjacent plain text into one token", () => {
    const tokens = highlight("abc", "javascript");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toEqual({ type: "plain", text: "abc" });
  });

  it("never throws on non-string input", () => {
    expect(highlight(null, "javascript")).toEqual([]);
    expect(highlight(undefined)).toEqual([]);
  });

  it("reconstructs the original code exactly", () => {
    const src = "def f(x):\n  return x + 1  # add\n";
    expect(highlight(src, "python").map((t) => t.text).join("")).toBe(src);
  });
});

describe("the snippets page renders highlighted code", () => {
  it("uses the server CodeBlock instead of a raw <pre>{code}</pre>", () => {
    const page = readFileSync("app/(app)/student/community/snippets/page.jsx", "utf8");
    expect(page).toContain("CodeBlock");
    expect(page).not.toMatch(/<pre[^>]*>\{s\.code\}<\/pre>/);
  });
});
