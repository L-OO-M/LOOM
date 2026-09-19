"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function TooltipCard({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

export function DomainBars({ data }) {
  if (!data.length) return <ChartShell title="Domain distribution" subtitle="Categorical hue · bar length = share" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No distribution yet</div></ChartShell>;
  return (
    <ChartShell title="Domain distribution" subtitle="Horizontal bars · value = members" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 72 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
        <Tooltip content={<TooltipCard />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Members" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e, i) => (
            <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function ActivityLine({ data }) {
  if (!data.length) return <ChartShell title="Activity — last 30 days" subtitle="Sequential line · temporal motion" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No history yet</div></ChartShell>;
  return (
    <ChartShell title="Activity — last 30 days" subtitle="Daily active students · consistency overlay" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} interval={data.length > 14 ? 2 : 0} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip content={<TooltipCard />} cursor={{ stroke: "var(--line)" }} />
        <Area type="monotone" dataKey="active" name="Active" stroke="var(--accent)" strokeWidth={2} fill="url(#actFill)" dot={false} activeDot={{ r: 3, fill: "var(--accent)" }} isAnimationActive={false} />
        <Area type="monotone" dataKey="consistency" name="Consistency %" stroke="var(--info, #6b8db5)" strokeWidth={1.5} fill="none" dot={false} isAnimationActive={false} />
      </AreaChart>
    </ChartShell>
  );
}

export function BottleneckBars({ data }) {
  if (!data.length) return <ChartShell title="Bottleneck nodes" subtitle="Drop-off % · danger hue when >50%" height={260}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No funnel data yet</div></ChartShell>;
  return (
    <ChartShell title="Bottleneck nodes — highest drop-off" subtitle="Pre-attentive value (bar length) + hue (danger)" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 96 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} />
        <XAxis type="number" domain={[0, 100]} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} width={110} axisLine={false} tickLine={false} />
        <Tooltip content={<TooltipCard />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="drop" name="Drop-off %" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e) => (
            <Cell key={e.name} fill={e.drop > 50 ? "var(--danger)" : "var(--warn, #d68a1a)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}
