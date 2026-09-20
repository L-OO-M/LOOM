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
  const tierText = record.tier ? `Tier ${record.tier}` : null;
  return (
    <li className="rounded-none border-l-2 pl-4 py-4" style={{ borderColor: "var(--accent)", background: "color-mix(in srgb, var(--bg-elevated) 88%, transparent)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="mono-tag" style={{ color: "var(--accent)" }}>{record.sourceLabel} · {formatShortDate(record.earnedAt) || "earned"}</p>
          <p className="font-display text-lg font-medium leading-6 mt-1" style={{ color: "var(--text)" }}>{record.title}</p>
          <p className="meta mt-1">Issued by {issuer} · {record.levelLabel || "—"}{tierText ? ` · ${tierText}` : ""}</p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-widest" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-glow)" }}>VERIFIED</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <EvidenceLink url={record.evidenceUrl} />
        <button type="button" onClick={onToggle} aria-expanded={expanded} className="text-xs font-semibold hover:underline" style={{ color: "var(--text-muted)" }}>{expanded ? "Fewer details ↑" : "More details ↓"}</button>
      </div>
      {expanded && (
        <dl className="mt-3 grid max-w-md grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs leading-5">
          <dt style={{ color: "var(--text-muted)" }}>Source</dt><dd style={{ color: "var(--text)" }}>{record.sourceDetail}</dd>
          <dt style={{ color: "var(--text-muted)" }}>Earned</dt><dd style={{ color: "var(--text)" }}>{formatShortDate(record.earnedAt) || "—"}</dd>
          <dt style={{ color: "var(--text-muted)" }}>Links</dt><dd style={{ color: "var(--text)" }}>{record.links.length === 0 ? "None yet — create one below." : `${record.links.length} in the wild`}</dd>
        </dl>
      )}
      <div className="mt-3"><ShareLinkButton achievementId={record.id} links={record.links} label={record.title} /></div>
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
    <div>
      {available.length > 2 && (
        <div className="seg mt-5" role="group" aria-label="Filter proof by source">
          {available.map((k) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === "all" ? "All" : SOURCE_LABELS[k]}</button>
          ))}
        </div>
      )}
      <p className="meta mt-3" aria-live="polite">Showing {visible.length} of {records.length} — vault documents, not cards</p>
      <ul className="mt-4 divide-y" style={{ borderColor: "var(--line)" }}>
        {visible.map((r) => (
          <RecordRow key={r.id} record={r} issuer={issuer} expanded={openId === r.id} onToggle={() => setOpenId((cur) => (cur === r.id ? null : r.id))} />
        ))}
      </ul>
    </div>
  );
}
