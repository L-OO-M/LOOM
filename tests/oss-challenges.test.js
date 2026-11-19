import { describe, expect, it } from "vitest";
import {
  challengeDomain,
  challengeRepoChoices,
  normalizeOssSubmission,
  resolveChallengeRepo
} from "@/lib/oss-challenges";
import {
  SOCIETY_FOLDERS,
  SOCIETY_RULES,
  societyChallenge,
  societyFolder
} from "@/lib/society";

const societyRepoName = "L-OO-M/buggy";

// Minimal tag function that answers the two queries resolveChallengeRepo and
// challengeRepoChoices issue. Keeping it explicit means the tests assert on the
// decision, not on SQL text.
function fakeSql({ curated = [] } = {}) {
  return async (strings, ...values) => {
    const text = strings.join("?");
    if (text.includes("FROM open_source_projects")) {
      const [, owner, repo, domain] = values;
      return curated.filter(
        (row) =>
          row.owner.toLowerCase() === String(owner).toLowerCase() &&
          row.repo_name.toLowerCase() === String(repo).toLowerCase() &&
          row.primary_domain === domain
      );
    }
    return [];
  };
}

describe("society challenge folders", () => {
  it("maps every primary track to a real folder", () => {
    for (const domain of ["ai_ml", "web", "cybersecurity", "dsa", "blockchain", "embedded"]) {
      expect(SOCIETY_FOLDERS[domain], `${domain} needs a folder`).toBeTruthy();
    }
  });

  it("has no folder for shared tracks and says so", () => {
    expect(societyFolder("backend")).toBeNull();
    expect(societyFolder("devops")).toBeNull();
    const view = societyChallenge("backend");
    expect(view.hasFolder).toBe(false);
    expect(view.folderUrl).toBe(view.url);
  });

  it("builds a tree URL from the configured repository", () => {
    const view = societyChallenge("web");
    expect(view.repo).toMatch(/^[^/]+\/[^/]+$/);
    expect(view.folder).toBe("domains/web-dev");
    expect(view.folderUrl).toBe(`https://github.com/${view.repo}/tree/main/domains/web-dev`);
  });

  it("states the rules the review actually applies", () => {
    const titles = SOCIETY_RULES.map((rule) => rule.title).join(" ").toLowerCase();
    expect(SOCIETY_RULES.length).toBeGreaterThanOrEqual(5);
    for (const phrase of ["fork", "domain folder", "commit", "lead", "secrets"]) {
      expect(titles).toContain(phrase);
    }
  });
});

describe("resolveChallengeRepo", () => {
  it("accepts the society repository with no project id", async () => {
    const repo = await resolveChallengeRepo(fakeSql(), {
      tenantId: "t1",
      domain: "web",
      repoFullName: societyRepoName
    });
    expect(repo).toEqual({ fullName: societyRepoName, projectId: null, source: "society" });
  });

  it("accepts a curated repository only for its own domain", async () => {
    const sql = fakeSql({
      curated: [{ id: "p1", owner: "vercel", repo_name: "next.js", primary_domain: "web" }]
    });
    const allowed = await resolveChallengeRepo(sql, {
      tenantId: "t1",
      domain: "web",
      repoFullName: "vercel/next.js"
    });
    expect(allowed).toEqual({ fullName: "vercel/next.js", projectId: "p1", source: "curated" });

    const wrongDomain = await resolveChallengeRepo(sql, {
      tenantId: "t1",
      domain: "dsa",
      repoFullName: "vercel/next.js"
    });
    expect(wrongDomain).toBeNull();
  });

  it("rejects an arbitrary repository, so a fork always has domain meaning", async () => {
    const repo = await resolveChallengeRepo(fakeSql(), {
      tenantId: "t1",
      domain: "web",
      repoFullName: "someone/random-thing"
    });
    expect(repo).toBeNull();
  });

  it("rejects values that are not GitHub repositories", async () => {
    const repo = await resolveChallengeRepo(fakeSql(), {
      tenantId: "t1",
      domain: "web",
      repoFullName: "not a repo"
    });
    expect(repo).toBeNull();
  });
});

describe("challengeRepoChoices", () => {
  it("always offers the society repository first and never repeats it", async () => {
    const sql = async (strings) => {
      const text = strings.join("?");
      if (text.includes("FROM open_source_projects")) {
        return [
          { owner: "L-OO-M", repo_name: "buggy", description: "duplicate" },
          { owner: "vercel", repo_name: "next.js", description: "React framework" }
        ];
      }
      return [];
    };
    const choices = await challengeRepoChoices(sql, "t1", "web");
    expect(choices[0].source).toBe("society");
    expect(choices.filter((c) => c.fullName.toLowerCase() === societyRepoName.toLowerCase())).toHaveLength(1);
    expect(choices.some((c) => c.fullName === "vercel/next.js")).toBe(true);
  });

  it("still returns the society repo when the curated table is unavailable", async () => {
    const sql = async () => {
      throw new Error("relation does not exist");
    };
    const choices = await challengeRepoChoices(sql, "t1", "web");
    expect(choices).toHaveLength(1);
    expect(choices[0].fullName).toBe(societyRepoName);
  });
});

describe("normalizeOssSubmission", () => {
  it("returns null for no row", () => {
    expect(normalizeOssSubmission(null)).toBeNull();
  });

  it("normalises a stored submission for the API and the UI", () => {
    const view = normalizeOssSubmission({
      id: "11111111-1111-1111-1111-111111111111",
      user_id: "u1",
      domain: "web",
      repo_full_name: "L-OO-M/buggy",
      project_id: null,
      fork_url: "https://github.com/aarav/buggy",
      fork_full_name: "aarav/buggy",
      note: "fixed checkout",
      status: "submitted",
      verification_status: "verified",
      verification_reason: null,
      review_feedback: "",
      reviewed_at: null,
      created_at: "2026-11-19T10:00:00.000Z",
      student_name: "Aarav"
    });
    expect(view.repoUrl).toBe("https://github.com/L-OO-M/buggy");
    expect(view.reviewFeedback).toBe("");
    expect(view.verificationReason).toBeNull();
    expect(view.createdAt).toBe(Date.parse("2026-11-19T10:00:00.000Z"));
    expect(view.studentName).toBe("Aarav");
    expect(view.studentId).toBe("u1");
  });
});

describe("challengeDomain", () => {
  it("accepts stored keys and display labels alike", () => {
    expect(challengeDomain("web")).toBe("web");
    expect(challengeDomain("Web Development")).toBe("web");
    expect(challengeDomain("AI / ML")).toBe("ai_ml");
  });

  it("returns null for junk instead of guessing a track", () => {
    expect(challengeDomain("")).toBeNull();
    expect(challengeDomain("quantum")).toBeNull();
    expect(challengeDomain(null)).toBeNull();
  });
});
