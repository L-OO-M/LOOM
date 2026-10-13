// Canonical resource destination for the Student Learn experience.
//
// Primary flow is: click a resource → open the actual destination directly.
// The `/student/resources/[id]` detail page stays alive for bookmarks, progress
// metadata, and the completion control — but it is no longer the target of any
// primary "Open" action. Every opener below resolves through getResourceHref()
// so Roadmap, Resources, and topic pages behave identically.
export function isExternalUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

export function isInternalPath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//");
}

export function hasUsableUrl(resource) {
  return (
    !!resource &&
    typeof resource.url === "string" &&
    resource.url.trim().length > 0
  );
}

// Canonical destination for a resource row, or null when there is no safe
// destination (missing URL, bare word, javascript: pseudo-URL, ...). External
// http(s) URLs and internal absolute paths pass through untouched. A bare
// "docs.example.com/guide" host is upgraded to https rather than treated as a
// site-relative path. Anything else is rejected so callers can render an
// honest unavailable state instead of navigating somewhere broken.
export function getResourceHref(resource) {
  if (!hasUsableUrl(resource)) return null;
  const url = resource.url.trim();
  if (isExternalUrl(url) || isInternalPath(url)) return url;
  if (/^(?!javascript:|data:|vbscript:)[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(url)) {
    return `https://${url}`;
  }
  return null;
}

export function isExternalResource(resource) {
  return isExternalUrl(getResourceHref(resource) || "");
}

// Props for the primary "open the actual thing" anchor. External destinations
// open in a new tab with safe rel attributes; internal LOOM pages use normal
// client-side navigation in the same tab.
export function openPropsFor(resource) {
  const href = getResourceHref(resource);
  if (!href) return null;
  if (isExternalUrl(href)) {
    return { href, target: "_blank", rel: "noopener noreferrer" };
  }
  return { href };
}

export function detailHrefFor(resource) {
  return `/student/resources/${resource.id}`;
}
