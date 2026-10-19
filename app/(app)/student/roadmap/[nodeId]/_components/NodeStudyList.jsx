"use client";

import { useState } from "react";
import { getResourceHref } from "@/lib/resource-link";
import { toZenModel } from "@/lib/zen-embed";
import { ZenMode } from "@/components/loom/ZenMode";
import { ZenResourceLink, zenRowModel } from "@/components/loom/ZenResourceLink";

/* "Study this" list for the roadmap node detail page. Server-rendered page
   passes serializable resource rows; this is the smallest client leaf that
   can intercept a click. Row markup, classes, and labels come from the shared
   ZenResourceLink decision path (components/loom/ZenResourceLink.jsx) so this
   list, the journey drawer and the roadmap overview can never disagree about
   where a given resource opens. */

/* Re-exported under its historical name: this list's tested row contract. */
export { zenRowModel as studyRowModel };

export function NodeStudyList({ resources, node, zenEnabled = false }) {
  // { resource, embed } or null. Clearing it unmounts the overlay; the
  // route never changes, so drawer/filters/scroll are inherently intact.
  const [zenSelection, setZenSelection] = useState(null);
  const list = resources || [];

  // Zen navigation walks every row that has a destination, in the order shown.
  // Filtering on "Zen can embed this" would skip most of a node's shelf, so the
  // learner would jump from row 1 to row 4 with no explanation.
  const navItems = list
    .map((r) => ({ resource: r, embed: toZenModel(r) }))
    .filter((x) => !!getResourceHref(x.resource));

  const stepZen = (delta) =>
    setZenSelection((cur) => {
      if (!cur) return cur;
      const next = navItems[cur.index + delta];
      return next ? { resource: next.resource, embed: next.embed, index: cur.index + delta } : cur;
    });

  // Defence in depth: even if something managed to call this, the flag decides.
  const openZen = (resource, embed) => {
    if (!zenEnabled) return;
    const index = navItems.findIndex((x) => x.resource.id === resource.id);
    setZenSelection({ resource, embed, index: index >= 0 ? index : 0 });
  };

  return (
    <>
      <ol className="mt-4 divide-y" style={{ borderColor: "var(--line)" }}>
        {list.map((r, i) => {
          const direct = getResourceHref(r);
          const row = zenRowModel(r);
          return (
            <li key={r.id} className="flex items-baseline gap-4 py-4">
              <span className="index-num w-6 shrink-0">{String(i + 1).padStart(2, "0")}</span>
              {direct ? (
                <ZenResourceLink
                  resource={r}
                  onZen={openZen}
                  zenEnabled={zenEnabled}
                  className="min-w-0 flex-1 truncate text-[0.95rem] font-medium hover:underline"
                  style={{ color: "var(--text)" }}
                  trailing={row.hint ? <span className="sr-only"> {row.hint}</span> : null}
                >
                  {r.title}
                </ZenResourceLink>
              ) : (
                <span
                  className="min-w-0 flex-1 truncate text-[0.95rem] font-medium opacity-60"
                  style={{ color: "var(--text)" }}
                  role="note"
                  title="Mentors haven't attached a destination to this piece yet"
                >
                  {r.title} · unavailable
                </span>
              )}
              <span className="meta shrink-0">{r.minutes} min</span>
            </li>
          );
        })}
        {list.length === 0 && (
          <li className="py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No linked material yet — mentors add it as the track matures.
          </li>
        )}
      </ol>

      {zenEnabled && zenSelection ? (
        <ZenMode
          zenEnabled
          resource={zenSelection.resource}
          embed={zenSelection.embed}
          node={node}
          onClose={() => setZenSelection(null)}
          onPrev={() => stepZen(-1)}
          onNext={() => stepZen(1)}
          position={{ index: zenSelection.index, total: navItems.length }}
        />
      ) : null}
    </>
  );
}
