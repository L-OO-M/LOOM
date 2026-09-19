"use client";

import { ResponsiveContainer } from "recharts";

// 5-hue categorical palette derived from CSS vars (Q1 lock-in).
// Uses theme tokens so charts read in both dark and light themes.
// Never color-alone: callers pair hue with pattern/shape/label.
export const PALETTE = {
  accent: "var(--accent)",
  success: "var(--success, #0d9b6b)",
  warn: "var(--warn, #d67a0a)",
  danger: "var(--danger)",
  info: "var(--info, #6b8db5)",
  line: "var(--line)",
  muted: "var(--text-muted)",
};

export const CATEGORICAL = [
  "var(--accent)",
  "var(--success, #0d9b6b)",
  "var(--warn, #d67a0a)",
  "var(--danger)",
  "var(--info, #6b8db5)",
  "#8e7cc3",
  "#5bb8c7",
];

// Themed shell: ResponsiveContainer + common grid/tooltip styling.
// All charts wrap here so heights, skeletons, and tokens stay consistent.
export function ChartShell({ title, subtitle, height = 220, right, children }) {
  return (
    <div className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      {(title || subtitle || right) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            {title && <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</p>}
            {subtitle && <p className="meta mt-0.5 normal-case tracking-normal" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 220 }) {
  return <div className="skel rounded-2xl" style={{ height }} aria-hidden="true" />;
}

// Inline value semantics: hue + textual label
export function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
