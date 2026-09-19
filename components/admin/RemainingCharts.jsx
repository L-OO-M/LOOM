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

export function TierDonut({ data }) {
  const has = data?.some((d) => d.value > 0);
  if (!has) return <ChartShell title="Badges by tier" subtitle="Bronze · Silver · Gold" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No badges</div></ChartShell>;
  return (
    <ChartShell title="Badges by tier" subtitle="Donut · hue = tier" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={e.name === "Gold" ? "#b45309" : e.name === "Silver" ? "#6b7280" : "#92400e"} stroke="var(--bg-elevated)" strokeWidth={2} />)}
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}

export function WeeklyIssuanceBars({ data }) {
  if (!data?.length) return <ChartShell title="Issuance · last 8 weeks" subtitle="Bar height = achievements" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>Nothing issued yet</div></ChartShell>;
  return (
    <ChartShell title="Issuance · last 8 weeks" subtitle="Temporal bar" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Issued" fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}

export function DeptSizeBars({ data }) {
  if (!data?.length) return <ChartShell title="Dept size" subtitle="Members per dept" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No members</div></ChartShell>;
  return (
    <ChartShell title="Dept size" subtitle="H-bar · value = members" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 88 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} width={96} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Members" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e, i) => <Cell key={e.name} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function VerticalSplitDonut({ data }) {
  if (!data?.every((d) => d.value >= 0) || data.every((d) => d.value === 0)) return <ChartShell title="By vertical" subtitle="Technical vs non-technical" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No departments</div></ChartShell>;
  return (
    <ChartShell title="By vertical" subtitle="Donut · hue = vertical" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          <Cell fill="var(--accent)" stroke="var(--bg-elevated)" strokeWidth={2} />
          <Cell fill="var(--info)" stroke="var(--bg-elevated)" strokeWidth={2} />
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}

export function ContestFunnelBars({ data }) {
  if (!data?.length) return <ChartShell title="Contests by status" subtitle="Funnel" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No contests</div></ChartShell>;
  return (
    <ChartShell title="Contests by status" subtitle="H-bar · status hue" height={220}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 88 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} allowDecimals={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} width={96} axisLine={false} tickLine={false} />
        <Tooltip content={<Tip />} />
        <Bar dataKey="value" name="Contests" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e) => <Cell key={e.name} fill={e.name === "Live" ? "var(--success)" : e.name === "Draft" ? "var(--line)" : "var(--text-muted)"} />)}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function ContestConversionBars({ data }) {
  if (!data?.length) return <ChartShell title="Top contests · funnel" subtitle="Registrations → submissions" height={240}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No contest activity</div></ChartShell>;
  return (
    <ChartShell title="Top contests · funnel" subtitle="Grouped bars · shape + value" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} interval={0} angle={-18} textAnchor="end" height={56} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="regs" name="Regs" fill="var(--info)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="subs" name="Subs" fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}
