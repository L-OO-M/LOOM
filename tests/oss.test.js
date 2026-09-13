import { describe, expect, it } from "vitest";
import { OSS_BADGES, earnedBadgeKeys, parseContributionUrl } from "@/lib/oss";

describe("oss helpers", () => {
  it("defines the badge ladder", () => {
    expect(OSS_BADGES.map((b) => b.key)).toEqual(["first-pr", "three-merged", "five-merged", "reviewer"]);
  });

  it("awards badges by verified counts", () => {
    expect(earnedBadgeKeys({ verifiedPrs: 0, reviews: 0 })).toEqual([]);
    expect(earnedBadgeKeys({ verifiedPrs: 1 })).toEqual(["first-pr"]);
    expect(earnedBadgeKeys({ verifiedPrs: 4 })).toEqual(["first-pr", "three-merged"]);
    expect(earnedBadgeKeys({ verifiedPrs: 6, reviews: 3 })).toEqual(["first-pr", "three-merged", "five-merged", "reviewer"]);
  });

  it("parses PR and issue URLs", () => {
    expect(parseContributionUrl("https://github.com/facebook/react/pull/123")).toEqual({ owner: "facebook", repo: "react", kind: "pr", number: 123 });
    expect(parseContributionUrl("https://github.com/vercel/next.js/issues/9/")).toEqual({ owner: "vercel", repo: "next.js", kind: "issue", number: 9 });
    expect(parseContributionUrl("https://github.com/o/r")).toBeNull();
    expect(parseContributionUrl("not a url")).toBeNull();
  });
});
