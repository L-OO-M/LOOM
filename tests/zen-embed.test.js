import { describe, expect, it } from "vitest";
import {
  isZenSupported,
  parseYouTubeId,
  toYouTubeEmbedUrl,
  toZenModel,
  zenSiteFallback,
} from "@/lib/zen-embed";

// Zen Learning Mode classification: YouTube → youtube-nocookie embed,
// allowlisted educational hosts → site, validated https PDFs → pdf.
// Everything else stays unsupported so callers keep direct-link behavior.
const ID = "dQw4w9WgXcQ";

describe("parseYouTubeId", () => {
  it("accepts watch, short-link, embed, shorts, and live formats", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtube.com/watch?v=${ID}&t=30s`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://youtu.be/${ID}?si=abc`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it("builds a youtube-nocookie embed URL", () => {
    expect(toYouTubeEmbedUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0`
    );
    expect(toYouTubeEmbedUrl(`https://youtu.be/${ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?rel=0`
    );
  });

  it("rejects malformed IDs", () => {
    expect(parseYouTubeId("https://www.youtube.com/watch?v=too-short")).toBeNull();
    expect(parseYouTubeId("https://youtu.be/not!valid!id")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/embed/")).toBeNull();
    expect(toYouTubeEmbedUrl("https://www.youtube.com/watch?v=short")).toBeNull();
  });

  it("rejects playlists-only URLs with no video ID", () => {
    expect(parseYouTubeId("https://www.youtube.com/playlist?list=PLabc123")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/watch?list=PLabc123")).toBeNull();
    expect(toZenModel({ id: "a", url: "https://www.youtube.com/playlist?list=PLabc123" }).status).toBe(
      "unsupported"
    );
  });
});

describe("toZenModel", () => {
  it("classifies YouTube without trusting kind", () => {
    const m = toZenModel({ id: "a", kind: "article", url: `https://youtu.be/${ID}` });
    expect(m.status).toBe("youtube");
    expect(m.embedUrl).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0`);
    expect(m.originUrl).toContain("youtu.be");
    expect(isZenSupported({ id: "a", url: `https://youtu.be/${ID}` })).toBe(true);
  });

  it("does not treat kind video as YouTube by itself", () => {
    const m = toZenModel({ id: "a", kind: "video", url: "https://example.com/lesson" });
    expect(m.status).toBe("unsupported");
    expect(m.embedUrl).toBeNull();
  });

  it("allows exact allowlisted educational hosts over HTTPS", () => {
    const m = toZenModel({ id: "a", url: "https://react.dev/reference/react" });
    expect(m.status).toBe("site");
    expect(m.embedUrl).toBe("https://react.dev/reference/react");
  });

  it("rejects lookalike and subdomain hosts (exact-host match)", () => {
    expect(
      toZenModel({ id: "a", url: "https://evil.react.dev/guide" }).status
    ).toBe("unsupported");
    expect(
      toZenModel({ id: "a", url: "https://react.dev.evil.com/guide" }).status
    ).toBe("unsupported");
  });

  it("enforces HTTPS for embeddable sites", () => {
    expect(
      toZenModel({ id: "a", url: "http://react.dev/reference/react" }).status
    ).toBe("unsupported");
  });

  it("rejects non-allowlisted hosts", () => {
    const m = toZenModel({ id: "a", url: "https://example.com/guide" });
    expect(m.status).toBe("unsupported");
    expect(m.embedUrl).toBeNull();
    expect(m.originUrl).toBe("https://example.com/guide");
    expect(isZenSupported({ id: "a", url: "https://example.com/guide" })).toBe(false);
  });

  it("classifies validated https PDFs", () => {
    const m = toZenModel({ id: "a", kind: "doc", url: "https://example.com/notes.pdf" });
    expect(m.status).toBe("pdf");
    expect(m.embedUrl).toContain("notes.pdf");
  });

  it("does not embed arbitrary URLs merely because kind is doc", () => {
    expect(toZenModel({ id: "a", kind: "doc", url: "https://example.com/guide" }).status).toBe(
      "unsupported"
    );
  });

  it("rejects http PDFs", () => {
    expect(toZenModel({ id: "a", url: "http://example.com/notes.pdf" }).status).toBe(
      "unsupported"
    );
  });

  it("rejects unsafe schemes", () => {
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,<h1>x</h1>",
      "file:///etc/passwd",
      "ftp://example.com/file.pdf",
    ]) {
      expect(toZenModel({ id: "a", url }).status).toBe("unsupported");
    }
    expect(parseYouTubeId("javascript:alert(1)")).toBeNull();
  });

  it("rejects URL credentials everywhere", () => {
    expect(
      toZenModel({ id: "a", url: "https://user:pass@react.dev/guide" }).status
    ).toBe("unsupported");
    expect(parseYouTubeId(`https://user:pass@www.youtube.com/watch?v=${ID}`)).toBeNull();
    expect(toZenModel({ id: "a", url: `https://user@youtu.be/${ID}` }).status).toBe(
      "unsupported"
    );
    expect(toZenModel({ id: "a", url: "https://user@example.com/notes.pdf" }).status).toBe(
      "unsupported"
    );
  });

  it("rejects explicit non-default ports for allowlisted, YouTube, and PDF URLs", () => {
    expect(
      toZenModel({ id: "a", url: "https://react.dev:8443/guide" }).status
    ).toBe("unsupported");
    expect(parseYouTubeId(`https://www.youtube.com:8443/watch?v=${ID}`)).toBeNull();
    expect(toZenModel({ id: "a", url: "https://example.com:8443/notes.pdf" }).status).toBe(
      "unsupported"
    );
  });

  it("still allows an explicit default port (normalized away by the URL parser)", () => {
    expect(
      toZenModel({ id: "a", url: "https://react.dev:443/guide" }).status
    ).toBe("site");
  });

  it("classifies PDFs with query strings, fragments, and uppercase extensions", () => {
    expect(toZenModel({ id: "a", url: "https://example.com/notes.pdf?download=1" }).status).toBe(
      "pdf"
    );
    expect(toZenModel({ id: "a", url: "https://example.com/notes.pdf#page=2" }).status).toBe(
      "pdf"
    );
    expect(toZenModel({ id: "a", url: "https://example.com/NOTES.PDF" }).status).toBe("pdf");
  });

  it("matches hosts case-insensitively", () => {
    expect(toZenModel({ id: "a", url: "HTTPS://REACT.DEV/guide" }).status).toBe(
      "site"
    );
    expect(parseYouTubeId(`https://YOUTU.BE/${ID}`)).toBe(ID);
    expect(parseYouTubeId(`https://WWW.YOUTUBE.COM/watch?v=${ID}`)).toBe(ID);
  });

  it("accepts YouTube IDs containing '-' and '_'", () => {
    const dashId = "AbC-123_xYz";
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${dashId}`)).toBe(dashId);
    expect(parseYouTubeId(`https://youtu.be/${dashId}`)).toBe(dashId);
    expect(toZenModel({ id: "a", url: `https://youtu.be/${dashId}` }).status).toBe("youtube");
  });

  it("rejects non-string URL inputs without throwing", () => {
    expect(toZenModel({ id: "a", url: 123 }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: {} }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: ["https://example.com/x"] }).status).toBe("unsupported");
    expect(toZenModel(42).status).toBe("unsupported");
    expect(parseYouTubeId(123)).toBeNull();
    expect(parseYouTubeId(null)).toBeNull();
  });

  it("rejects null, missing, blank, malformed, and internal URLs", () => {
    expect(toZenModel(null).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: null }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: "   " }).status).toBe("unsupported");
    expect(toZenModel({ id: "a" }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: "not a url at all" }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: "/student/community/wiki/hello" }).status).toBe(
      "unsupported"
    );
    expect(isZenSupported({ id: "a", url: null })).toBe(false);
  });
});

