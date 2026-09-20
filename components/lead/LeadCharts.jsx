"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((p) => <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>)}
    </div>
  );
}

export function RosterLevelBars({ data }) {
  if (!data?.length) return <ChartShell title="Roster by level" subtitle="Dept-grouped" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No roster</div></ChartShell>;
  return (
    <ChartShell title="Roster by level" subtitle="H-bar · hue = level" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 72 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} width={84} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Members" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={e.name.includes("general") ? "color-mix(in srgb, var(--info) 72%, transparent)" : e.name.includes("core") ? "color-mix(in srgb, var(--warn) 74%, transparent)" : "color-mix(in srgb, var(--success) 70%, transparent)"} />)}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function WorkshopTimelineBars({ data }) {
  if (!data?.length) return <ChartShell title="Workshops timeline" subtitle="Next 8 · bar length = spaced by date" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No workshops</div></ChartShell>;
  return (
    <ChartShell title="Workshops timeline" subtitle="Bar = chronological slot" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis hide />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Workshops" fill="color-mix(in srgb, var(--accent) 68%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}

export function ApprovalDonut({ data }) {
  const has = data?.some((d) => d.value > 0);
  if (!has) return null;
  return (
    <ChartShell title="Queues at a glance" subtitle="Core + proposed events" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={72} paddingAngle={2} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={`color-mix(in srgb, ${CATEGORICAL[i % CATEGORICAL.length]} 64%, transparent)`} stroke="var(--bg-elevated)" strokeWidth={2} />)}
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}
