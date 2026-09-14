"use client";

/* Horizontal progress path — roadmaps, onboarding, project lifecycles.
   stops: [{ label, state: "done"|"now"|"todo" }]. Labels only on done/now
   to stay quiet; full detail lives in the timeline beside it. */

export function ProgressPath({ stops, percent, ariaLabel = "Progress" }) {
  return (
    <div className="journey" role="img" aria-label={ariaLabel}>
      <div className="journey-track">
        <div className="journey-fill" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
      </div>
      <div className="journey-stops" style={{ height: 44 }}>
        {stops.map((s, i) => {
          const left = stops.length === 1 ? 100 : (i / (stops.length - 1)) * 100;
          const show = s.state !== "todo" || i === stops.length - 1;
          return (
            <div key={i} className={`journey-stop ${s.state === "done" ? "is-done" : s.state === "now" ? "is-now" : ""}`} style={{ left: `${left}%` }}>
              <span className="journey-pip" aria-hidden="true" />
              {show && (
                <span className="whitespace-nowrap text-[11px] font-medium" style={{ color: s.state === "todo" ? "var(--text-muted)" : "var(--text)" }}>
                  {s.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
