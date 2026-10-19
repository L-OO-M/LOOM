// Zen Learning Mode — pure URL classification for embeddable resources.
//
// Decides whether a resource can open inside the Zen overlay, and if so,
// which iframe URL to use. No network, no proxy, no header bypass: anything
// not explicitly approved returns { status: "unsupported" } so callers keep
// the existing direct-link behavior (lib/resource-link.js).
//
// Supported:
// - YouTube watch / youtu.be / embed / shorts / live (strict 11-char IDs)
//   → https://www.youtube-nocookie.com/embed/<id>?rel=0
// - Selected educational sites over HTTPS with an exact-host allowlist.
// - PDFs: validated https URLs whose path ends in .pdf (kind === "doc"
//   alone is never enough — the URL must validate).
// - Known framing refusers (evidence-based, exact-host): no iframe is ever
//   attempted — callers show the Zen external launchpad instead.

// Exact-host allowlist for inline educational sites. Membership is
// evidence-based (Oct 2026 header probes + one real-browser refusal):
// every host below served no X-Frame-Options / frame-ancestors denial.
// Removed for positive refusal evidence: developer.mozilla.org (XFO DENY
// on docs URLs, also observed refused in a real browser), web.dev
// (frame-ancestors 'self'), javascript.info (XFO sameorigin),
// developers.google.com (restrictive frame-ancestors). Those rows keep
// exact native-link behavior via "unsupported".
// Caveat: probes hit `/` (plus a few content paths); sub-paths may differ
// and headers drift — the overlay's persistent fallback covers that case.
export const ZEN_SITE_ALLOWLIST = Object.freeze([
  "cp-algorithms.com",
  "course.fast.ai",
  "cryptozombies.io",
  "developer.bitcoin.org",
  "distill.pub",
  "docs.python.org",
  "docs.soliditylang.org",
  "learngitbranching.js.org",
  "neetcode.io",
  "react.dev",
  "tryhackme.com",
  "visualgo.net",
  "www.bigocheatsheet.com",
]);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

const YOUTU_BE_HOSTS = new Set(["youtu.be", "www.youtu.be"]);

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

// How long ZenMode waits for an iframe load event before offering the
// "this site may block embedding" fallback. Cross-origin blocks often fire
// no error at all, so this is a hint — not a detection claim.
export const ZEN_EMBED_LOAD_TIMEOUT_MS = 10000;

function safeParseUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Reject unsafe / non-http schemes before touching the URL parser.
  if (/^(javascript|data|vbscript|file|ftp):/i.test(trimmed)) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

// Embedded credentials must never reach an iframe or external link:
// `https://user:pass@host/` would send them with the framed request.
function hasCredentials(parsed) {
  return Boolean(parsed.username || parsed.password);
}

// `new URL` normalizes explicit default ports away (":443" on https
// parses to port ""), so this only rejects genuinely non-default ports.
function hasExplicitPort(parsed) {
  return parsed.port !== "";
}

function candidateUrls(resource) {
  const out = [];
  if (!resource) return out;
  if (typeof resource.url === "string" && resource.url.trim()) out.push(resource.url);
  if (typeof resource.embedUrl === "string" && resource.embedUrl.trim()) out.push(resource.embedUrl);
  return out;
}

