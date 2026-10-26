"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SOURCE_LABELS, evidenceKind, formatShortDate } from "./proof-format";
import ShareLinkButton from "./ShareLinkButton";

// The record: frontend-only source filter + restrained per-record disclosure
// over server-fetched rows. No new API, no new queries; `records` arrives
// fully formed from the server page.

const FILTER_ORDER = ["all", "roadmap", "oss", "chapter"];

function EvidenceLink({ url }) {
  const kind = evidenceKind(url);
  if (!kind) return null;
  if (kind === "internal") {
    return (
      <Link href={url} prefetch={false} className="proof-record-link">
        View evidence <span aria-hidden="true">&rarr;</span>
      </Link>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="proof-record-link">
      View evidence <span aria-hidden="true">&nearr;</span>
    </a>
  );
}

function RecordRow({ record, issuer, expanded, onToggle }) {
  const tierText = record.tier ? `Tier ${record.tier}` : null;
  return (
    <li className="proof-record" data-open={expanded ? "true" : "false"}>
      <div className="proof-record-head">
        <div className="proof-record-main">
          <p className="proof-record-source">
            {record.sourceLabel} &middot; {formatShortDate(record.earnedAt) || "earned"}
          </p>
          <p className="proof-record-title">{record.title}</p>
          <p className="proof-record-meta">
            Issued by {issuer} &middot; {record.levelLabel || "—"}
            {tierText ? ` · ${tierText}` : ""}
          </p>
        </div>
        <span className="proof-record-seal">Verified</span>
      </div>
      <div className="proof-record-actions">
        <EvidenceLink url={record.evidenceUrl} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="proof-record-toggle"
        >
          {expanded ? "Fewer details" : "More details"}
        </button>
      </div>
      {expanded && (
        <dl className="proof-record-details">
          <dt>Source</dt><dd>{record.sourceDetail}</dd>
          <dt>Earned</dt><dd>{formatShortDate(record.earnedAt) || "—"}</dd>
          <dt>Links</dt><dd>{record.links.length === 0 ? "None yet; issue one below." : `${record.links.length} in the wild`}</dd>
        </dl>
      )}
      <div className="proof-record-share">
        <ShareLinkButton achievementId={record.id} links={record.links} label={record.title} />
      </div>
    </li>
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
    <div className="proof-record-wrap">
      {available.length > 2 && (
        <div className="proof-record-filter" role="group" aria-label="Filter proof by source">
          {available.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? "All" : SOURCE_LABELS[k]}
            </button>
          ))}
        </div>
      )}
      <p className="proof-record-count" aria-live="polite">
        Showing {visible.length} of {records.length} &middot; archive documents, not cards
      </p>
      <ul className="proof-record-list">
        {visible.map((r) => (
          <RecordRow
            key={r.id}
            record={r}
            issuer={issuer}
            expanded={openId === r.id}
            onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))}
          />
        ))}
      </ul>
    </div>
  );
}
