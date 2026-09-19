"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export function RoleDistributionDonut({ data }) {
  const has = data?.some((d) => d.value > 0);
  if (!has) return <ChartShell title="Roles" subtitle="Hue per role" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No data</div></ChartShell>;
  return (
    <ChartShell title="Roles" subtitle="Donut · categorical hue" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} stroke="var(--bg-elevated)" strokeWidth={2} />)}
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}

export function DeptMembershipBars({ data }) {
  if (!data?.length) return <ChartShell title="Members per department" subtitle="Top 6 · bar length = value" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No departments</div></ChartShell>;
  return (
    <ChartShell title="Members per department" subtitle="H-bar · value cue" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 88 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} width={96} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Members" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}
