"use client";

/* Vertical timeline — for journeys, milestones, history, activity.
   state: "done" | "now" | "todo". The rail illuminates behind progress. */

export function Timeline({ children, className = "" }) {
  return <ol className={`tl ${className}`}>{children}</ol>;
}

export function TimelineItem({ state = "todo", title, meta, body, action, pop = false }) {
  const cls = state === "done" ? "is-done" : state === "now" ? "is-now" : "";
  return (
    <li className={`tl-item ${cls}`}>
      <span className={`tl-dot ${pop ? "node-pop" : ""}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="text-[0.95rem] font-semibold leading-6" style={{ color: "var(--text)" }}>{title}</p>
          {meta && <span className="meta shrink-0">{meta}</span>}
        </div>
        {body && <p className="mt-1 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{body}</p>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </li>
  );
}
