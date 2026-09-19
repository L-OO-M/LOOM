"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Tiny sparkline: 44px tall, no axes chrome, accent fill.
// Used in admin overview and student detail for 14-day activity.
export function Sparkline({ data, dataKey = "value", color = "var(--accent)", height = 44 }) {
  if (!Array.isArray(data) || data.length === 0) {
    return <div className="skel rounded-xl" style={{ height }} aria-hidden="true" />;
  }
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--line)", borderRadius: 12, fontSize: 12 }}
            labelStyle={{ color: "var(--text-muted)" }}
            itemStyle={{ color: "var(--text)" }}
            cursor={{ stroke: "var(--line)" }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={1.6}
            fill="url(#sparkFill)"
            dot={false}
            activeDot={{ r: 2.5, strokeWidth: 0, fill: color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
