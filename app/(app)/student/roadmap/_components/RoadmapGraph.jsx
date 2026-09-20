"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";

function layout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach((n) => g.setNode(n.id, { width: 180, height: 64 }));
  edges.forEach((e) => g.setEdge(e.from_id, e.to_id));
  dagre.layout(g);
  return nodes.map((n) => {
    const p = g.node(n.id);
    return { ...n, x: p.x - 90, y: p.y - 32 };
  });
}

function NodeCard({ data, isDone, isNext, isHighlighted, kind }) {
  if (kind === "label") {
    return (
      <div className="text-[11px] font-semibold tracking-widest uppercase px-3 py-2 rounded border border-dashed" style={{ background: "white", borderColor: "var(--line)", color: "var(--text-muted)" }}>
        {data.title}
      </div>
    );
  }
  if (kind === "group") {
    return (
      <div className="rounded-xl border-2 border-dashed px-4 py-3 text-center text-xs font-semibold" style={{ background: "rgba(255,255,255,0.9)", borderColor: "var(--line)", color: "var(--text)" }}>
        {data.title}
      </div>
    );
  }
  return (
    <div
      className={`loom-flow-node ${isDone ? "is-done" : ""} ${isNext ? "is-now halo" : ""}`}
      style={{
        background: isHighlighted ? "#fef08a" : isDone ? "#dcfce7" : "#fef9c3",
        borderColor: isHighlighted ? "#eab308" : isDone ? "#16a34a" : "#fde68a",
        color: "#1a1a1a",
        minWidth: 150,
        maxWidth: 190,
        textAlign: "center",
        fontSize: 11,
        lineHeight: 1.3,
        padding: "8px 10px",
        boxShadow: isHighlighted ? "0 2px 8px rgba(234,179,8,0.25)" : "0 1px 3px rgba(0,0,0,0.08)",
      }}
    >
      <div className="font-semibold truncate" style={{ color: "#1a1a1a" }}>{data.title}</div>
      {isDone && <div className="text-[10px] font-bold mt-1" style={{ color: "#16a34a" }}>✓ done</div>}
      {isNext && !isDone && <div className="text-[10px] font-bold mt-1" style={{ color: "#eab308" }}>● you are here</div>}
    </div>
  );
}

export default function RoadmapGraph({ nodes, edges: rawEdges, doneIds, nextId }) {
  const router = useRouter();
  const done = useMemo(() => new Set(doneIds), [doneIds]);

  const edges = useMemo(() => {
    if (rawEdges && rawEdges.length > 0) return rawEdges;
    // fallback linear DAG from sort_order
    const sorted = [...nodes].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return sorted.slice(0, -1).map((n, i) => ({ id: `${n.id}->${sorted[i + 1].id}`, from_id: n.id, to_id: sorted[i + 1].id, kind: "required" }));
  }, [nodes, rawEdges]);

  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);

  const flowNodes = useMemo(
    () =>
      positioned.map((n) => ({
        id: n.id,
        position: { x: n.x, y: n.y },
        data: { label: n.title, title: n.title, domain: n.domain, kind: n.kind },
        style: { background: "transparent", border: "none", padding: 0 },
      })),
    [positioned]
  );

  const flowEdges = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id || `${e.from_id}->${e.to_id}`,
        source: e.from_id,
        target: e.to_id,
        animated: e.kind === "optional",
        style: {
          stroke: e.kind === "optional" ? "var(--text-muted)" : "var(--accent)",
          strokeWidth: 1.5,
          strokeDasharray: e.kind === "optional" ? "6 6" : e.kind === "alternative" ? "2 6" : undefined,
        },
        label: e.label || undefined,
      })),
    [edges]
  );

  const [rfNodes, , onNodesChange] = useNodesState(flowNodes);
  const [rfEdges, , onEdgesChange] = useEdgesState(flowEdges);

  const onNodeClick = useCallback(
    (_, node) => {
      router.push(`/student/roadmap/${node.id}`);
    },
    [router]
  );

  // Custom node rendering via nodeTypes
  const nodeTypes = useMemo(
    () => ({
      default: ({ data, id }) => {
        const raw = nodes.find((n) => n.id === id);
        return <NodeCard data={data} isDone={done.has(id)} isNext={id === nextId} isHighlighted={raw?.is_highlighted} kind={raw?.kind} />;
      },
    }),
    [done, nextId, nodes]
  );

  // Re-map nodes to use custom type
  const typedNodes = useMemo(() => rfNodes.map((n) => ({ ...n, type: "default" })), [rfNodes]);

  return (
    <div style={{ width: "100%", height: 740, borderRadius: 16, border: "1px solid var(--line)", background: "#ffffff", overflow: "hidden" }}>
      <ReactFlow
        nodes={typedNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} size={1} color="#e5e7eb" />
        <Controls />
        <MiniMap pannable zoomable style={{ border: "1px solid #e5e7eb", background: "white" }} />
      </ReactFlow>
    </div>
  );
}
