"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Reveal } from "@/components/motion/Reveal";
import { Meta } from "@/components/loom/primitives";
import { Drawer } from "@/components/loom/Drawer";
import { OnboardingState } from "@/components/loom/States";
import { RoadmapHero } from "@/app/(app)/student/roadmap/_components/RoadmapHero";
import { RoadmapTopicCard } from "@/app/(app)/student/roadmap/_components/RoadmapTopicCard";
import { domainLabel } from "@/lib/domains";
import { getResourceHref, isExternalUrl } from "@/lib/resource-link";

/* The roadmap as a full map: a central path with each topic branching off it
   with real material, real builds, and the real completion control.
   Nodes arrive already scoped to one domain (see roadmap/page.jsx), so this no
   longer groups by stage or numbers them — that was duplicate navigation once
   the domain rail took over. LOOM theme only. */

export function RoadmapJourney({
  nodes,
  doneIds,
  verifiedIds = [],
  nextId,
  resourcesByDomain,
  resourcesByNode = {},
  resourceDoneIds = [],
  projectsByNode = {},
  domain = null,
}) {
  const done = useMemo(() => new Set(doneIds), [doneIds]);
  // doneIds still counts provisional claims for progression (a student must not
  // be blocked on a slow review), but only verified nodes read as finished proof.
  const verifiedSet = useMemo(() => new Set(verifiedIds), [verifiedIds]);
  const resourceDoneSet = useMemo(() => new Set(resourceDoneIds), [resourceDoneIds]);
  // null = drawer closed.
  const [selectedId, setSelectedId] = useState(null);
  const [justDone, setJustDone] = useState(null);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;
  const selIndex = selected ? nodes.findIndex((n) => n.id === selected.id) : -1;

  const percent = nodes.length > 0 ? Math.round((doneIds.length / nodes.length) * 100) : 0;
  const trackedDomain = domain || nodes[0]?.domain || null;

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

  return (
    <main className="pb-24">
      <RoadmapHero nodes={nodes} doneIds={doneIds} nextId={nextId} domain={trackedDomain} />

      <div className="rm-map mx-auto mt-4 max-w-6xl px-4 sm:px-6">
        <div className="rm-spine" aria-hidden="true">
          <div className="rm-spine-fill" style={{ height: `${percent}%` }} />
        </div>

        {(() => {
          const stageDone = doneIds.length;
          const stageMins = (resourcesByDomain[trackedDomain] || []).reduce(
            (s, r) => s + (r.minutes || 0),
            0
          );
          return (
            <section id={`rm-stage-${trackedDomain}`} aria-label={`${domainLabel(trackedDomain)} topics`} className="rm-stage scroll-mt-24">
              <Reveal>
                <p className="meta mb-8">
                  {stageDone} of {nodes.length} complete · {percent}%
                  {stageMins ? ` · ≈ ${stageMins} min of linked material` : ""}
                </p>
              </Reveal>

              {nodes.map((node, globalIndex) => {
                const isDone = done.has(node.id);
                const isNext = node.id === nextId;
                const isSel = selected && node.id === selected.id;
                const fresh = justDone === node.id;
                const side = globalIndex % 2 === 0 ? "left" : "right";
                // Node-pinned material first; fall back to the domain catalog and
                // flag it so the card can say the picks are domain-wide.
                const nodeLinked = resourcesByNode[node.id] ?? [];
                const linked = nodeLinked.length ? nodeLinked : resourcesByDomain[node.domain] ?? [];
                const linkedFallback = nodeLinked.length === 0;
                const builds = projectsByNode[node.id] ?? [];
                return (
                  <div key={node.id} id={`rm-node-${node.id}`} className="rm-row scroll-mt-28">
                    <div className={`rm-cell rm-cell-left ${side === "left" ? "has-card" : ""}`}>
                      {side === "left" ? (
                        <Reveal>
                          <RoadmapTopicCard
                            node={node}
                            index={globalIndex}
                            isDone={isDone}
                            isNext={isNext}
                            isSelected={!!isSel}
                            justCompleted={fresh}
                            verified={verifiedSet.has(node.id)}
                            resources={linked}
                            resourcesFallback={linkedFallback}
                            resourceDoneSet={resourceDoneSet}
                            projects={builds}
                            onOpen={() => setSelectedId(node.id)}
                          />
                        </Reveal>
                      ) : (
                        <TrailNote state={isDone ? "done" : isNext ? "now" : "todo"} />
                      )}
                    </div>

                    <div className="rm-center">
                      <button
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        aria-current={isNext ? "step" : undefined}
                        aria-label={`Open ${node.title} details`}
                        className={`rm-node ${isDone ? "is-done" : isNext ? "is-now line-illuminate" : ""} ${isSel ? "halo" : ""}`}
                      >
                        <span className={`rm-pip ${fresh ? "node-pop" : ""}`} aria-hidden="true">
                          {isDone ? "✓" : String(globalIndex + 1).padStart(2, "0")}
                        </span>
                      </button>
                      <span className="rm-milestone" aria-hidden="true">
                        M{String(globalIndex + 1).padStart(2, "0")}
                      </span>
                    </div>

                    <div className={`rm-cell rm-cell-right ${side === "right" ? "has-card" : ""}`}>
                      {side === "right" ? (
                        <Reveal>
                          <RoadmapTopicCard
                            node={node}
                            index={globalIndex}
                            isDone={isDone}
                            isNext={isNext}
                            isSelected={!!isSel}
                            justCompleted={fresh}
                            verified={verifiedSet.has(node.id)}
                            resources={linked}
                            resourcesFallback={linkedFallback}
                            resourceDoneSet={resourceDoneSet}
                            projects={builds}
                            onOpen={() => setSelectedId(node.id)}
                          />
                        </Reveal>
                      ) : (
                        <TrailNote state={isDone ? "done" : isNext ? "now" : "todo"} />
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })()}

        <Reveal>
          <section
            aria-label="Where this roadmap leads"
            className="mx-auto mt-20 max-w-3xl rounded-2xl border px-6 py-8 text-center"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
          >
            <Meta>Learn → Practice → Build → Proof</Meta>
            <p className="font-display mt-3 text-2xl font-medium" style={{ color: "var(--text)" }}>
              {doneIds.length >= nodes.length
                ? "Path complete. Turn it into proof."
                : "Keep walking — every topic ends in proof."}
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
              Finish a topic&apos;s material, ship a linked project, and milestones
              become achievements on your record — the same trail credentials are built from.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {nextId ? (
                <a href={`#rm-node-${nextId}`} className="btn-ink">
                  Return to your position →
                </a>
              ) : null}
              <Link href="/student/projects" prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                Open your builds
              </Link>
              <Link href="/student/credentials" prefetch={false} className="text-sm font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                View proof
              </Link>
            </div>
          </section>
        </Reveal>
      </div>

      <NodeDrawer
        node={selected}
        index={selIndex}
        total={nodes.length}
        isDone={selected ? done.has(selected.id) : false}
        verified={selected ? verifiedSet.has(selected.id) : false}
        isNext={selected ? selected.id === nextId : false}
        linked={selected ? (resourcesByNode[selected.id]?.length ? resourcesByNode[selected.id] : resourcesByDomain[selected.domain] ?? []) : []}
        linkedFallback={selected ? !(resourcesByNode[selected.id]?.length) : false}
        nodes={nodes}
        nextId={nextId}
        onSelect={setSelectedId}
        onClose={() => setSelectedId(null)}
        onCompleted={(id) => setJustDone(id)}
      />

      <style>{`
        .rm-map { position: relative; }
        .rm-spine {
          position: absolute; top: 0; bottom: 0; left: 20px; width: 2px;
          background: var(--line); border-radius: 999px; overflow: hidden;
        }
        .rm-spine-fill {
          position: absolute; top: 0; left: 0; right: 0;
          background: linear-gradient(180deg, var(--accent-dark), var(--accent));
          transition: height 0.7s var(--ease-out);
        }
        .rm-stage { position: relative; padding: 2.5rem 0 1rem; }
        .rm-row {
          position: relative; display: grid; gap: 0.75rem;
          grid-template-columns: 40px 1fr; padding: 1.25rem 0 1.25rem 0;
        }
        .rm-cell-left { display: none; }
        .rm-cell-right { min-width: 0; }
        .rm-center { grid-row: 1; grid-column: 1; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding-top: 0.35rem; }
        .rm-cell-right { grid-row: 1; grid-column: 2; }
        .rm-node {
          position: relative; z-index: 1; width: 40px; height: 40px; border-radius: 999px;
          display: grid; place-items: center;
          border: 1.5px solid var(--line); background: var(--bg);
          transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
        }
        .rm-node:hover { transform: translateY(-1px); }
        .rm-pip {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 0.68rem; font-weight: 700; color: var(--text-muted);
        }
        .rm-node.is-done { border-color: var(--accent); background: var(--accent); }
        .rm-node.is-done .rm-pip { color: #101314; }
        .rm-node.is-now { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-glow); }
        .rm-node.is-now .rm-pip { color: var(--accent); }
        .rm-milestone {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 0.62rem; letter-spacing: 0.1em; color: var(--text-muted);
        }
        .rm-card {
          position: relative; border: 1px solid var(--line); border-radius: 16px;
          background: var(--bg-elevated); padding: 1.1rem 1.15rem;
          min-width: 0; overflow-wrap: anywhere;
        }
        .rm-trail { display: none; }
        @media (min-width: 900px) {
          .rm-spine { left: 50%; transform: translateX(-50%); }
          .rm-row {
            grid-template-columns: 1fr 88px 1fr; align-items: start;
            padding: 2rem 0;
          }
          .rm-cell-left { display: block; grid-row: 1; grid-column: 1; min-width: 0; }
          .rm-center { grid-row: 1; grid-column: 2; padding-top: 1.4rem; }
          .rm-cell-right { grid-row: 1; grid-column: 3; }
          .rm-cell { position: relative; }
          .rm-cell-left.has-card::after, .rm-cell-right.has-card::after {
            content: ""; position: absolute; top: 64px; width: 44px;
            border-top: 1px dashed var(--line);
          }
          .rm-cell-left.has-card::after { right: -44px; }
          .rm-cell-right.has-card::after { left: -44px; }
          .rm-trail {
            display: block; padding-top: 3.2rem; text-align: center;
            font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
            color: var(--text-muted);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rm-spine-fill, .rm-node { transition: none; }
        }
      `}</style>
    </main>
  );
}

function TrailNote({ state }) {
  const label =
    state === "done" ? "In place ✓" : state === "now" ? "You are here" : "Further down the path";
  return (
    <p className="rm-trail" aria-hidden="true">
      {label}
    </p>
  );
}

function NodeDrawer({ node, index, total, isDone, verified, isNext, linked, linkedFallback, nodes, nextId, onSelect, onClose, onCompleted }) {
  const open = !!node;
  const prev = index > 0 ? nodes[index - 1] : null;
  const next = index >= 0 && index < nodes.length - 1 ? nodes[index + 1] : null;

  // Walk the path from the keyboard: ← previous, → next. The drawer already
  // owns Escape via Drawer; arrows are the in-drawer equivalent of the footer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft" && prev) onSelect(prev.id);
      if (e.key === "ArrowRight" && next) onSelect(next.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, prev, next, onSelect]);

  // Each newly opened node starts at the top of the panel.
  useEffect(() => {
    if (open) document.querySelector(".drawer")?.scrollTo({ top: 0 });
  }, [open, node?.id]);

  return (
    <Drawer open={open} onClose={onClose} label={node ? `${node.domain} · Node ${index + 1} of ${total}` : "Node"}>
      {node && (
        <>
          <p className="meta">Node {index + 1} of {total}{isDone ? (verified ? " · completed" : " · pending review") : isNext ? " · you are here" : ""}</p>
          <p className="display display-md mt-2">{node.title}</p>
          <p className="meta mt-3">
            {isDone ? (verified ? "Completed" : "Completed · pending review") : isNext ? "Up next" : "Upcoming"}
            {node.difficulty_level ? ` · ${node.difficulty_level}` : ""}
          </p>
          <p className="narrative mt-4" style={{ color: "var(--text)" }}>{node.description}</p>

          <div className="mt-6">
            <JourneyCompleteButton nodeId={node.id} completed={isDone} verified={verified} nextTitle={next?.title} onCompleted={onCompleted} />
          </div>

          <div className="mt-8 border-t pt-5" style={{ borderColor: "var(--line)" }}>
            <Meta>Linked resources · {linked.length}</Meta>
            {linkedFallback && linked.length > 0 && (
              <p className="meta mt-1">Nothing is pinned to this node yet — these are picks from the domain catalog.</p>
            )}
            <ul className="mt-3 space-y-1">
              {linked.map((r) => {
                const direct = getResourceHref(r);
                const external = direct ? isExternalUrl(direct) : false;
                return (
                <li key={r.id}>
                  {direct ? (
                  <a
                    href={direct}
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    className="row-link flex items-baseline justify-between gap-3 px-2 py-2"
                    aria-label={`Open ${r.title}${external ? " in a new tab" : ""}`}
                  >
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                    <span className="meta shrink-0">{r.minutes} min{external ? " ↗" : ""}</span>
                  </a>
                  ) : (
                  <span className="flex items-baseline justify-between gap-3 px-2 py-2 opacity-60" role="note" title="Mentors haven't attached a destination to this piece yet">
                    <span className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>{r.title}</span>
                    <span className="meta shrink-0">unavailable</span>
                  </span>
                  )}
                </li>
                );
              })}
              {linked.length === 0 && <p className="text-sm" style={{ color: "var(--text-muted)" }}>No linked resources yet.</p>}
            </ul>
          </div>

          <nav className="mt-6 flex items-stretch gap-2 border-t pt-5" style={{ borderColor: "var(--line)" }} aria-label="Walk the path">
            {prev ? (
              <button onClick={() => onSelect(prev.id)} className="row-link min-w-0 flex-1 px-3 py-3 text-left" aria-label={`Previous node: ${prev.title}`}>
                <span className="meta block">← Previous</span>
                <span className="mt-1 block truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{prev.title}</span>
              </button>
            ) : <span className="flex-1" />}
            {next ? (
              <button onClick={() => onSelect(next.id)} className="row-link min-w-0 flex-1 px-3 py-3 text-right" aria-label={`Next node: ${next.title}`}>
                <span className="meta block">Next →</span>
                <span className="mt-1 block truncate text-sm font-semibold" style={{ color: "var(--accent)" }}>{next.title}</span>
              </button>
            ) : <span className="flex-1" />}
          </nav>
          <div className="mt-4 text-center">
            <Link href={`/student/roadmap/${node.id}`} prefetch={false} className="text-xs hover:underline" style={{ color: "var(--text-muted)" }}>
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
function JourneyCompleteButton({ nodeId, completed, verified = false, nextTitle, onCompleted }) {
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
    return verified
      ? <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Verified ✓ — one more piece in place.</span>
      : <span className="text-sm font-semibold" style={{ color: "var(--text-muted)" }} title="A lead confirms your evidence before it counts toward standing.">Completed · pending review.</span>;
  }
  if (celebrated) {
    return (
      <div className="animate-in">
        <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>Nice — your claim is in.</p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>A lead confirms your evidence before it counts toward standing.</p>
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
