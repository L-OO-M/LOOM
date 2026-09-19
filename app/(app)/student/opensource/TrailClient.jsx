"use client";

import { useState } from "react";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { StatusPill } from "@/components/loom/primitives";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "claimed", label: "Claimed" },
  { value: "verified", label: "Verified" },
  { value: "rejected", label: "Not counted" }
];

const TYPE_LABELS = { pr: "Pull request", issue: "Issue", review: "Review", commit: "Commit" };

function fmtDate(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function stateFor(status) {
  if (status === "verified") return "done";
  if (status === "rejected") return "todo";
  return "now";
}

function pillFor(status) {
  if (status === "verified") return { tone: "is-gold", label: "Verified" };
  if (status === "rejected") return { tone: "", label: "Not counted" };
  return { tone: "is-live", label: "Claimed" };
}

const PAGE = 8;

export default function TrailClient({ items = [] }) {
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);

  if (!items || items.length === 0) {
    return (
      <p className="narrative mt-3">Nothing claimed yet. Find a repository above, make a contribution, then claim it here.</p>
    );
  }

  const filtered = filter === "all" ? items : items.filter((c) => c.status === filter);
  const shown = showAll ? filtered : filtered.slice(0, PAGE);

  return (
    <div>
      <div className="seg" role="group" aria-label="Filter contributions by status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => { setFilter(f.value); setShowAll(false); }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="meta mt-3" aria-live="polite">
        {filtered.length === 0 ? "No contributions in this state" : `Showing ${shown.length} of ${filtered.length}`}
      </p>

      {filtered.length === 0 ? (
        <p className="narrative mt-3">
          {filter === "rejected"
            ? "No rejected contributions. Rejected claims stay visible here so nothing silently disappears."
            : `No ${filter} contributions yet.`}
        </p>
      ) : (
        <Timeline className="mt-4">
          {shown.map((c) => {
            const pill = pillFor(c.status);
            const repo = c.owner ? `${c.owner}/${c.repo_name}${c.pr_number ? `#${c.pr_number}` : ""}` : null;
            const stats = [c.merged_at ? `merged ${fmtDate(c.merged_at)}` : null, c.verified_at ? `verified ${fmtDate(c.verified_at)}` : null].filter(Boolean).join(" · ") || null;
            const hasWebhookStats = c.merged_at || (c.files_changed || 0) > 0 || (c.lines_added || 0) > 0 || (c.lines_deleted || 0) > 0;
            return (
              <TimelineItem
                key={c.id}
                state={stateFor(c.status)}
                title={c.title || repo || "Contribution"}
                meta={fmtDate(c.created_at)}
                body={
                  <span>
                    <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
                    <span className="ml-2">{TYPE_LABELS[c.contribution_type] || c.contribution_type}{repo ? ` · ${repo}` : ""}</span>
                    {stats && <span className="mt-1 block">{stats}</span>}
                    {hasWebhookStats && (
                      <span className="mt-1 block font-mono text-xs">
                        {c.files_changed ?? "—"} files · +{c.lines_added ?? "—"} / −{c.lines_deleted ?? "—"} lines
                      </span>
                    )}
                    {c.status === "rejected" && <span className="mt-1 block">Not counted toward badges or proof.</span>}
                    {c.status === "claimed" && !c.verified_at && <span className="mt-1 block">Awaiting merge confirmation.</span>}
                  </span>
                }
                action={c.pr_url ? <a href={c.pr_url} target="_blank" rel="noreferrer" aria-label={`Open ${c.title || "contribution"} on GitHub (opens in a new tab)`} className="text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>Open on GitHub →</a> : null}
              />
            );
          })}
        </Timeline>
      )}

      {filtered.length > PAGE && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="btn-ghost mt-4 !py-2 text-sm"
          aria-expanded={showAll}
        >
          {showAll ? "Show less" : `Show more (${filtered.length - PAGE} more)`}
        </button>
      )}
    </div>
  );
}
