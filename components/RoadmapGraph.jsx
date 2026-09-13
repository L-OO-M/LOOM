"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ReactFlow, Background, Controls, Handle, Position, MarkerType
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { MarkCompleteButton } from "@/components/actions";

const NODE_W = 300;
const NODE_GAP = 150;

function LoomNode({ data, selected }) {
  const { index, title, domain, difficulty, state } = data;
  const done = state === "done";
  const next = state === "next";
  const diffColor = difficulty === "advanced" ? "var(--accent)" : difficulty === "intermediate" ? "var(--text)" : "var(--text-muted)";
  return (
    <div
      className="loom-flow-node"
      style={{
        width: NODE_W,
        borderColor: done ? "var(--accent)" : next || selected ? "var(--text)" : "var(--line)",
        background: done ? "color-mix(in srgb, var(--accent) 9%, var(--bg-elevated))" : "var(--bg-elevated)",
        boxShadow: next ? "0 0 0 1px var(--accent), 0 18px 50px rgba(0,0,0,0.25)" : "0 12px 34px rgba(0,0,0,0.18)"
      }}
    >
      <Handle type="target" position={Position.Top} className="loom-handle" />
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold"
          style={done
            ? { background: "var(--text)", color: "var(--bg)" }
            : next
              ? { background: "var(--accent)", color: "#101314" }
              : { background: "var(--bg-muted)", color: "var(--text-muted)" }}
        >
          {done ? "✓" : index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</span>
          <span className="mt-0.5 block text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
            {domain}{difficulty ? <span style={{ color: diffColor }}> · {difficulty}</span> : null}
          </span>
        </span>
        {next && !done && (
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--accent)", color: "#101314" }}>
            Up next
          </span>
        )}
        {done && (
          <span className="shrink-0 text-[11px] font-semibold" style={{ color: "var(--accent)" }}>Done</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="loom-handle" />
    </div>
  );
}

const nodeTypes = { loom: LoomNode };

export function RoadmapGraph({ nodes, doneIds, nextId, resourcesByDomain }) {
  const done = useMemo(() => new Set(doneIds), [doneIds]);
  const [selectedId, setSelectedId] = useState(nextId);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const flowNodes = useMemo(
    () =>
      nodes.map((n, i) => ({
        id: n.id,
        type: "loom",
        position: { x: -NODE_W / 2, y: i * NODE_GAP },
        data: {
          index: i,
          title: n.title,
          domain: n.domain,
          difficulty: n.difficulty_level || null,
          state: done.has(n.id) ? "done" : n.id === nextId ? "next" : "todo"
        }
      })),
    [nodes, done, nextId]
  );

  const flowEdges = useMemo(
    () =>
      nodes.slice(1).map((n, i) => {
        const prev = nodes[i];
        const prevDone = done.has(prev.id);
        const leadsToNext = n.id === nextId;
        return {
          id: `${prev.id}->${n.id}`,
          source: prev.id,
          target: n.id,
          animated: !reduced && (prevDone || leadsToNext),
          style: { stroke: prevDone ? "var(--accent)" : "var(--line)", strokeWidth: prevDone || leadsToNext ? 2 : 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: prevDone ? "var(--accent)" : "var(--line)" }
        };
      }),
    [nodes, done, nextId, reduced]
  );

  const onNodeClick = useCallback((_e, node) => setSelectedId(node.id), []);

  const selected = nodes.find((n) => n.id === selectedId) ?? nodes.find((n) => n.id === nextId) ?? null;
  const selDone = selected ? done.has(selected.id) : false;
  const selIndex = selected ? nodes.findIndex((n) => n.id === selected.id) : -1;
  const prev = selIndex > 0 ? nodes[selIndex - 1] : null;
  const next = selIndex >= 0 && selIndex < nodes.length - 1 ? nodes[selIndex + 1] : null;
  const linked = selected ? resourcesByDomain[selected.domain] ?? [] : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", height: "68vh", minHeight: 480 }}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.5}
          maxZoom={1.5}
          zoomOnScroll={false}
          panOnScroll
          panOnDrag
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: false }}
        >
          <Background gap={28} size={1.5} bgColor="transparent" />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>

      <aside
        aria-label="Selected roadmap node"
        className="flex flex-col rounded-2xl border p-6"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", alignSelf: "start" }}
      >
        {selected ? (
          <>
            <p className="kicker">{selected.domain}{selected.difficulty_level ? ` · ${selected.difficulty_level}` : ""} · Node {selIndex + 1} of {nodes.length}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
              {selected.title}
            </h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              {selected.description}
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                style={selDone
                  ? { background: "var(--accent)", color: "#101314" }
                  : selected.id === nextId
                    ? { background: "var(--text)", color: "var(--bg)" }
                    : { background: "var(--bg-muted)", color: "var(--text-muted)" }}
              >
                {selDone ? "Completed" : selected.id === nextId ? "Up next" : "Upcoming"}
              </span>
            </div>
            <div className="mt-5">
              <MarkCompleteButton nodeId={selected.id} completed={selDone} />
            </div>
            <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                Linked resources ({linked.length})
              </p>
              <div className="mt-2 space-y-1.5">
                {linked.map((r) => (
                  <Link key={r.id} href={`/student/resources/${r.id}`} className="block truncate text-sm hover:underline" style={{ color: "var(--accent)" }}>
                    {r.title} · {r.minutes} min
                  </Link>
                ))}
                {linked.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No linked resources yet.</p>}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              {prev ? (
                <button onClick={() => setSelectedId(prev.id)} className="text-xs font-semibold hover:underline" style={{ color: "var(--text)" }}>
                  ← {prev.title}
                </button>
              ) : <span />}
              {next ? (
                <button onClick={() => setSelectedId(next.id)} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                  {next.title} →
                </button>
              ) : <span />}
            </div>
            <Link href={`/student/roadmap/${selected.id}`} className="mt-3 text-center text-xs hover:underline" style={{ color: "var(--text-muted)" }}>
              Open full detail page
            </Link>
          </>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Select a node in the graph to see its detail.</p>
        )}
      </aside>
    </div>
  );
}
