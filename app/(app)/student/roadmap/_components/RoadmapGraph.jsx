"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import dagre from "dagre";

/* Roadmap map view, drawn in the visual language of the reference
   (roadmap.sh-style track map):
   - bright-yellow spine stops on a solid blue track, cream branch cards
     fanning off on dotted blue connectors, blue chips for grouped paths,
     dashed note cards for labels;
   - status lives in the corner dot (green ✓ done · purple ● you are here ·
     grey ○ upcoming) instead of repainting the whole card, so progress stays
     readable without breaking the track's shape;
   - every card is a real button to the real topic page — no placeholder
     nodes, no fabricated percentages. Sticky-note cards stay light in both
     LOOM themes (as in the reference) while chrome uses theme tokens. */

const CARD_W = 196;
const CARD_H = 64;
const LABEL_W = 176;
const LABEL_H = 40;

function layout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 84, nodesep: 36 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => {
    const w = n.kind === "label" ? LABEL_W : CARD_W;
    const h = n.kind === "label" ? LABEL_H : CARD_H;
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.from_id, e.to_id));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    const w = n.kind === "label" ? LABEL_W : CARD_W;
    const h = n.kind === "label" ? LABEL_H : CARD_H;
    return { ...n, x: p.x - w / 2, y: p.y - h / 2, w, h };
  });
}

const DOT = {
  done: { bg: "#16a34a", fg: "#fff", glyph: "✓", label: "completed" },
  now: { bg: "#7c3aed", fg: "#fff", glyph: "●", label: "you are here" },
  todo: { bg: "#9ca3af", fg: "#fff", glyph: "○", label: "upcoming" },
};

function NodeCard({ data, state, isSpine, kind, onClick }) {
  if (kind === "label") {
    return (
      <div
        className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{
          background: "#f1f5f9",
          border: "1.5px dashed #94a3b8",
          borderRadius: 8,
          color: "#64748b",
          minWidth: LABEL_W,
          maxWidth: LABEL_W,
        }}
      >
        {data.title}
      </div>
    );
  }
  if (kind === "group") {
    return (
      <button
        onClick={onClick}
        aria-label={`${data.title} — ${DOT[state].label}`}
        className="rm-node-btn text-center transition hover:brightness-110 active:scale-[0.98]"
        style={{
          background: "#2563eb",
          border: "1.5px solid #1e40af",
          color: "#fff",
          width: CARD_W,
          minHeight: CARD_H,
          borderRadius: 8,
          padding: "10px 26px 10px 12px",
          fontSize: 12.5,
          lineHeight: 1.35,
          fontWeight: 650,
          boxShadow: "0 1px 4px rgba(37,99,235,0.35)",
          cursor: "pointer",
          position: "relative",
        }}
      >
        <span className="block">{data.title}</span>
        <StatusDot state={state} />
      </button>
    );
  }
  const spine = isSpine;
  return (
    <button
      onClick={onClick}
      aria-label={`${data.title} — ${DOT[state].label}`}
      className="rm-node-btn text-center transition hover:scale-[1.02] active:scale-[0.98]"
      style={{
        background: spine ? "#fde047" : "#fef0c0",
        border: `1.5px solid ${state === "now" ? "#b45309" : "#1c1917"}`,
        color: "#1c1917",
        width: CARD_W,
        minHeight: CARD_H,
        borderRadius: 8,
        padding: "10px 26px 10px 12px",
        fontSize: 12.5,
        lineHeight: 1.35,
        fontWeight: 650,
        boxShadow:
          state === "now"
            ? "0 0 0 3px rgba(124,58,237,0.35), 0 3px 12px rgba(180,83,9,0.30)"
            : state === "done"
              ? "0 1px 4px rgba(0,0,0,0.10)"
              : "0 1px 4px rgba(0,0,0,0.08)",
        cursor: "pointer",
        position: "relative",
      }}
    >
      <span className="block">{data.title}</span>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: state === "done" ? "#15803d" : "#78716c" }}>
        {state === "done" ? "✓ done" : state === "now" ? "● you are here" : (data.domain || "").replace(/_/g, " ")}
      </span>
      <StatusDot state={state} />
    </button>
  );
}

