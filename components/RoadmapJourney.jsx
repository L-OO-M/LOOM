"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reveal } from "@/components/motion/Reveal";
import { Display, Meta } from "@/components/loom/primitives";
import { ProgressPath } from "@/components/loom/ProgressPath";
import { Drawer } from "@/components/loom/Drawer";
import { OnboardingState } from "@/components/loom/States";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const DOMAIN_LABEL = { ai_ml: "AI / ML", web: "Web Development", cybersecurity: "Cybersecurity", dsa: "DSA", blockchain: "Blockchain" };

/* The roadmap as a journey: chapters, a path, a you-are-here,
   and a drawer that treats each node as a small destination. */

export function RoadmapJourney({ nodes, doneIds, nextId, resourcesByDomain }) {
  const done = useMemo(() => new Set(doneIds), [doneIds]);
  const [selectedId, setSelectedId] = useState(nextId);
  const [justDone, setJustDone] = useState(null);

  const selected = nodes.find((n) => n.id === selectedId) ?? nodes.find((n) => n.id === nextId) ?? null;
  const selIndex = selected ? nodes.findIndex((n) => n.id === selected.id) : -1;

  if (nodes.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 sm:px-6">
        <OnboardingState
          eyebrow="Roadmap"
          title="Your path is being drawn."
          why="Your college hasn't published roadmap content yet. This is where your journey will live — node by node, with linked resources and proof at every step."
        />
      </main>
    );
  }

  const stops = nodes.map((n) => ({
    label: n.title,
    state: done.has(n.id) ? "done" : n.id === nextId ? "now" : "todo"
  }));
  const percent = Math.round((doneIds.length / nodes.length) * 100);

  let chapter = -1;
  let lastDomain = null;

  return (
    <main className="mx-auto max-w-4xl px-4 sm:px-6">
      <Reveal>
        <Meta>Roadmap · {doneIds.length} of {nodes.length} in place</Meta>
        <Display size="lg" className="mt-3">Walk the path.</Display>
        <div className="mt-8">
          <ProgressPath stops={stops} percent={percent} ariaLabel={`${percent} percent of roadmap complete`} />
        </div>
      </Reveal>

      <div className="mt-10">
        {nodes.map((n, i) => {
          const isDone = done.has(n.id);
          const isNext = n.id === nextId;
          const isSel = selected && n.id === selected.id;
          const fresh = justDone === n.id;
          if (n.domain !== lastDomain) { chapter += 1; lastDomain = n.domain; }
          const chapterHead = i === 0 || nodes[i - 1].domain !== n.domain;
          const dim = !isDone && !isNext && i > doneIds.length + 2;
          return (
            <div key={n.id}>
              {chapterHead && (
                <div className="mb-5 mt-10 flex items-baseline gap-4 first:mt-2">
                  <span className="index-num">{ROMAN[chapter] || chapter + 1}</span>
                  <h2 className="font-display text-xl font-medium" style={{ color: "var(--text)" }}>
                    {DOMAIN_LABEL[n.domain] || n.domain}
                  </h2>
                  <span className="rule-fade flex-1" aria-hidden="true" />
                </div>
              )}
              <button
                type="button"
                onClick={() => setSelectedId(n.id)}
                aria-current={isNext ? "step" : undefined}
                className={`tl-item w-full text-left ${isDone ? "is-done" : isNext ? "is-now line-illuminate" : ""} ${isSel ? "halo rounded-xl" : ""}`}
                style={{ opacity: dim ? 0.45 : 1 }}
              >
                <span className={`tl-dot ${fresh ? "node-pop" : ""}`} aria-hidden="true" />
                <span className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0">
                    <span className="block text-[1.02rem] font-semibold leading-6" style={{ color: "var(--text)" }}>
                      {isDone && <span style={{ color: "var(--accent)" }}>✓ </span>}{n.title}
                    </span>
                    <span className="meta mt-1 block">
                      Milestone {String(i + 1).padStart(2, "0")}
                      {n.difficulty_level ? ` · ${n.difficulty_level}` : ""}
                      {isNext ? " · you are here" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-lg" style={{ color: "var(--text-muted)" }} aria-hidden="true">›</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <NodeDrawer
        node={selected}
        index={selIndex}
        total={nodes.length}
        isDone={selected ? done.has(selected.id) : false}
        isNext={selected ? selected.id === nextId : false}
        linked={selected ? resourcesByDomain[selected.domain] ?? [] : []}
        nodes={nodes}
        nextId={nextId}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(nextId)}
        onCompleted={(id) => setJustDone(id)}
      />
    </main>
  );
}

function NodeDrawer({ node, index, total, isDone, isNext, linked, nodes, nextId, onSelect, onClose, onCompleted }) {
  const open = !!node;
  const prev = index > 0 ? nodes[index - 1] : null;
  const next = index >= 0 && index < nodes.length - 1 ? nodes[index + 1] : null;
  return (
    <Drawer open={open} onClose={onClose} label={node ? `${node.domain} · Node ${index + 1} of ${total}` : "Node"}>
      {node && (
        <>
          <p className="display display-md">{node.title}</p>
          <p className="meta mt-3">
            {isDone ? "Completed" : isNext ? "Up next" : "Upcoming"}
            {node.difficulty_level ? ` · ${node.difficulty_level}` : ""}
          </p>
          <p className="narrative mt-4" style={{ color: "var(--text)" }}>{node.description}</p>

          <div className="mt-6">
            <JourneyCompleteButton nodeId={node.id} completed={isDone} nextTitle={next?.title} onCompleted={onCompleted} />
          </div>

          <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--line)" }}>
            <Meta>Linked resources · {linked.length}</Meta>
            <ul className="mt-3 space-y-1">
              {linked.map((r) => (
                <li key={r.id}>
                  <Link href={`/student/resources/${r.id}`} className="row-link flex items-baseline justify-between gap-3 px-2 py-2">
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                    <span className="meta shrink-0">{r.minutes} min</span>
                  </Link>
                </li>
              ))}
              {linked.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No linked resources yet.</p>}
            </ul>
          </div>

          <div className="mt-6 flex items-center justify-between gap-2 border-t pt-5" style={{ borderColor: "var(--line)" }}>
            {prev ? (
              <button onClick={() => onSelect(prev.id)} className="text-xs font-semibold hover:underline" style={{ color: "var(--text)" }}>
                ← {prev.title}
              </button>
            ) : <span />}
            {next ? (
              <button onClick={() => onSelect(next.id)} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                {next.title} →
              </button>
            ) : <span />}
          </div>
          <div className="mt-4 text-center">
            <Link href={`/student/roadmap/${node.id}`} className="text-xs hover:underline" style={{ color: "var(--text-muted)" }}>
              Open full detail page
            </Link>
          </div>
        </>
      )}
    </Drawer>
  );
}

/* Completion with a moment: the node pops, the line illuminates,
   a quiet line lands — then the page refreshes into the new state. */
function JourneyCompleteButton({ nodeId, completed, nextTitle, onCompleted }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [celebrated, setCelebrated] = useState(false);

  async function run() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/roadmap/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeId, status: "completed" })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Couldn't save that. Try again.");
        setBusy(false);
        return;
      }
      onCompleted?.(nodeId);
      setCelebrated(true);
      setTimeout(() => router.refresh(), 1100);
    } catch {
      setMsg("Couldn't reach the server. Try again.");
      setBusy(false);
    }
  }

  if (completed && !celebrated) {
    return <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Completed ✓ — one more piece in place.</span>;
  }
  if (celebrated) {
    return (
      <div className="animate-in">
        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Nice. One more piece is in place.</p>
        {nextTitle && <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>Next: {nextTitle}</p>}
      </div>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Placing it…" : "Mark complete"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
