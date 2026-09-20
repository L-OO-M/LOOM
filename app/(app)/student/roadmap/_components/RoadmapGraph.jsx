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

function NodeCard({ data, isDone, isNext, isHighlighted }) {
  return (
    <div
      className={`loom-flow-node ${isDone ? "is-done" : ""} ${isNext ? "is-now halo" : ""}`}
      style={{
        background: isHighlighted ? "var(--accent)" : isDone ? "color-mix(in srgb, var(--accent) 18%, var(--bg-elevated))" : "var(--bg-elevated)",
        borderColor: isHighlighted || isNext ? "var(--accent)" : isDone ? "var(--accent)" : "var(--line)",
        color: isHighlighted ? "#101314" : "var(--text)",
        minWidth: 160,
        maxWidth: 200,
        textAlign: "center",
      }}
    >
      <div className="text-xs font-semibold truncate" style={{ color: isHighlighted ? "#101314" : isDone ? "var(--accent)" : "var(--text)" }}>{data.title}</div>
      {data.domain && <div className="meta mt-1" style={{ color: isHighlighted ? "#101314" : "var(--text-muted)", fontSize: 10 }}>{data.domain}</div>}
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
        data: { label: n.title, title: n.title, domain: n.domain },
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
      default: ({ data, id }) => <NodeCard data={data} isDone={done.has(id)} isNext={id === nextId} isHighlighted={nodes.find((n) => n.id === id)?.is_highlighted} />,
    }),
    [done, nextId, nodes]
  );

  // Re-map nodes to use custom type
  const typedNodes = useMemo(() => rfNodes.map((n) => ({ ...n, type: "default" })), [rfNodes]);

  return (
    <div style={{ width: "100%", height: 680, borderRadius: 16, border: "1px solid var(--line)", background: "var(--bg)", overflow: "hidden" }}>
      <ReactFlow
        nodes={typedNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background gap={16} size={1} color="var(--line)" />
        <Controls />
        <MiniMap pannable zoomable style={{ border: "1px solid var(--line)", background: "var(--bg-elevated)" }} />
      </ReactFlow>
    </div>
  );
}
