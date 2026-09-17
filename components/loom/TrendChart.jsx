"use client";

import { useMemo, useState } from "react";

// Lightweight SVG bar chart — no new dependency. Grouped bars for two
// series, auto-scaled grid, hover tooltip, clickable legend, fully
// responsive via viewBox. Honors prefers-reduced-motion (no animation
// by default).
const W = 680;
const H = 260;
const PAD = { l: 36, r: 12, t: 12, b: 28 };
const BAR_GAP = 3;
const MAX_GROUP_W = 64;

export function TrendChart({ data, seriesA = "Active learners", seriesB = "Completions", keyA = "active", keyB = "completions", fill = false }) {
  const [hidden, setHidden] = useState({ active: false, completions: false });
  const [hover, setHover] = useState(null);
  const rows = data || [];
  const baseY = PAD.t + (H - PAD.t - PAD.b);
  void fill;

  const { max, ticks, bars, pairW, singleW } = useMemo(() => {
    const peak = Math.max(10, ...rows.map((r) => Math.max(r[keyA] || 0, r[keyB] || 0)));
    const nice = Math.ceil(peak / 4);
    const step = nice <= 1 ? 1 : nice <= 2 ? 2 : nice <= 5 ? 5 : Math.ceil(nice / 10) * 10;
    const top = step * 4;
    const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
    const plotW = W - PAD.l - PAD.r;
    const plotH = H - PAD.t - PAD.b;
    const y = (v) => PAD.t + (1 - Math.min(v, top) / top) * plotH;
    const n = rows.length;
    const slot = n > 0 ? plotW / n : plotW;
    const groupW = Math.min(slot * 0.62, MAX_GROUP_W);
    const pairW = Math.max(2, (groupW - BAR_GAP) / 2);
    const singleW = Math.min(groupW * 0.55, 36);
    const center = (i) => PAD.l + slot * i + slot / 2;
    const bars = rows.map((r, i) => {
      const c = center(i);
      const va = r[keyA] || 0;
      const vb = r[keyB] || 0;
      const ya = y(va);
      const yb = y(vb);
      return {
        c,
        ax: c - pairW - BAR_GAP / 2, ay: ya, ah: Math.max(0, baseY - ya), av: va,
        bx: c + BAR_GAP / 2, by: yb, bh: Math.max(0, baseY - yb), bv: vb,
      };
    });
    return { max: top, ticks, bars, pairW, singleW };
  }, [rows, keyA, keyB, baseY]);

  const toggle = (key) => setHidden((h) => ({ ...h, [key]: !h[key] }));
  const every = rows.length > 12 ? 3 : rows.length > 8 ? 2 : 1;
  const active = hover != null ? rows[hover] : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4" role="group" aria-label="Chart series">
        {[
          { key: "active", label: seriesA, color: "var(--dash-accent)" },
          { key: "completions", label: seriesB, color: "#3fd2e0" },
        ].map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => toggle(s.key)}
            aria-pressed={!hidden[s.key]}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium transition"
            style={{ color: hidden[s.key] ? "var(--text-muted)" : "var(--text)", opacity: hidden[s.key] ? 0.55 : 1 }}
          >
            <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </button>
        ))}
      </div>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Bar chart, peak value ${max}`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const n = rows.length;
            if (n === 0) return;
            const slot = (W - PAD.l - PAD.r) / n;
            const idx = Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / slot)));
            setHover(idx);
          }}
        >
          {ticks.map((t) => {
            const yy = PAD.t + (1 - t / max) * (H - PAD.t - PAD.b);
            return (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={yy} y2={yy} stroke="var(--line)" strokeWidth="1" />
                <text x={PAD.l - 6} y={yy + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{t}</text>
              </g>
            );
          })}
          {rows.map((r, i) =>
            i % every === 0 ? (
              <text key={i} x={bars[i].c} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                {r.label}
              </text>
            ) : null
          )}
          {hover != null && bars[hover] && (
            <line x1={bars[hover].c} x2={bars[hover].c} y1={PAD.t} y2={H - PAD.b} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          )}
          {(!hidden.active || !hidden.completions) && (
            <line x1={PAD.l} x2={W - PAD.r} y1={baseY} y2={baseY} stroke="var(--line)" strokeWidth="1" />
          )}
          {bars.map((b, i) => {
            const showA = !hidden.active;
            const showB = !hidden.completions;
            const both = showA && showB;
            const dim = hover != null && hover !== i ? 0.55 : 1;
            return (
              <g key={i} opacity={dim}>
                {showA && (
                  <rect
                    x={both ? b.ax : b.c - singleW / 2}
                    y={b.ay}
                    width={both ? pairW : singleW}
                    height={Math.max(b.ah, b.av > 0 ? 2 : 0)}
                    rx="3"
                    fill="var(--dash-accent)"
                    opacity={hover === i ? 1 : 0.9}
                  />
                )}
                {showB && (
                  <rect
                    x={both ? b.bx : b.c - singleW / 2}
                    y={b.by}
                    width={both ? pairW : singleW}
                    height={Math.max(b.bh, b.bv > 0 ? 2 : 0)}
                    rx="3"
                    fill="#3fd2e0"
                    opacity={hover === i ? 1 : 0.9}
                  />
                )}
              </g>
            );
          })}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute z-10 min-w-32 rounded-lg border px-2.5 py-2 text-[12px] shadow-lg"
            style={{
              borderColor: "var(--line)", background: "var(--bg-elevated)", color: "var(--text)",
              left: `clamp(8px, ${(bars[hover].c / W) * 100}%, calc(100% - 140px))`,
              top: 8,
            }}
            role="status"
          >
            <p className="font-semibold">{active.label}</p>
            {!hidden.active && <p className="mt-0.5 tabular-nums"><span style={{ color: "var(--dash-accent)" }}>●</span> {seriesA}: {active[keyA] ?? 0}</p>}
            {!hidden.completions && <p className="tabular-nums"><span style={{ color: "#3fd2e0" }}>●</span> {seriesB}: {active[keyB] ?? 0}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="skel" style={{ height: 14, width: "30%" }} />
      <div className="skel mt-4" style={{ height: 220, width: "100%" }} />
    </div>
  );
}
