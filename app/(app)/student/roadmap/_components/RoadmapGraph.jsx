"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import dagre from "dagre";

function layout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 90, nodesep: 48 });
  g.setDefaultEdgeLabel(() => ({}));
  // Node size matches visible card (sized for readability, no zoom needed)
  nodes.forEach((n) => {
    const w = n.kind === "label" ? 160 : 200;
    const h = n.kind === "label" ? 36 : 72;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.from_id, e.to_id));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    const w = n.kind === "label" ? 160 : 200;
    const h = n.kind === "label" ? 36 : 72;
    return { ...n, x: p.x - w / 2, y: p.y - h / 2, w, h };
  });
}

function NodeCard({ data, isDone, isNext, isHighlighted, kind, onClick }) {
  if (kind === "label") {
    return (
      <div className="text-[11px] font-semibold tracking-widest uppercase px-3 py-2 rounded border border-dashed text-center" style={{ background: "white", borderColor: "var(--line)", color: "var(--text-muted)", minWidth: 160 }}>
        {data.title}
      </div>
    );
  }
  if (kind === "group") {
    return (
      <div className="rounded-xl border-2 border-dashed px-4 py-3 text-center text-xs font-semibold" style={{ background: "rgba(255,255,255,0.9)", borderColor: "var(--line)", color: "var(--text)", minWidth: 160 }}>
        {data.title}
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      className={`text-center transition hover:scale-[1.02] active:scale-[0.98] ${isDone ? "is-done" : ""} ${isNext ? "is-now halo" : ""}`}
      style={{
        background: isHighlighted ? "#fef08a" : isDone ? "#dcfce7" : "#fef9c3",
        border: `2px solid ${isHighlighted ? "#eab308" : isDone ? "#16a34a" : "#fde68a"}`,
        color: "#1a1a1a",
        width: 200,
        minHeight: 68,
        borderRadius: 14,
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.35,
        fontWeight: 600,
        boxShadow: isHighlighted ? "0 3px 12px rgba(234,179,8,0.28)" : "0 1px 4px rgba(0,0,0,0.08)",
        cursor: "pointer",
      }}
    >
      <span className="block truncate">{data.title}</span>
      {isDone && <span className="block text-[11px] font-bold mt-1" style={{ color: "#16a34a" }}>✓ done</span>}
      {isNext && !isDone && <span className="block text-[11px] font-bold mt-1" style={{ color: "#a16207" }}>● you are here</span>}
      {!isDone && !isNext && <span className="block text-[10px] mt-1" style={{ color: "#78716c" }}>{data.domain || ""}</span>}
    </button>
  );
}

export default function RoadmapGraph({ nodes, edges: rawEdges, doneIds, nextId }) {
  const router = useRouter();
  const done = useMemo(() => new Set(doneIds), [doneIds]);

  const edges = useMemo(() => {
    if (rawEdges && rawEdges.length > 0) return rawEdges;
    const sorted = [...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return sorted.slice(0, -1).map((n, i) => ({ id: `${n.id}->${sorted[i + 1].id}`, from_id: n.id, to_id: sorted[i + 1].id, kind: "required" }));
  }, [nodes, rawEdges]);

  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);

  // Canvas bounds for SVG + container — page scrolls, no inner scroll/zoom
  const bounds = useMemo(() => {
    if (positioned.length === 0) return { minX: 0, minY: 0, w: 800, h: 600 };
    const xs = positioned.map((p) => p.x);
    const ys = positioned.map((p) => p.y);
    const ws = positioned.map((p) => p.w);
    const hs = positioned.map((p) => p.h);
    const minX = Math.min(...xs) - 40;
    const minY = Math.min(...ys) - 40;
    const maxX = Math.max(...xs.map((x, i) => x + ws[i])) + 40;
    const maxY = Math.max(...ys.map((y, i) => y + hs[i])) + 40;
    return { minX, minY, w: maxX - minX, h: maxY - minY };
  }, [positioned]);

  const edgePaths = useMemo(() => {
    const byId = new Map(positioned.map((p) => [p.id, p]));
    return edges
      .map((e) => {
        const a = byId.get(e.from_id);
        const b = byId.get(e.to_id);
        if (!a || !b) return null;
        const x1 = a.x + a.w / 2;
        const y1 = a.y + a.h;
        const x2 = b.x + b.w / 2;
        const y2 = b.y;
        const mx = (y1 + y2) / 2;
        // Smooth vertical bezier — clear distance visualizer
        const d = `M ${x1} ${y1} C ${x1} ${mx}, ${x2} ${mx}, ${x2} ${y2}`;
        return { id: e.id || `${e.from_id}->${e.to_id}`, d, kind: e.kind };
      })
      .filter(Boolean);
  }, [positioned, edges]);

  return (
    <div
      className="relative w-full overflow-visible"
      style={{ minHeight: bounds.h, background: "transparent" }}
      aria-label="Roadmap graph — page scrolls to explore, click a node to open detail"
    >
      {/* D3-style distance visualizer: SVG edges behind nodes */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={bounds.w}
        height={bounds.h}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
        style={{ overflow: "visible" }}
        aria-hidden="true"
      >
        <defs>
          <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
          </marker>
          <marker id="arrow-muted" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
          <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
          </marker>
        </defs>
        {edgePaths.map((e) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={e.kind === "optional" ? "#94a3b8" : e.kind === "alternative" ? "#f59e0b" : "#2563eb"}
            strokeWidth={e.kind === "required" ? 2.2 : 1.6}
            strokeDasharray={e.kind === "optional" ? "8 6" : e.kind === "alternative" ? "6 10" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd={e.kind === "optional" ? "url(#arrow-muted)" : e.kind === "alternative" ? "url(#arrow-amber)" : "url(#arrow-blue)"}
            opacity={0.95}
          />
        ))}
      </svg>

      {/* Nodes — sized for readability, no drag, page scrolls */}
      {positioned.map((n) => (
        <div
          key={n.id}
          className="absolute"
          style={{ left: n.x, top: n.y, width: n.w, height: n.h, display: "grid", placeItems: "center" }}
        >
          <NodeCard
            data={{ title: n.title, domain: n.domain, kind: n.kind }}
            isDone={done.has(n.id)}
            isNext={n.id === nextId}
            isHighlighted={n.is_highlighted}
            kind={n.kind}
            onClick={() => router.push(`/student/roadmap/${n.id}`)}
          />
        </div>
      ))}
    </div>
  );
}