// Strict YouTube ID extraction. Returns the 11-char ID or null. A
// playlists-only URL (e.g. /playlist?list=...) has no video ID → null.
export function parseYouTubeId(url) {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;
  if (hasCredentials(parsed) || hasExplicitPort(parsed)) return null;
  const host = parsed.hostname.toLowerCase();

  if (YOUTU_BE_HOSTS.has(host)) {
    const id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) return null;
  const parts = parsed.pathname.split("/").filter(Boolean);

  if (parts[0] === "watch") {
    const id = parsed.searchParams.get("v") || "";
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }
  if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") {
    const id = (parts[1] || "").split(/[?#]/)[0];
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }
  return null;
}

export function toYouTubeEmbedUrl(url) {
  const id = parseYouTubeId(url);
  if (!id) return null;
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}

function isAllowedSiteUrl(parsed) {
  if (parsed.protocol !== "https:") return false;
  if (hasCredentials(parsed) || hasExplicitPort(parsed)) return false;
  return ZEN_SITE_ALLOWLIST.includes(parsed.hostname.toLowerCase());
}

function isPdfUrl(parsed) {
  if (parsed.protocol !== "https:") return false;
  if (hasCredentials(parsed) || hasExplicitPort(parsed)) return false;
  const path = parsed.pathname.toLowerCase();
  return path.endsWith(".pdf");
}

// Hosts with positive framing-refusal evidence (probed headers + one
// real-browser refusal). Never embedded — not even attempted — so a broken
// iframe is never presented as success.
const ZEN_REFUSAL_HOSTS = Object.freeze([
  "developer.mozilla.org",
  "developers.google.com",
  "javascript.info",
  "web.dev",
]);

function isRefusalHost(parsed) {
  if (parsed.protocol !== "https:") return false;
  if (hasCredentials(parsed) || hasExplicitPort(parsed)) return false;
  return ZEN_REFUSAL_HOSTS.includes(parsed.hostname.toLowerCase());
}

// Classify a resource row ({ url, kind }) for Zen Mode. Never throws.
// Do not trust `kind` alone: "video" without a valid YouTube URL and
// "doc" without a valid .pdf/allowlisted URL both stay unsupported.
export function toZenModel(resource) {
  const urls = candidateUrls(resource);
  if (urls.length === 0) return { status: "unsupported", embedUrl: null, originUrl: null };

  for (const raw of urls) {
    const parsed = safeParseUrl(raw);
    if (!parsed) continue;
    const originUrl = parsed.toString();

    const ytEmbed = toYouTubeEmbedUrl(raw);
    if (ytEmbed) return { status: "youtube", embedUrl: ytEmbed, originUrl };

    if (isRefusalHost(parsed)) return { status: "external", embedUrl: null, originUrl };

    // PDF hint: the URL itself must be a validated https .pdf. The `kind`
    // label is ignored here on purpose — a "doc" pointing at an arbitrary
    // page must not become embeddable by label alone.
    if (isPdfUrl(parsed)) return { status: "pdf", embedUrl: originUrl, originUrl };

    if (isAllowedSiteUrl(parsed)) return { status: "site", embedUrl: originUrl, originUrl };
  }

  const fallback = safeParseUrl(urls[0]);
  return {
    status: "unsupported",
    embedUrl: null,
    originUrl: fallback ? fallback.toString() : null,
  };
}

export function isZenSupported(resource) {
  return toZenModel(resource).status !== "unsupported";
}

// Display-only host for Zen panels (e.g. "developer.mozilla.org").
// Returns null for anything unsafe or unparseable so the UI never renders
// a raw or javascript: string.
export function zenHostOf(url) {
  const parsed = safeParseUrl(url);
  if (!parsed) return null;
  if (hasCredentials(parsed) || hasExplicitPort(parsed)) return null;
  return parsed.hostname.toLowerCase() || null;
}

// Intentional fallback copy for embedded-site unavailability. Browsers do
// not reliably expose cross-origin frame rejections (X-Frame-Options, CSP
// frame-ancestors), so this is worded as a possibility — never a diagnosis.
// Kept here (not in the component) so the fallback contract is unit-testable.
export function zenSiteFallback() {
  return {
    eyebrow: "Unavailable inline",
    title: "This site won't load inside Zen Mode",
    body: "Some sites refuse to load inside other pages, and a slow connection looks exactly the same from here — Zen Mode can't tell the difference, and it never bypasses a site's embedding rules. Opening externally always works.",
  };
}

// Copy for the one remaining Zen outcome: a resource Zen cannot host at all
// (an ordinary https page, an unsafe/unparseable link, or no link at all).
// Before this existed the "unsupported" branch rendered nothing, which is the
// reported blank-stage defect — an overlay with a title bar and an empty
// rectangle under it. `hasLink` decides which of the two honest endings it is:
// a working "Open externally" action, or the "no destination attached" state.
export function zenUnsupportedFallback(hasLink) {
  return hasLink
    ? {
        eyebrow: "No preview",
        title: "Zen Mode can’t show this one inline",
        body: "Zen Mode only frames material it can verify — videos, a short allow-list of documentation sites, and PDFs. This one isn’t any of those, so there’s nothing honest to render here rather than a frame that would only look broken.",
        linkLabel: "Open externally",
      }
    : {
        eyebrow: "Unavailable",
        title: "No link attached to this resource yet",
        body: "Mentors add destinations as the track matures. Until one is attached there’s nothing to open — pick another piece of material, or keep walking the roadmap.",
        linkLabel: null,
      };
}

// What the learner was about to study, for the panels that can't show the
// material itself. Never fabricated: the resource's own summary wins when the
// catalogue carries one, otherwise the roadmap node's description is used and
// labeled as such. Returns null when neither exists, so the UI shows nothing
// rather than inventing text.
export function zenLearningSummary(resource, node) {
  const own = typeof resource?.description === "string" ? resource.description.trim() : "";
  if (own) return { text: own, source: null };

  const nodeText = typeof node?.description === "string" ? node.description.trim() : "";
  if (nodeText) {
    const title = typeof node?.title === "string" ? node.title.trim() : "";
    return { text: nodeText, source: title ? `Roadmap node · ${title}` : "Roadmap node" };
  }
  return null;
}

// Real, stored facts about the resource — never a guess. Used by the fallback
// panels so they read as an informed hand-off rather than an empty screen.
export function zenResourceFacts(resource) {
  const facts = [];
  if (typeof resource?.kind === "string" && resource.kind.trim()) facts.push(resource.kind.trim());
  if (typeof resource?.level === "string" && resource.level.trim()) facts.push(resource.level.trim());
  if (typeof resource?.minutes === "number" && resource.minutes > 0) facts.push(`≈ ${resource.minutes} min`);
  return facts;
}
