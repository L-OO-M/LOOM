import { describe, expect, it } from "vitest";
import { githubLinkHref } from "@/components/actions";

/**
 * Regression for the item-8 hand-off: the OAuth start route has always read and
 * signed `repos`, and the button has always forwarded it, but no caller ever
 * passed it — so a project with a repo recorded still made the student re-pick
 * it. These assertions pin the URL contract that the project page now relies on,
 * without needing a DOM renderer (this suite runs vitest in node).
 */

function reposParam(href) {
  return new URL(href, "http://localhost").searchParams.get("repos");
}

describe("githubLinkHref", () => {
  it("omits the query entirely when no repos are given", () => {
    expect(githubLinkHref(null)).toBe("/api/github/oauth/start");
    expect(githubLinkHref([])).toBe("/api/github/oauth/start");
  });

  it("carries a single owner/repo", () => {
    const href = githubLinkHref(["octocat/hello-world"]);
    expect(href.startsWith("/api/github/oauth/start?")).toBe(true);
    expect(reposParam(href)).toBe("octocat/hello-world");
  });

  it("comma-joins multiple repos, preserving order", () => {
    const href = githubLinkHref(["a/one", "b/two"]);
    expect(reposParam(href)).toBe("a/one,b/two");
  });

  it("ignores non-array input defensively", () => {
    expect(githubLinkHref("octocat/hello-world")).toBe("/api/github/oauth/start");
  });
});
