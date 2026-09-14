"use client";

import Link from "next/link";

/* Type scale — one voice per job. Display for moments, product for UI,
   narrative for reading, meta for metadata, figure for big numbers. */

export function Display({ as: Tag = "h1", size = "lg", children, className = "" }) {
  return <Tag className={`display display-${size} ${className}`}>{children}</Tag>;
}

export function ProductHeading({ as: Tag = "h2", children, className = "" }) {
  return <Tag className={`h-product ${className}`}>{children}</Tag>;
}

export function Narrative({ as: Tag = "p", children, className = "" }) {
  return <Tag className={`narrative ${className}`}>{children}</Tag>;
}

export function Meta({ as: Tag = "p", children, className = "" }) {
  return <Tag className={`meta ${className}`}>{children}</Tag>;
}

export function Figure({ value, unit, mono = false, className = "", style }) {
  return (
    <p className={`figure ${mono ? "figure-mono" : ""} ${className}`} style={style}>
      {value}
      {unit && <span className="meta ml-2" style={{ letterSpacing: "0.1em" }}>{unit}</span>}
    </p>
  );
}

export function Rule({ fade = false, className = "" }) {
  return <div className={fade ? `rule-fade ${className}` : `rule ${className}`} aria-hidden="true" />;
}

/* Status pill — quiet by default, gold only when it means something. */
export function StatusPill({ tone = "", children }) {
  return <span className={`pill ${tone ? `is-${tone}` : ""}`}>{children}</span>;
}

/* Action link with a nudge on hover. Prefetch stays off: every app route is a
   live server render with ~20 DB queries, so background prefetching turns one
   page view into a query storm against the pooler. Clicks render on demand. */
export function ActionLink({ href, children, className = "" }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className={`group inline-flex items-center gap-1.5 text-sm font-semibold transition ${className}`}
      style={{ color: "var(--accent)" }}
    >
      {children}
      <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5">→</span>
    </Link>
  );
}

/* Segmented control — filters that feel native, not bolted on. */
export function SegControl({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Plain number + label — for when a metric card would be a lie. */
export function PlainStat({ value, unit, label, mono = true }) {
  return (
    <div className="stat-plain">
      <Figure value={value} unit={unit} mono={mono} />
      <span className="max-w-40 text-xs leading-5" style={{ color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
