"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell } from "@/components/loom/ChartShell";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label}</p>
      {payload.map((p) => <p key={p.dataKey}>{p.name}: {p.value}</p>)}
    </div>
  );
}

export function ActivityBars({ data }) {
  if (!data?.length) return <ChartShell title="14-day activity" subtitle="Bar height = commits+PRs+reviews" height={200}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No activity</div></ChartShell>;
  return (
    <ChartShell title="14-day activity" subtitle="Temporal · height = signals" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Signals" fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}
