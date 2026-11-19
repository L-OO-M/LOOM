import { describe, expect, it } from "vitest";
import {
  DOMAIN_LABEL,
  DOMAIN_ORDER,
  PRIMARY_DOMAINS,
  SHARED_DOMAINS,
  domainLabel,
  isPrimaryDomain,
  normalizeDomainKey,
  orderDomains,
  resolveDomain
} from "@/lib/domains";

// Domain identity is shared by roadmaps, roadmaps filters, planner tracks and
// department pages. Two surfaces disagreeing on the canonical order is what
// produced a 328-node "one graph" view before this module existed.

describe("domain vocabulary", () => {
  it("labels every known domain", () => {
    for (const domain of DOMAIN_ORDER) {
      expect(DOMAIN_LABEL[domain]).toBeTruthy();
      expect(domainLabel(domain)).toBe(DOMAIN_LABEL[domain]);
    }
  });

  it("falls back to the raw key for a legacy domain", () => {
    expect(domainLabel("robotics")).toBe("robotics");
    expect(domainLabel("")).toBe("");
    expect(domainLabel(null)).toBe(null);
    expect(domainLabel(undefined)).toBe(undefined);
  });

  it("keeps primary and shared domains disjoint", () => {
    expect(PRIMARY_DOMAINS.filter((d) => SHARED_DOMAINS.includes(d))).toEqual([]);
    expect(DOMAIN_ORDER).toEqual([...PRIMARY_DOMAINS, ...SHARED_DOMAINS]);
    expect(new Set(DOMAIN_ORDER).size).toBe(DOMAIN_ORDER.length);
  });

  it("only recognises primary tracks as enrollable", () => {
    for (const domain of PRIMARY_DOMAINS) expect(isPrimaryDomain(domain)).toBe(true);
    for (const domain of SHARED_DOMAINS) expect(isPrimaryDomain(domain)).toBe(false);
    expect(isPrimaryDomain("nope")).toBe(false);
    expect(isPrimaryDomain(null)).toBe(false);
  });
});

describe("orderDomains", () => {
  it("puts present primary tracks in canonical order regardless of input order", () => {
    expect(orderDomains(["web", "ai_ml", "dsa"])).toEqual(["ai_ml", "web", "dsa"]);
  });

  it("places shared tracks after primary tracks", () => {
    expect(orderDomains(["devops", "ai_ml", "backend"])).toEqual(["ai_ml", "backend", "devops"]);
  });

  it("keeps unknown domains instead of dropping rows from the UI", () => {
    expect(orderDomains(["robotics", "web", "zzz"])).toEqual(["web", "robotics", "zzz"]);
    expect(orderDomains(["zzz", "robotics"])).toEqual(["robotics", "zzz"]);
  });

  it("de-duplicates and handles empty input", () => {
    expect(orderDomains(["web", "web", "ai_ml"])).toEqual(["ai_ml", "web"]);
    expect(orderDomains([])).toEqual([]);
  });

  it("does not mutate the caller's array", () => {
    const input = ["web", "ai_ml"];
    orderDomains(input);
    expect(input).toEqual(["web", "ai_ml"]);
  });
});

describe("resolveDomain", () => {
  const available = ["web", "ai_ml", "devops"];

  it("prefers an explicit requested domain that has content", () => {
    expect(resolveDomain({ requested: "web", primary: "ai_ml", available })).toBe("web");
  });

  it("ignores a requested domain with no published nodes", () => {
    expect(resolveDomain({ requested: "blockchain", primary: "ai_ml", available })).toBe("ai_ml");
  });

  it("falls back to the member's primary domain", () => {
    expect(resolveDomain({ requested: null, primary: "devops", available })).toBe("devops");
  });

  it("falls back to the first published track in canonical order", () => {
    expect(resolveDomain({ requested: null, primary: "blockchain", available })).toBe("ai_ml");
  });

  it("returns null when nothing is published, never an empty roadmap", () => {
    expect(resolveDomain({ requested: "web", primary: "web", available: [] })).toBe(null);
    expect(resolveDomain({})).toBe(null);
  });

  it("still resolves a legacy domain that only exists in the data", () => {
    expect(resolveDomain({ requested: null, primary: null, available: ["robotics"] })).toBe("robotics");
  });

  it("understands a stored display label instead of silently picking another track", () => {
    expect(resolveDomain({ requested: null, primary: "Cybersecurity", available })).toBe("ai_ml");
    expect(resolveDomain({
      requested: null,
      primary: "Cybersecurity",
      available: ["web", "cybersecurity"]
    })).toBe("cybersecurity");
    expect(normalizeDomainKey("Web Development")).toBe("web");
    expect(normalizeDomainKey("  ai_ml ")).toBe("ai_ml");
    expect(normalizeDomainKey("no such track")).toBe(null);
  });
});
