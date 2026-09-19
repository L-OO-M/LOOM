"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Timeline, TimelineItem } from "@/components/loom/Timeline";
import { StatusPill } from "@/components/loom/primitives";
import { SOURCE_LABELS, evidenceKind, formatShortDate } from "./proof-format";
import ShareLinkButton from "./ShareLinkButton";

// The record: frontend-only source filter + restrained per-record disclosure
// over server-fetched rows. No new API, no new queries — `records` arrives
// fully formed from the server page.

const FILTER_ORDER = ["all", "roadmap", "oss", "chapter"];

function EvidenceLink({ url }) {
  const kind = evidenceKind(url);
  if (!kind) return null;
  if (kind === "internal") {
    return (
      <Link
        href={url}
        prefetch={false}
        className="text-xs font-semibold hover:underline"
        style={{ color: "var(--accent)" }}
      >
        View evidence →
      </Link>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-xs font-semibold hover:underline"
      style={{ color: "var(--accent)" }}
    >
      View evidence ↗
    </a>
  );
}

function RecordRow({ record, issuer, expanded, onToggle }) {
  const tierText = record.tier ? `Tier ${record.tier} badge` : null;
  return (
    <TimelineItem
      state="done"
      title={record.title}
      meta={formatShortDate(record.earnedAt) || "earned"}
      body={`Issued by ${issuer}`}
      action={
        <div className="min-w-0 space-y-2.5">
          <span className="flex flex-wrap items-center gap-1.5" aria-label="Achievement metadata">
            <StatusPill>{record.sourceLabel}</StatusPill>
            {record.levelLabel && <StatusPill>{record.levelLabel}</StatusPill>}
            {tierText && <StatusPill>{tierText}</StatusPill>}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <EvidenceLink url={record.evidenceUrl} />
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} details for ${record.title}`}
              className="text-xs font-semibold hover:underline"
              style={{ color: "var(--text-muted)" }}
            >
              {expanded ? "Fewer details ↑" : "More details ↓"}
            </button>
          </span>
          {expanded && (
            <dl className="grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs leading-5">
              <dt style={{ color: "var(--text-muted)" }}>Source</dt>
              <dd style={{ color: "var(--text)" }}>{record.sourceDetail}</dd>
              <dt style={{ color: "var(--text-muted)" }}>Level</dt>
              <dd style={{ color: "var(--text)" }}>{record.levelLabel || "—"}</dd>
              {record.tier ? (
                <>
                  <dt style={{ color: "var(--text-muted)" }}>Badge tier</dt>
                  <dd style={{ color: "var(--text)" }}>Tier {record.tier} of 3</dd>
                </>
              ) : null}
              <dt style={{ color: "var(--text-muted)" }}>Earned</dt>
              <dd style={{ color: "var(--text)" }}>{formatShortDate(record.earnedAt) || "—"}</dd>
              <dt style={{ color: "var(--text-muted)" }}>Signed links</dt>
              <dd style={{ color: "var(--text)" }}>
                {record.links.length === 0
                  ? "None yet — create one below."
                  : `${record.links.length} in the wild`}
              </dd>
            </dl>
          )}
          <ShareLinkButton
            achievementId={record.id}
            links={record.links}
            label={record.title}
          />
        </div>
      }
    />
  );
}

export default function ProofRecord({ records, issuer }) {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);

  const available = useMemo(() => {
    const keys = new Set(records.map((r) => r.sourceKey));
    return FILTER_ORDER.filter((k) => k === "all" || keys.has(k));
  }, [records]);

  const visible = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.sourceKey === filter)),
    [records, filter]
  );

  return (
    <div>
      {available.length > 2 && (
        <div className="seg mt-5" role="group" aria-label="Filter proof by source">
          {available.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
            >
              {k === "all" ? "All" : SOURCE_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      <p className="meta mt-3" aria-live="polite">
        Showing {visible.length} of {records.length}
      </p>
      <Timeline className="mt-4">
        {visible.map((r) => (
          <RecordRow
            key={r.id}
            record={r}
            issuer={issuer}
            expanded={openId === r.id}
            onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
          />
        ))}
      </Timeline>
    </div>
  );
}
