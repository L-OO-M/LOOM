"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import dagre from "dagre";

/* Roadmap map view, drawn in the visual language of the reference
   (roadmap.sh-style track map):
   - flat, crisp yellow topic cards on a solid blue track, pale-yellow leaf
     cards, blue chips for grouped paths, dashed note cards for labels;
   - status lives in the corner dot (green done -> purple you are here ->
     grey upcoming) instead of repainting the whole card;
   - every card is a real button to the real topic page, no placeholder
     nodes and no fabricated percentages.

   Layout is deterministic and centred: dagre ranks the graph, then every rank
   is centred on the same axis, so the map reads as one clean tree instead of
   drifting off to the right and forcing a horizontal crop. Card coordinates
   are translated into the SVG's coordinate space (they used to keep dagre's
   absolute x/y while the SVG used a negative viewBox origin, which offset the
   edges and clipped nodes at the left edge). */

const NODE_W = 208;
const NODE_H = 50;
const LABEL_W = 180;
const LABEL_H = 34;
const PAD_X = 56;
const PAD_Y = 32;
const H_GAP = 48;
const V_GAP = 104;

function sizeFor(node) {
  return node.kind === "label" ? { w: LABEL_W, h: LABEL_H } : { w: NODE_W, h: NODE_H };
}

function layout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: V_GAP, nodesep: H_GAP, edgesep: 24, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => {
    const { w, h } = sizeFor(n);
    g.setNode(n.id, { width: w, height: h });
  });
  edges.forEach((e) => g.setEdge(e.from_id, e.to_id));
  dagre.layout(g);

  const placed = nodes.map((n) => {
    const p = g.node(n.id);
    const { w, h } = sizeFor(n);
    return { ...n, x: p.x - w / 2, y: p.y - h / 2, w, h };
  });

  // Group by rank (dagre gives every node in a rank the same y), centre each
  // rank inside the widest rank, then add breathing room on all sides.
  const rows = new Map();
  for (const p of placed) {
    // Group by the card's centre, not its top-left: labels and cards have
    // different heights, so a shared rank would otherwise split in two.
    const key = Math.round(p.y + p.h / 2);
    const row = rows.get(key) ?? { minX: Infinity, maxX: -Infinity };
    row.minX = Math.min(row.minX, p.x);
    row.maxX = Math.max(row.maxX, p.x + p.w);
    rows.set(key, row);
  }
  const rowList = [...rows.values()];
  const widest = Math.max(1, ...rowList.map((r) => r.maxX - r.minX));
  const width = widest + PAD_X * 2;
  const height = Math.max(1, ...placed.map((p) => p.y + p.h)) + PAD_Y * 2;

  const positioned = placed.map((p) => {
    const row = rows.get(Math.round(p.y + p.h / 2));
    const rowW = row.maxX - row.minX;
    return {
      ...p,
      x: p.x - row.minX + PAD_X + (widest - rowW) / 2,
      y: p.y + PAD_Y
    };
  });

  return { positioned, width, height };
}

const DOT = {
  done: { bg: "#16a34a", fg: "#fff", glyph: "✓", label: "completed" },
  now: { bg: "#7c3aed", fg: "#fff", glyph: "", label: "you are here" },
  todo: { bg: "#9ca3af", fg: "#fff", glyph: "", label: "upcoming" }
};

