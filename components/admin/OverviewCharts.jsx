"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function ThemedTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label ?? payload[0]?.name ?? payload[0]?.payload?.name}</p>
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function RoleDonut({ data }) {
  if (!data?.length || data.every((d) => d.value === 0)) {
    return <ChartShell title="Members by role" subtitle="Hue per role + value label — never color-alone" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No members yet</div></ChartShell>;
  }
  return (
    <ChartShell title="Members by role" subtitle="Categorical hue · size = count" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          {data.map((e, i) => (
            <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} stroke="var(--bg-elevated)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip content={<ThemedTooltip />} />
      </PieChart>
    </ChartShell>
  );
}

export function ProjectStatusBars({ data }) {
  if (!data?.length) {
    return <ChartShell title="Projects by status" subtitle="Horizontal bars · value on axis" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No projects yet</div></ChartShell>;
  }
  return (
    <ChartShell title="Projects by status" subtitle="Value bar · divider grouped" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 48 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.6} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} axisLine={false} tickLine={false} width={84} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Projects" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e, i) => (
            <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function ActivitySparklineChart({ data }) {
  if (!data?.length || data.every((d) => d.value === 0)) {
    return <ChartShell title="Activity — last 14 days" subtitle="Sequential line · saturation = volume" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No activity yet</div></ChartShell>;
  }
  // Reuse Area-style line via Bar micro view: simple bar for daily totals
  return (
    <ChartShell title="Activity — last 14 days" subtitle="Daily commits + PRs + reviews" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} interval={data.length > 10 ? 1 : 0} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
        <Tooltip content={<ThemedTooltip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Signals" fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}
