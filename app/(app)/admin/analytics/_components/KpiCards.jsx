"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { compact } from "@/lib/analytics";

const PERIOD_NOUN = { daily: "day", monthly: "month", yearly: "year" };

export function KpiCards({ kpis, period, loading }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="skel" style={{ height: 12, width: "45%" }} />
            <div className="skel mt-3" style={{ height: 26, width: "60%" }} />
            <div className="skel mt-3" style={{ height: 12, width: "70%" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((k) => {
        const up = k.trend === "up";
        const down = k.trend === "down";
        const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
        return (
          <article
            key={k.id}
            className="rounded-xl border p-4 transition hover:shadow-sm"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)", boxShadow: "0 1px 2px rgba(16,19,20,0.04)" }}
            aria-label={`${k.title}: ${compact(k.value)}`}
          >
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
              {k.live && (
                <span className="relative flex size-2" aria-label="Live">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-green-600" />
                </span>
              )}
              {k.title}
            </h3>
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className="text-[22px] font-bold tabular-nums leading-none" style={{ color: "var(--text)" }}>
                {compact(k.value)}
              </p>
              <span
                className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
                style={
                  up
                    ? { color: "#15803d", background: "rgba(34,197,94,0.12)" }
                    : down
                      ? { color: "#be123c", background: "rgba(244,63,94,0.10)" }
                      : { color: "var(--text-muted)", background: "var(--bg-muted)" }
                }
              >
                <Icon size={12} aria-hidden="true" />
                {k.pct.toFixed(1)}%
              </span>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {k.live ? "Live now · active in the last 30 min" : `Compare to last ${PERIOD_NOUN[period] || "month"}`}
            </p>
          </article>
        );
      })}
    </div>
  );
}
