"use client";

import { useState } from "react";
import RoadmapGraph from "./RoadmapGraph";
import { RoadmapJourney } from "./RoadmapJourney";

export default function RoadmapTabs({ nodes, edges, doneIds, nextId, resourcesByDomain, resourceDoneIds, projectsByNode }) {
  const [view, setView] = useState("graph");
  // Only graph nodes participate in canvas — old linear nodes stay in list only to avoid disconnected clutter
  const graphNodes = nodes.filter((n) => n.id.startsWith("rm_"));
  const graphEdges = edges.filter((e) => graphNodes.some((n) => n.id === e.from_id) && graphNodes.some((n) => n.id === e.to_id));
  const useGraphNodes = graphNodes.length > 0 ? graphNodes : nodes;
  const useGraphEdges = graphNodes.length > 0 ? graphEdges : edges;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <div className="seg">
          <button onClick={() => setView("graph")} aria-pressed={view === "graph"} className={view === "graph" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"} style={view !== "graph" ? { color: "var(--text-muted)" } : undefined}>
            Graph
          </button>
          <button onClick={() => setView("list")} aria-pressed={view === "list"} className={view === "list" ? "!bg-[var(--text)] !text-[var(--bg)] rounded-full px-4 py-1.5 text-sm font-semibold" : "rounded-full px-4 py-1.5 text-sm font-semibold"} style={view !== "list" ? { color: "var(--text-muted)" } : undefined}>
            List
          </button>
        </div>
        <span className="meta hidden sm:inline">Graph is the map · List is the detail</span>
        <span className="ml-auto hidden items-center gap-3 sm:flex">
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}><span className="size-3 rounded border" style={{ background: "#fef08a", borderColor: "#eab308" }} /> recommended</span>
          <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}><span className="size-3 rounded border" style={{ background: "#fef9c3", borderColor: "#fde68a" }} /> topic</span>
        </span>
      </div>

      {view === "graph" ? (
        <div className="rounded-none border-y" style={{ borderColor: "var(--line)", background: "var(--bg)", marginInline: "-1rem" }}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2">
            <p className="meta text-center">Drag to pan · scroll to zoom · click node to open detail</p>
          </div>
          <RoadmapGraph nodes={useGraphNodes} edges={useGraphEdges} doneIds={doneIds} nextId={nextId} />
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-0 sm:px-0">
          <RoadmapJourney nodes={nodes} doneIds={doneIds} nextId={nextId} resourcesByDomain={resourcesByDomain} resourceDoneIds={resourceDoneIds} projectsByNode={projectsByNode} />
        </div>
      )}
    </div>
  );
}
