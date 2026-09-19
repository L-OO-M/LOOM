"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg" style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      <p className="font-semibold">{label ?? payload[0]?.name ?? payload[0]?.payload?.name}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>{p.name}: {typeof p.value === "number" ? p.value.toLocaleString("en-IN") : p.value}</p>
      ))}
    </div>
  );
}

export function ExpenseStatusDonut({ data }) {
  const has = data?.some((d) => d.value > 0);
  if (!has) return <ChartShell title="Expenses by status" subtitle="Donut · hue = status · label = count" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No expenses yet</div></ChartShell>;
  return (
    <ChartShell title="Expenses by status" subtitle="Hue: pending amber · approved success · rejected danger" height={220}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          {data.map((e, i) => {
            const fill = e.name === "approved" ? "var(--success)" : e.name === "rejected" ? "var(--danger)" : "var(--warn)";
            return <Cell key={e.name} fill={fill} stroke="var(--bg-elevated)" strokeWidth={2} />;
          })}
        </Pie>
        <Tooltip content={<Tip />} />
      </PieChart>
    </ChartShell>
  );
}

export function SponsorshipPipelineBars({ data }) {
  if (!data?.length || data.every((d) => d.value === 0)) {
    return <ChartShell title="Sponsorship pipeline" subtitle="Bars · value = amount" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No sponsors yet</div></ChartShell>;
  }
  return (
    <ChartShell title="Sponsorship pipeline" subtitle="Value bar · status hue" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 16, bottom: 4, left: 72 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
        <XAxis type="number" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`} />
        <YAxis type="category" dataKey="name" tick={{ fill: "var(--text)", fontSize: 11 }} axisLine={false} tickLine={false} width={84} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Amount" radius={[0, 8, 8, 0]} isAnimationActive={false}>
          {data.map((e) => {
            const fill = e.name === "received" ? "var(--success)" : e.name === "committed" ? "var(--warn)" : "var(--info)";
            return <Cell key={e.name} fill={fill} />;
          })}
        </Bar>
      </BarChart>
    </ChartShell>
  );
}

export function MonthlyExpenseBars({ data }) {
  if (!data?.length) return <ChartShell title="Monthly spend" subtitle="Last 6 months · bar height = approved ₹" height={220}><div className="grid h-full place-items-center text-sm" style={{ color: "var(--text-muted)" }}>No approved spend yet</div></ChartShell>;
  return (
    <ChartShell title="Monthly spend" subtitle="Temporal bar · height = value" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
        <YAxis tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}`} width={36} />
        <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
        <Bar dataKey="value" name="Approved ₹" fill="var(--accent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartShell>
  );
}
