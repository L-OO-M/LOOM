import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

// next/navigation and fetch are the only browser/Next surfaces LeadConsole
// touches; both are stubbed so the real component tree renders in Node.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/lead/overview",
  useSearchParams: () => new URLSearchParams()
}));

const { LeadConsole } = await import("@/app/(app)/lead/_components/LeadConsole.jsx");

function overviewData() {
  return {
    role: "vertical_lead",
    departments: [
      { id: "d1", name: "AI / ML", slug: "ai_ml", vertical: "technical", members: 12, contributions: 7, core_requests: 1, succession_ready: 0 }
    ],
    roster: [
      { department_id: "d1", user_id: "u1", name: "Asha Rao", level: "general", core_requested: true, succession_ready: false, year: "2", github_username: "asha", joined_at: null },
      { department_id: "d1", user_id: "u2", name: "Bilal Khan", level: "core", core_requested: false, succession_ready: true, year: "3", github_username: "bilal", joined_at: null }
    ],
    workshops: [],
    proposed: [],
    recentLogs: [],
    calendar: [],
    conflicts: [],
    myLedIds: ["d1"],
    userId: "me",
    charts: {
      rosterLevels: [{ name: "general", value: 1 }, { name: "core", value: 1 }],
      contributionKinds: [{ name: "code", value: 7 }],
      workshopFill: [],
      turnout: [],
      growth: [{ name: "Sep", value: 5 }],
      deptHealth: [{ name: "AI / ML", members: 12, contributions: 7, core_requests: 1, succession_ready: 0 }],
      turnoutPct: 80,
      totalContributions: 7
    }
  };
}

describe("LeadConsole renders without an invalid element type", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, data: overviewData() }) }));
  });

  const sections = ["overview", "roster", "workshops", "reports", "succession"];

  for (const section of sections) {
    it(`renders the ${section} section`, () => {
      const html = renderToStaticMarkup(
        createElement(LeadConsole, {
          initialData: overviewData(),
          userId: "me",
          isVertical: true,
          section
        })
      );
      expect(html.length).toBeGreaterThan(0);
    });
  }

  it("falls back to the overview view for an unknown section", () => {
    const html = renderToStaticMarkup(
      createElement(LeadConsole, {
        initialData: overviewData(),
        userId: "me",
        isVertical: true,
        section: "not-a-real-section"
      })
    );
    expect(html).toContain("Live");
  });
});