describe("zenSiteFallback", () => {
  it("provides intentional fallback copy for embedded-site failure", () => {
    const copy = zenSiteFallback();
    expect(copy.eyebrow.length).toBeGreaterThan(0);
    expect(copy.title.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeGreaterThan(0);
    expect(copy.body).toMatch(/externally/);
  });

  it("never claims to detect the framing refusal", () => {
    const copy = zenSiteFallback();
    const text = `${copy.eyebrow} ${copy.title} ${copy.body}`.toLowerCase();
    expect(text).not.toMatch(/detect/);
    expect(text).not.toMatch(/refused|blocked by|denied/);
    expect(text).toMatch(/ slow connection|can't tell the difference/);
  });

});

  it("routes known framing refusers to the external launchpad, never an iframe", () => {
    for (const url of [
      "https://developer.mozilla.org/docs/Web/HTML",
      "https://web.dev/learn",
      "https://javascript.info/",
      "https://developers.google.com/machine-learning/crash-course",
    ]) {
      const m = toZenModel({ id: "a", url });
      expect(m.status).toBe("external");
      expect(m.embedUrl).toBeNull();
      expect(m.originUrl).toBe(url);
    }
  });

  it("keeps exact-host discipline on the refusal set", () => {
    expect(toZenModel({ id: "a", url: "https://evil.web.dev/guide" }).status).toBe(
      "unsupported"
    );
    expect(toZenModel({ id: "a", url: "https://web.dev.evil.com/guide" }).status).toBe(
      "unsupported"
    );
    expect(toZenModel({ id: "a", url: "http://web.dev/learn" }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: "https://user:pass@web.dev/learn" }).status).toBe(
      "unsupported"
    );
    expect(toZenModel({ id: "a", url: "https://web.dev:8443/learn" }).status).toBe(
      "unsupported"
    );
  });

  it("supports evidence-clean catalog hosts over HTTPS", () => {
    // Each served no X-Frame-Options / frame-ancestors denial when probed.
    for (const url of [
      "https://react.dev/reference/react",
      "https://learngitbranching.js.org/",
      "https://distill.pub/",
      "https://course.fast.ai/",
      "https://developer.bitcoin.org/",
      "https://docs.soliditylang.org/en/v0.8.37/",
      "https://cryptozombies.io/",
      "https://tryhackme.com/",
      "https://www.bigocheatsheet.com/",
      "https://visualgo.net/en",
      "https://cp-algorithms.com/",
      "https://neetcode.io/",
    ]) {
      expect(toZenModel({ id: "a", url }).status).toBe("site");
    }
  });

  it("still rejects dangerous shapes on newly allowed hosts", () => {
    expect(toZenModel({ id: "a", url: "http://react.dev/guide" }).status).toBe("unsupported");
    expect(toZenModel({ id: "a", url: "https://user:pass@react.dev/guide" }).status).toBe(
      "unsupported"
    );
    expect(toZenModel({ id: "a", url: "https://neetcode.io:8443/" }).status).toBe("unsupported");
  });