function StatusDot({ state }) {
  const d = DOT[state];
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center"
      style={{
        position: "absolute",
        right: -9,
        top: "50%",
        transform: "translateY(-50%)",
        width: 20,
        height: 20,
        borderRadius: 999,
        background: d.bg,
        color: d.fg,
        fontSize: state === "done" ? 11 : 8,
        fontWeight: 800,
        border: "2px solid #fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }}
    >
      {d.glyph}
    </span>
  );
}

function Legend() {
  const items = [
    { swatch: "#7c3aed", label: "You are here" },
    { swatch: "#16a34a", label: "Completed" },
    { swatch: "#9ca3af", label: "Upcoming" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Map legend">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <span aria-hidden="true" className="grid size-4 place-items-center rounded-full text-[9px] font-bold" style={{ background: it.swatch, color: "#fff" }}>
            {it.label === "Completed" ? "✓" : "●"}
          </span>
          {it.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <span aria-hidden="true" className="inline-block h-0 w-6 border-t-2 border-dotted" style={{ borderColor: "#2563eb" }} />
        branch
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <span aria-hidden="true" className="inline-block h-0 w-6 border-t-2" style={{ borderColor: "#2563eb" }} />
        required
      </span>
    </div>
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

  // Spine stops are the junctions of the track (branch points, highlighted
  // or current) — they get the bright-yellow treatment from the reference.
  const spineIds = useMemo(() => {
    const degree = new Map();
    for (const e of edges) {
      degree.set(e.from_id, (degree.get(e.from_id) || 0) + 1);
      degree.set(e.to_id, (degree.get(e.to_id) || 0) + 1);
    }
    const spine = new Set();
    for (const n of nodes) {
      if (n.kind !== "label" && n.kind !== "group" && ((degree.get(n.id) || 0) >= 3 || n.is_highlighted || n.id === nextId)) {
        spine.add(n.id);
      }
    }
    return spine;
  }, [nodes, edges, nextId]);

  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const bounds = useMemo(() => {
    if (positioned.length === 0) return { minX: 0, minY: 0, w: 800, h: 600 };
    const xs = positioned.map((p) => p.x);
    const ys = positioned.map((p) => p.y);
    const ws = positioned.map((p) => p.w);
    const hs = positioned.map((p) => p.h);
    const minX = Math.min(...xs) - 48;
    const minY = Math.min(...ys) - 48;
    const maxX = Math.max(...xs.map((x, i) => x + ws[i])) + 48;
    const maxY = Math.max(...ys.map((y, i) => y + hs[i])) + 48;
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
        const d = `M ${x1} ${y1} C ${x1} ${mx}, ${x2} ${mx}, ${x2} ${y2}`;
        return { id: e.id || `${e.from_id}->${e.to_id}`, d, kind: e.kind };
      })
      .filter(Boolean);
  }, [positioned, edges]);

  const doneCount = nodes.filter((n) => done.has(n.id)).length;

  if (positioned.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3 pt-1">
        <p className="meta">
          {doneCount} of {nodes.length} complete
        </p>
        <Legend />
      </div>

      {/* Contained horizontal scroll on narrow screens: the page itself never
          overflows; the track pans inside its own region instead. */}
      <div className="w-full overflow-x-auto pb-6" tabIndex={0} role="region" aria-label="Roadmap track — scroll sideways on small screens, activate a topic to open it">
        <div className="relative mx-auto" style={{ width: Math.max(bounds.w, 680), minHeight: bounds.h }}>
          <svg
            className="absolute inset-0 pointer-events-none"
            width={Math.max(bounds.w, 680)}
            height={bounds.h}
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.w} ${bounds.h}`}
            style={{ overflow: "visible" }}
            aria-hidden="true"
          >
            <defs>
              <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
              </marker>
              <marker id="arrow-amber" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#d97706" />
              </marker>
            </defs>
            {edgePaths.map((e) => (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={e.kind === "alternative" ? "#d97706" : "#2563eb"}
                strokeWidth={e.kind === "required" ? 2.2 : 2.4}
                strokeDasharray={e.kind === "required" ? undefined : e.kind === "alternative" ? "7 6" : "1.5 7"}
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd={e.kind === "alternative" ? "url(#arrow-amber)" : "url(#arrow-blue)"}
                opacity={0.95}
              />
            ))}
          </svg>

          {positioned.map((n) => {
            const state = done.has(n.id) ? "done" : n.id === nextId ? "now" : "todo";
            return (
              <div
                key={n.id}
                className="absolute"
                style={{ left: n.x, top: n.y, width: n.w, height: n.h, display: "grid", placeItems: "center" }}
              >
                <NodeCard
                  data={{ title: n.title, domain: n.domain }}
                  state={state}
                  isSpine={spineIds.has(n.id)}
                  kind={n.kind}
                  onClick={() => router.push(`/student/roadmap/${n.id}`)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .rm-node-btn:focus-visible {
          outline: 3px solid var(--accent);
          outline-offset: 3px;
        }
        @media (prefers-reduced-motion: reduce) {
          .rm-node-btn { transition: none; }
        }
      `}</style>
    </div>
  );
}
