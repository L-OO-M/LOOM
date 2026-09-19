"use client";

import { Pie, PieChart, Cell, Tooltip, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((p) => <p key={p.dataKey}>{p.name}: {p.value}</p>)}
    </div>
  );
}

export function RoadmapDonut({ done, total }) {
  const remaining = Math.max(0, total - done);
  const data = [
    { name: "Done", value: done },
    { name: "Remaining", value: remaining },
  ];
  if (total === 0) return <ChartShell title="Roadmap" subtitle="Donut · done vs remaining" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No nodes yet</div></ChartShell>;
  return (
    <ChartShell title="Roadmap" subtitle={`${done} / ${total} · ${Math.round((done / total) * 100)}%`} height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          <Cell fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth={2} />
          <Cell fill="var(--line)" stroke="var(--bg-elevated)" strokeWidth={2} />
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}

export function WeekBars({ days }) {
  const data = days?.map((d) => ({ label: d.label.slice(0, 3), value: d.hit ? 1 : 0, today: d.today })) ?? [];
  return (
    <ChartShell title="This week" subtitle="Bar height = active · today ring" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.3} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis hide domain={[0, 1]} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Active" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={i} fill={e.value ? "var(--accent)" : "var(--line)"} stroke={e.today ? "var(--accent)" : "transparent"} strokeWidth={e.today ? 1.5 : 0} />)}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}
