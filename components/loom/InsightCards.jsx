import Link from "next/link";
import { INSIGHT_TONE_LABEL } from "@/lib/insights";

/**
 * One insight, rendered. The card always carries the tone as a word, not only
 * as a colour, so meaning survives greyscale and screen readers. `metric` is
 * the number the sentence is built from, so a reader can check the claim
 * without trusting the copy.
 */
const TONE_COLOR = {
  risk: "var(--danger)",
  watch: "var(--warn)",
  next: "var(--accent)",
  win: "var(--success)"
};

export function InsightCard({ insight }) {
  if (!insight) return null;
  const tone = TONE_COLOR[insight.tone] || "var(--accent)";
  return (
    <article
      className="flex min-w-0 flex-col rounded-2xl border p-5"
      style={{
        borderColor: "var(--line)",
        borderLeft: `3px solid ${tone}`,
        background: "var(--bg-elevated)"
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: tone }}
        >
          {INSIGHT_TONE_LABEL[insight.tone] || "Signal"}
        </span>
        {insight.metric && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>
            {insight.metric}
          </span>
        )}
      </div>
      <h3 className="mt-2.5 text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
        {insight.title}
      </h3>
      <p className="mt-2 flex-1 text-[13px] leading-6" style={{ color: "var(--text-muted)" }}>
        {insight.body}
      </p>
      {insight.action && (
        <Link
          href={insight.action.href}
          prefetch={false}
          className="mt-3 inline-flex text-xs font-semibold hover:underline"
          style={{ color: "var(--accent)" }}
        >
          {insight.action.label} &rarr;
        </Link>
      )}
    </article>
  );
}

export function InsightCards({ insights = [], columns = 2, className = "" }) {
  const list = (insights || []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div className={`grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""} ${className}`}>
      {list.map((insight) => (
        <InsightCard key={insight.id} insight={insight} />
      ))}
    </div>
  );
}
