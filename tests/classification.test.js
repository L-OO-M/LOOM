import { describe, expect, it } from "vitest";
import { classifyStudent, CLASSIFICATION_VERSION } from "@/lib/classification";

describe("classifyStudent", () => {
  it("selects the strongest domain and stores the current version", () => {
    const result = classifyStudent({
      progressByDomain: { web: 80, backend: 20 },
      githubByDomain: { web: 64, backend: 12 },
      contestScore: 10,
      mentorshipSessions: 2
    });

    expect(result.primaryDomain).toBe("web");
    expect(result.version).toBe(CLASSIFICATION_VERSION);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.inputs.progressByDomain.web).toBe(80);
  });
});
