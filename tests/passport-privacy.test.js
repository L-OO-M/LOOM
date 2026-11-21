import { describe, expect, it } from "vitest";
import {
  DEFAULT_PASSPORT_PRIVACY,
  filterProofForPassport,
  isFieldVisible,
  filterProfileForPassport
} from "@/lib/passport-privacy";

const mockProfile = {
  user_id: "usr-1",
  name: "Alex Doe",
  roll_number: "22BCS101",
  branch: "Computer Science",
  year: 3,
  department_work: [{ task: "Refactor API", status: "done" }],
  github_stats: { commits: 42, prs: 5 },
  certificates: [{ title: "AI Workshop", code: "CERT-101" }]
};

describe("public passport privacy engine", () => {
  it("defaults academic info to private or chapter level", () => {
    expect(DEFAULT_PASSPORT_PRIVACY.show_roll_number).toBe("private");
    expect(DEFAULT_PASSPORT_PRIVACY.show_branch).toBe("chapter");
    expect(DEFAULT_PASSPORT_PRIVACY.show_year).toBe("chapter");
    expect(DEFAULT_PASSPORT_PRIVACY.show_certificates).toBe("public");
  });

  it("masks roll number from anonymous and chapter visitors when private", () => {
    expect(isFieldVisible({ fieldLevel: "private", isOwner: false, isSameChapter: false })).toBe(false);
    expect(isFieldVisible({ fieldLevel: "private", isOwner: false, isSameChapter: true })).toBe(false);
    expect(isFieldVisible({ fieldLevel: "private", isOwner: true, isSameChapter: false })).toBe(true);
  });

  it("reveals chapter-scoped fields to authenticated chapter members but not public", () => {
    expect(isFieldVisible({ fieldLevel: "chapter", isOwner: false, isSameChapter: false })).toBe(false);
    expect(isFieldVisible({ fieldLevel: "chapter", isOwner: false, isSameChapter: true })).toBe(true);
    expect(isFieldVisible({ fieldLevel: "chapter", isOwner: true, isSameChapter: false })).toBe(true);
  });

  it("hides the default chapter passport from public unauthenticated visitors", () => {
    const publicView = filterProfileForPassport(mockProfile, DEFAULT_PASSPORT_PRIVACY, {
      isOwner: false,
      isSameChapter: false
    });
    expect(publicView).toBeNull();
  });

  it("exposes chapter-level fields to logged-in chapter peers", () => {
    const chapterView = filterProfileForPassport(mockProfile, DEFAULT_PASSPORT_PRIVACY, {
      isOwner: false,
      isSameChapter: true
    });

    expect(chapterView.branch).toBe("Computer Science");
    expect(chapterView.year).toBe(3);
    expect(chapterView.roll_number).toBeNull(); // Private to owner
    expect(chapterView.department_work).toEqual([]);
  });

  it("exposes everything to the profile owner", () => {
    const ownerView = filterProfileForPassport(mockProfile, DEFAULT_PASSPORT_PRIVACY, {
      isOwner: true,
      isSameChapter: false
    });

    expect(ownerView.roll_number).toBe("22BCS101");
    expect(ownerView.branch).toBe("Computer Science");
    expect(ownerView.year).toBe(3);
  });

  it("hides entire profile when visibility is set to private and viewer is not owner", () => {
    const privacy = { ...DEFAULT_PASSPORT_PRIVACY, visibility: "private" };
    expect(filterProfileForPassport(mockProfile, privacy, { isOwner: false })).toBeNull();
    expect(filterProfileForPassport(mockProfile, privacy, { isOwner: true })).not.toBeNull();
  });

  it("does not reintroduce hidden fields through proof cards or counts", () => {
    const filtered = filterProofForPassport({
      items: [
        { kind: "project", verified: true },
        { kind: "activity", count: 12, verified: true },
        { kind: "certificate", verified: true },
        { kind: "oss", verified: true }
      ]
    }, DEFAULT_PASSPORT_PRIVACY, { isOwner: false, isSameChapter: false });

    expect(filtered.items.map((item) => item.kind)).toEqual(["certificate", "oss"]);
    expect(filtered.counts).toMatchObject({
      verifiedProjects: 0,
      mergedPrs: 1,
      certificates: 1,
      activeDays: 0
    });
  });
});
