"use client";

import { useState } from "react";
import { domainLabel } from "@/lib/domains";
import RoadmapGraph from "./RoadmapGraph";
import { RoadmapJourney } from "./RoadmapJourney";
import { RoadmapDomainRail } from "./RoadmapDomainRail";

export default function RoadmapTabs({
  domain,
  domains,
  nodes,
  edges,
  doneIds,
  nextId,
  resourcesByNode,
  resourceDoneIds,
  projectsByNode,
  zenEnabled = false,
}) {
  const [view, setView] = useState("graph");
  const total = nodes.length;
  const doneCount = nodes.filter((n) => doneIds.includes(n.id)).length;
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="pt-2">
        <p className="meta">
          Roadmap · {domainLabel(domain)} · {doneCount} of {total} complete
        </p>
      </div>

      <RoadmapDomainRail domains={domains} active={domain} />

      {nodes.length === 0 ? (
        <p className="narrative mt-6">No topics published for {domainLabel(domain)} yet.</p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <div className="seg">
              <button
                onClick={() => setView("graph")}
                aria-pressed={view === "graph"}
                className={view === "graph" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
                style={view !== "graph" ? { color: "var(--text-muted)" } : undefined}
              >
                Map
              </button>
              <button
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={view === "list" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"}
                style={view !== "list" ? { color: "var(--text-muted)" } : undefined}
              >
                Path
              </button>
            </div>
            <span className="meta hidden sm:inline">{percent}% of this track</span>
            <span className="ml-auto hidden items-center gap-3 sm:flex">
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                <span aria-hidden="true" className="grid size-3 place-items-center rounded-full text-[8px] font-bold" style={{ background: "#7c3aed", color: "#fff" }}>●</span>
                you are here
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                <span aria-hidden="true" className="grid size-3 place-items-center rounded-full text-[8px] font-bold" style={{ background: "#16a34a", color: "#fff" }}>✓</span>
                completed
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                <span aria-hidden="true" className="grid size-3 place-items-center rounded-full text-[8px] font-bold" style={{ background: "#9ca3af", color: "#fff" }}>○</span>
                upcoming
              </span>
            </span>
          </div>

          {view === "graph" ? (
            <div className="rounded-none border-y" style={{ borderColor: "var(--line)", background: "var(--bg)", marginInline: "-1rem" }}>
              <RoadmapGraph nodes={nodes} edges={edges} doneIds={doneIds} nextId={nextId} />
            </div>
          ) : (
            <div className="mx-auto max-w-6xl px-0 sm:px-0">
              <RoadmapJourney
                nodes={nodes}
                doneIds={doneIds}
                nextId={nextId}
                domain={domain}
                resourcesByNode={resourcesByNode}
                resourceDoneIds={resourceDoneIds}
                projectsByNode={projectsByNode}
                zenEnabled={zenEnabled}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}