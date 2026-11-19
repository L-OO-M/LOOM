import { describe, expect, it } from "vitest";
import {
  IDENTITY_PROVIDERS,
  identityStatusLabel,
  newVerifyToken,
  normalizeIdentityValue,
  proofHostAllowed,
  tokenPresent
} from "@/lib/identity";

describe("identity providers", () => {
  it("covers every account the card can show", () => {
    const keys = IDENTITY_PROVIDERS.map((p) => p.key);
    expect(keys).toEqual([
      "github", "leetcode", "linkedin", "x", "discord",
      "kaggle", "unstop", "devfolio", "huggingface", "website"
    ]);
  });

  it("normalises handles from bare text or a profile URL", () => {
    expect(normalizeIdentityValue("github", "https://github.com/Octocat").value).toBe("Octocat");
    expect(normalizeIdentityValue("huggingface", "@user-name").value).toBe("user-name");
    expect(normalizeIdentityValue("devfolio", "https://devfolio.co/@builder").value).toBe("builder");
  });

  it("keeps a legacy Discord discriminator instead of truncating it", () => {
    expect(normalizeIdentityValue("discord", "gamer#1234").value).toBe("gamer#1234");
    expect(normalizeIdentityValue("discord", "@gamer").value).toBe("gamer");
  });

  it("rejects a LinkedIn URL that is not LinkedIn", () => {
    expect(normalizeIdentityValue("linkedin", "https://example.com/in/me").error).toMatch(/linkedin/i);
  });

  it("accepts a real http(s) URL for a personal site", () => {
    expect(normalizeIdentityValue("website", "mysite.dev").value).toBe("https://mysite.dev");
  });
});

describe("ownership code", () => {
  it("is prefixed and random", () => {
    const a = newVerifyToken();
    const b = newVerifyToken();
    expect(a).toMatch(/^loom-verify-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("is found in a page regardless of surrounding copy or case", () => {
    const token = "loom-verify-abc123456789";
    expect(tokenPresent(`My bio: ${token.toUpperCase()}`, token)).toBe(true);
    expect(tokenPresent("nothing here", token)).toBe(false);
  });
});

describe("proof host safety", () => {
  it("allows a provider's own public host", () => {
    expect(proofHostAllowed("huggingface", "https://huggingface.co/user")).toBe(true);
    expect(proofHostAllowed("devfolio", "https://devfolio.co/@user")).toBe(true);
  });

  it("refuses a different host for a provider-specific check", () => {
    expect(proofHostAllowed("kaggle", "https://example.com/me")).toBe(false);
  });

  it("never fetches loopback or private addresses", () => {
    expect(proofHostAllowed("website", "http://localhost:3000/admin")).toBe(false);
    expect(proofHostAllowed("website", "http://127.0.0.1/secret")).toBe(false);
    expect(proofHostAllowed("website", "http://192.168.1.2/")).toBe(false);
    expect(proofHostAllowed("website", "http://169.254.169.254/latest/meta-data")).toBe(false);
  });

  it("refuses a non-standard port on an otherwise public host", () => {
    expect(proofHostAllowed("website", "https://portfolio.example.dev:8443/me")).toBe(false);
    expect(proofHostAllowed("website", "https://portfolio.example.dev/me")).toBe(true);
  });

  it("allows a personal domain because the member owns the page", () => {
    expect(proofHostAllowed("website", "https://portfolio.example.dev")).toBe(true);
  });
});

describe("identityStatusLabel", () => {
  it("never upgrades a claim to verified in copy", () => {
    expect(identityStatusLabel("claimed")).toBe("Claimed");
    expect(identityStatusLabel("linked")).toBe("Linked");
    expect(identityStatusLabel("verified")).toBe("Verified");
    expect(identityStatusLabel(undefined)).toBe("Claimed");
  });
});
