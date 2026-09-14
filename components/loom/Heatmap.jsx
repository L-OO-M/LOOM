"use client";

import { useMemo } from "react";

/* Contribution heatmap — honest levels from real daily activity.
   Expects rows: [{ day: "YYYY-MM-DD", commits, pull_requests, reviews }].
   No data invented: empty days render empty, labelled as such. */

function levelOf(row) {
  if (!row) return 0;
  const v = (row.commits || 0) + (row.pull_requests || 0) + (row.reviews || 0);
  if (v <= 0) return 0;
  if (v === 1) return 1;
  if (v <= 3) return 2;
  if (v <= 6) return 3;
  return 4;
}

function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" });
}

export function Heatmap({ rows = [], weeks = 16 }) {
  const cells = useMemo(() => {
    const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Align to full weeks ending today: go back (weeks*7 - 1) days, then back to Monday.
    const start = new Date(today);
    start.setDate(start.getDate() - (weeks * 7 - 1));
    const dow = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - dow);
    const out = [];
    const cursor = new Date(start);
    for (let i = 0; i < weeks * 7; i++) {
      const iso = cursor.toISOString().slice(0, 10);
      const future = cursor > today;
      out.push({ iso, row: future ? null : byDay.get(iso), future });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [rows, weeks]);

  const active = cells.filter((c) => !c.future && levelOf(c.row) > 0).length;

  return (
    <div>
      <div className="heat" role="img" aria-label={`Contribution activity, ${active} active days in the last ${weeks} weeks`}>
        {cells.map((c) => {
          if (c.future) return <span key={c.iso} className="heat-cell" style={{ opacity: 0.35 }} title={fmtDay(c.iso)} />;
          const l = levelOf(c.row);
          const v = c.row ? (c.row.commits || 0) + (c.row.pull_requests || 0) + (c.row.reviews || 0) : 0;
          const tip = c.row
            ? `${fmtDay(c.iso)} — ${v} contribution${v === 1 ? "" : "s"}`
            : `${fmtDay(c.iso)} — no recorded activity`;
          return <span key={c.iso} className="heat-cell" data-l={l} title={tip} />;
        })}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="meta">{active} active days · last {weeks} weeks</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="meta mr-1">Less</span>
          {[0, 1, 2, 3, 4].map((l) => <span key={l} className="heat-cell" data-l={l} />)}
          <span className="meta ml-1">More</span>
        </span>
      </div>
    </div>
  );
}

/* Seven-day strip — the dashboard's week at a glance.
   days: [{ label: "Mon", hit: bool, today: bool }]. */

export function WeekStrip({ days }) {
  return (
    <div className="weekstrip" role="img" aria-label="This week's activity">
      {days.map((d) => (
        <div key={d.label} className={`weekday ${d.hit ? "is-hit" : ""} ${d.today ? "is-today" : ""}`}>
          <span className="weekpip" aria-hidden="true">
            {d.hit && (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="3.2" fill="var(--accent)" />
              </svg>
            )}
          </span>
          <span className="meta" style={d.today ? { color: "var(--text)" } : undefined}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
