"use client";

import { getResourceHref, isExternalUrl } from "@/lib/resource-link";
import { toZenModel } from "@/lib/zen-embed";

/* Single decision path for every "a resource sits here" link in the product.
   Root cause of the reported routing bug: each surface used to re-derive the
   destination, the icon and the label on its own, so the roadmap overview card
   kept opening externally while the node drawer opened Zen Mode for the very
   same row. One model now decides — href, and the marker/label that must match
   that decision. The icon never influences the destination; it only reports it.

   Click routing is Zen-FIRST while the feature is enabled. Zen Mode owns the
   classification decision, so it must see every resource: gating the overlay on
   "Zen can embed this" sent ~95% of the catalogue straight to a new tab (only
   a 13-host allowlist and YouTube qualified), which is why most clicks bypassed
   Zen entirely. With Zen Mode ON, any row with a validated destination opens
   Zen, and Zen renders either the embed or the launch panel. With Zen Mode OFF
   (the default, see lib/feature-flags.js) the row is an ordinary native link —
   exactly the experience that existed before the overlay. */

const ZEN_HINT = "· Zen";

/** Pure row model: what this resource resolves to, and how it must be labeled. */
export function zenRowModel(resource) {
  const direct = getResourceHref(resource);
  const external = direct ? isExternalUrl(direct) : null;
  // Zen can host the row itself when it has a validated destination. What Zen
  // can do *inside* the overlay (iframe vs launch panel) is the classifier's
  // job, not a reason to skip the overlay.
  const zen = direct ? toZenModel(resource) : null;
  const zenSupported = !!zen;
  const title = resource?.title || "this resource";
  return {
    direct,
    external: !!external,
    zen,
    zenSupported,
    // Rows that will open in Zen Mode never promise a new tab; rows that will
    // navigate natively say so.
    ariaLabel: zenSupported ? `Open ${title} in Zen Mode` : `Open ${title}${external ? " in a new tab" : ""}`,
    ariaLabelNative: `Open ${title}${external ? " in a new tab" : ""}`,
    // Marker mirrors the decision: Zen rows are labelled "· Zen", genuinely
    // external native rows keep "↗", internal rows show nothing.
    hint: zenSupported ? ZEN_HINT : external ? "↗" : "",
  };
}

/** True when a plain click should be intercepted for Zen instead of navigating. */
export function isPrimaryActivation(event) {
  if (!event) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;
  return true;
}

/**
 * Anchor for one resource row. Primary activation opens Zen when the surface
 * mounted an overlay AND the Zen Mode flag is on; modifier/middle clicks stay
 * native so new-tab habits keep working.
 *
 * `zenEnabled` defaults to FALSE, so the flag gates the behaviour rather than
 * the button: with the flag off, the row is an ordinary native link (exactly
 * the experience before Zen existed) and no overlay can be opened from here,
 * whichever surface renders it.
 *
 * `onZen(resource, embed, nodeId)` — nodeId lets a surface that shows rows for
 * many nodes keep prev/next scoped to the row's own node instead of whatever
 * node happens to be selected.
 */
export function ZenResourceLink({ resource, onZen, zenEnabled = false, nodeId, className, style, title, trailing, children }) {
  const row = zenRowModel(resource);
  const zenActive = zenEnabled && row.zenSupported && typeof onZen === "function";
  // Without a mounted overlay, or with the flag off, the row navigates natively
  // and the marker must say so instead of promising Zen.
  const hint = zenActive ? row.hint : row.external ? "↗" : "";
  const trailingWithHint =
    trailing ?? (hint ? <span className="sr-only"> {hint}</span> : null);

  return (
    <a
      href={row.direct}
      {...(row.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={className}
      style={style}
      title={title}
      aria-label={zenActive ? row.ariaLabel : row.ariaLabelNative}
      {...(zenActive
        ? {
            onClick: (e) => {
              if (!isPrimaryActivation(e)) return;
              e.preventDefault();
              onZen(resource, row.zen, nodeId);
            },
          }
        : {})}
    >
      {children}
      {trailingWithHint}
    </a>
  );
}