function NodeCard({ data, state, isSpine, kind, onClick }) {
  if (kind === "label") {
    return (
      <div
        className="px-3 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{
          background: "transparent",
          border: "1.5px dashed #94a3b8",
          borderRadius: 7,
          color: "#475569",
          width: LABEL_W,
          minHeight: LABEL_H
        }}
      >
        {data.title}
      </div>
    );
  }

  if (kind === "group") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={`${data.title} — ${DOT[state].label}`}
        className="rm-node-btn rm-node-group"
        style={{ width: NODE_W, minHeight: NODE_H }}
      >
        <span className="rm-node-title">{data.title}</span>
        <StatusDot state={state} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${data.title} — ${DOT[state].label}`}
      className={`rm-node-btn ${isSpine ? "rm-node-spine" : "rm-node-leaf"} ${state === "now" ? "is-now" : ""}`}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      <span className="rm-node-title">{data.title}</span>
      <StatusDot state={state} />
    </button>
  );
}

function StatusDot({ state }) {
  const d = DOT[state];
  return (
    <span
      aria-hidden="true"
      className="rm-node-dot"
      style={{ background: d.bg, color: d.fg, fontSize: state === "done" ? 10 : 12 }}
    >
      {d.glyph}
    </span>
  );
}

function Legend() {
  const items = [
    { swatch: "#7c3aed", label: "You are here" },
    { swatch: "#16a34a", label: "Completed" },
    { swatch: "#9ca3af", label: "Upcoming" }
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="Map legend">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <span aria-hidden="true" className="inline-block size-3 rounded-full" style={{ background: it.swatch }} />
          {it.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <span aria-hidden="true" className="inline-block h-0 w-6 border-t-2" style={{ borderColor: "#2563eb" }} />
        required
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <span aria-hidden="true" className="inline-block h-0 w-6 border-t-2 border-dotted" style={{ borderColor: "#2563eb" }} />
        optional
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

  const { positioned, width, height } = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const edgePaths = useMemo(() => {
    const byId = new Map(positioned.map((p) => [p.id, p]));
    return edges
      .map((e) => {
        const a = byId.get(e.from_id);
        const b = byId.get(e.to_id);
        if (!a || !b) return null;

        // Backward or same-rank edges run side to side; forward edges drop
        // from the bottom of one card into the top of the next.
        if (b.y <= a.y + 2) {
          const x1 = a.x + a.w;
          const y1 = a.y + a.h / 2;
          const x2 = b.x;
          const y2 = b.y + b.h / 2;
          const dx = Math.max(28, Math.abs(x2 - x1) / 2);
          return {
            id: e.id || `${e.from_id}->${e.to_id}`,
            kind: e.kind,
            d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
          };
        }

        const x1 = a.x + a.w / 2;
        const y1 = a.y + a.h;
        const x2 = b.x + b.w / 2;
        const y2 = b.y;
        const dy = Math.max(28, (y2 - y1) / 2);
        return {
          id: e.id || `${e.from_id}->${e.to_id}`,
          kind: e.kind,
          d: `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`
        };
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

      <p className="meta mb-2 px-1 sm:hidden">Swipe the map sideways to explore.</p>

      {/* Contained horizontal scroll on narrow screens: the page itself never
          overflows; the track pans inside its own region instead. */}
      <div
        className="rm-graph-scroll w-full overflow-x-auto overscroll-x-contain pb-6"
        tabIndex={0}
        role="region"
        aria-label="Roadmap track — scroll sideways on small screens, activate a topic to open it"
      >
        <div className="relative mx-auto" style={{ width: Math.max(width, 320), height }}>
          <svg
            className="pointer-events-none absolute inset-0"
            width={Math.max(width, 320)}
            height={height}
            viewBox={`0 0 ${Math.max(width, 320)} ${height}`}
            aria-hidden="true"
          >
            {edgePaths.map((e) => (
              <path
                key={e.id}
                d={e.d}
                fill="none"
                stroke={e.kind === "alternative" ? "#d97706" : "#2563eb"}
                strokeWidth={e.kind === "required" ? 2.2 : 1.8}
                strokeDasharray={e.kind === "required" ? undefined : e.kind === "alternative" ? "7 6" : "1.5 7"}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.9}
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
                  data={{ title: n.title }}
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
        .rm-graph-scroll { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
        .rm-node-btn {
          position: relative;
          display: grid;
          place-items: center;
          padding: 9px 26px 9px 12px;
          border: 1.5px solid #1c1917;
          border-radius: 7px;
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.28;
          text-align: center;
          color: #1c1917;
          overflow-wrap: anywhere;
          cursor: pointer;
          transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
        }
        .rm-node-leaf { background: #fef3c7; }
        .rm-node-spine { background: #fde047; }
        .rm-node-group {
          background: #2563eb;
          border-color: #1e40af;
          color: #fff;
        }
        .rm-node-btn.is-now {
          border-color: #b45309;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.30);
        }
        .rm-node-btn:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0, 0, 0, 0.12); }
        .rm-node-btn:active { transform: scale(0.985); }
        .rm-node-title { display: block; }
        .rm-node-dot {
          position: absolute;
          right: -8px;
          top: 50%;
          transform: translateY(-50%);
          display: grid;
          place-items: center;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid #fff;
          font-weight: 800;
          line-height: 1;
        }
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
