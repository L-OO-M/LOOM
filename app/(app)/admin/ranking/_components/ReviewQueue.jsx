"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ShieldAlert, ExternalLink, Loader2 } from "lucide-react";

const STATUS = { idle: "", busy: "", done: "", error: "" };

function ago(value) {
  if (!value) return "";
  const mins = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// The review queue.
//
// Optimized for throughput, because the failure mode of any human review
// system is not that reviewers are wrong -- it is that reviewing is slow enough
// that people stop reviewing, and a queue nobody clears is the same as no
// queue. So: no navigation, evidence inlined, one click per decision, and the
// expensive reversal deliberately separated so it cannot be hit by accident.
export default function ReviewQueue({ nodes = [], projects = [] }) {
  const router = useRouter();
  const [status, setStatus] = useState(STATUS);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState(null);

  async function decide({ kind, id, decision, studentId, studentName }) {
    setBusyId(id);
    setStatus(STATUS);
    try {
      const res = await fetch("/api/admin/ranking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, decision })
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus({ ...STATUS, error: data.error?.message || "That did not work" });
        return;
      }
      setStatus({ ...STATUS, done: `${decision === "verified" ? "Confirmed" : "Declined"} — ${studentName || "claim"}` });
      router.refresh();
    } catch {
      setStatus({ ...STATUS, error: "Network error — nothing was changed" });
    } finally {
      setBusyId(null);
    }
  }

  // Reversal is a different act from a single decline and gets its own
  // two-step confirm. Clearing every unverified claim for one student is the
  // action that actually costs something, and it should never be one click.
  async function clearAll(studentId, studentName) {
    const ok = window.confirm(
      `Clear every unverified claim for ${studentName || studentId}?\n\n` +
        `All their provisional nodes and projects are marked declined and every ` +
        `point they hold is removed. This cannot be undone from here — the student ` +
        `can submit again.`
    );
    if (!ok) return;
    setBusyId(`all:${studentId}`);
    setStatus(STATUS);
    try {
      const res = await fetch("/api/admin/ranking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "roadmap_node", id: "00000000-0000-0000-0000-000000000000", decision: "rejected", clearAllForStudent: true })
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus({ ...STATUS, error: data.error?.message || "That did not work" });
        return;
      }
      setStatus({ ...STATUS, done: `Cleared unverified claims for ${studentName || studentId}` });
      router.refresh();
    } catch {
      setStatus({ ...STATUS, error: "Network error — nothing was changed" });
    } finally {
      setBusyId(null);
    }
  }

  const total = nodes.length + projects.length;
  const showNodes = filter === "all" || filter === "nodes";
  const showProjects = filter === "all" || filter === "projects";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg" role="group" aria-label="Filter claims">
          {[
            { id: "all", label: `All · ${total}` },
            { id: "nodes", label: `Nodes · ${nodes.length}` },
            { id: "projects", label: `Projects · ${projects.length}` },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              aria-pressed={filter === f.id ? "true" : "false"}
              className="rounded-full px-3 py-1.5 text-xs font-semibold"
              style={
                filter === f.id
                  ? { background: "var(--text)", color: "var(--bg)" }
                  : { color: "var(--text-muted)", border: "1px solid var(--line)" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="meta" role="status">{status.done || status.error}</span>
      </div>

      {total === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed p-10 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="h-product" style={{ color: "var(--text)" }}>Nothing waiting.</p>
          <p className="narrative mx-auto mt-2 max-w-md">
            Every claim a student has submitted has been confirmed or declined.
            New ones appear here as they arrive, oldest first.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-6">
          {showNodes && nodes.length > 0 && (
            <section aria-label="Roadmap milestone claims">
              <Meta>Roadmap milestones · {nodes.length}</Meta>
              <ul className="mt-2 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                {nodes.map((n) => (
                  <li key={n.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {n.item_title || n.node_id}
                        </p>
                        <p className="meta mt-0.5">
                          {n.student_name || n.student_id?.slice(0, 8)}
                          {n.domain ? ` · ${n.domain}` : ""} · claimed {ago(n.updated_at)}
                        </p>
                        {n.evidence_note && (
                          <p className="narrative mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--text-muted)" }}>
                            &ldquo;{n.evidence_note}&rdquo;
                          </p>
                        )}
                        {n.evidence_url && (
                          <a
                            href={n.evidence_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mono-tag mt-2 inline-flex items-center gap-1 hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
                            <ExternalLink size={11} /> evidence link
                          </a>
                        )}
                        {!n.evidence_note && !n.evidence_url && (
                          <p className="meta mt-2">
                            No evidence attached &mdash; the student only ticked the box.
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={() => decide({ kind: "roadmap_node", id: n.id, decision: "verified", studentId: n.student_id, studentName: n.student_name })}
                          className="btn-ink !py-1.5 text-xs disabled:opacity-50"
                        >
                          {busyId === n.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm
                        </button>
                        <button
                          type="button"
                          disabled={busyId === n.id}
                          onClick={() => decide({ kind: "roadmap_node", id: n.id, decision: "rejected", studentId: n.student_id, studentName: n.student_name })}
                          className="btn-ghost !py-1.5 text-xs disabled:opacity-50"
                        >
                          <X size={12} /> Decline
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `all:${n.student_id}`}
                      onClick={() => clearAll(n.student_id, n.student_name)}
                      className="meta mt-3 inline-flex items-center gap-1.5 hover:underline disabled:opacity-50"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ShieldAlert size={11} /> Clear every unverified claim for this student
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {showProjects && projects.length > 0 && (
            <section aria-label="Project claims">
              <Meta>Projects · {projects.length}</Meta>
              <ul className="mt-2 divide-y overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                {projects.map((p) => (
                  <li key={p.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {p.item_title}
                        </p>
                        <p className="meta mt-0.5">
                          {p.student_name || p.student_id?.slice(0, 8)} · claimed {ago(p.updated_at)}
                        </p>
                        <p className="mono-tag mt-2 inline-block">
                          {p.repo_full_name || "no repository recorded"}
                        </p>
                        {p.repo_url && (
                          <a
                            href={p.repo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 flex items-center gap-1 text-xs hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
                            <ExternalLink size={11} /> open the repository and look
                          </a>
                        )}
                        <p className="meta mt-2">
                          {p.has_attested_activity
                            ? "Signed deliveries from this repository are on file. GitHub has not promoted it yet — confirm if the work is real."
                            : "No signed delivery from this repository. The repo has no webhook pointed at this deployment, so nothing GitHub sent us could confirm it."}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => decide({ kind: "project", id: p.id, decision: "verified", studentId: p.student_id, studentName: p.student_name })}
                          className="btn-ink !py-1.5 text-xs disabled:opacity-50"
                        >
                          {busyId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Confirm
                        </button>
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => decide({ kind: "project", id: p.id, decision: "rejected", studentId: p.student_id, studentName: p.student_name })}
                          className="btn-ghost !py-1.5 text-xs disabled:opacity-50"
                        >
                          <X size={12} /> Decline
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busyId === `all:${p.student_id}`}
                      onClick={() => clearAll(p.student_id, p.student_name)}
                      className="meta mt-3 inline-flex items-center gap-1.5 hover:underline disabled:opacity-50"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <ShieldAlert size={11} /> Clear every unverified claim for this student
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}