"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from "recharts";
import { ChartShell, CATEGORICAL } from "@/components/loom/ChartShell";

function Tip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}>
      {label != null && <p className="font-semibold">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}{suffix}
        </p>
      ))}
    </div>
  );
}

function Empty({ height, message }) {
  return (
    <div className="grid h-full place-items-center text-center text-sm" style={{ color: "var(--text-muted)" }}>
      {message}
    </div>
  );
}

/* 1 — Who is in the roster, by level. A real headcount per level. */
export function RosterLevelBars({ data }) {
  if (!data?.length) {
    return (
      <ChartShell title="Roster by level" subtitle="Headcount per membership level" height={220}>
        <Empty height={220} message="No memberships yet." />
      </ChartShell>
    );
  }
  return (
    <ChartShell title="Roster by level" subtitle="Headcount per membership level" height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 84 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.45} />
          <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }} />
          <YAxis type="category" dataKey="name" width={80} tick={{ fill: "var(--text)", fontSize: 11 }}
            axisLine={false} tickLine={false} tickFormatter={(v) => String(v).replace("_", " ")} />
          <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
          <Bar dataKey="value" name="Members" radius={[0, 8, 8, 0]} isAnimationActive={false}>
            {data.map((e) => (
              <Cell key={e.name}
                fill={e.name === "dept_lead" ? "color-mix(in srgb, var(--success) 70%, transparent)"
                  : e.name === "core" ? "color-mix(in srgb, var(--warn) 74%, transparent)"
                    : "color-mix(in srgb, var(--info) 72%, transparent)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* 2 — What the chapter actually produced, by contribution kind.
       This is the chart that justifies itself: it answers "who is doing what". */
export function ContributionMix({ data }) {
  if (!data?.length) {
    return (
      <ChartShell title="Contributions by kind" subtitle="What the work actually was" height={220}>
        <Empty height={220} message="Nothing logged in the ledger yet." />
      </ChartShell>
    );
  }
  return (
    <ChartShell title="Contributions by kind" subtitle="What the work actually was" height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={46} outerRadius={74} paddingAngle={2} isAnimationActive={false}>
            {data.map((e, i) => (
              <Cell key={e.name} fill={`color-mix(in srgb, ${CATEGORICAL[i % CATEGORICAL.length]} 66%, transparent)`}
                stroke="var(--bg-elevated)" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<Tip />} />
          <Legend verticalAlign="bottom" height={28}
            formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{String(v).replace(/_/g, " ")}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* 3 — Seat fill for upcoming workshops. Replaces the old chart that plotted
       value=1 per workshop, which rendered every bar identical and said nothing.
       Events without a capacity are excluded rather than faked as full. */
export function WorkshopFill({ data }) {
  if (!data?.length) {
    return (
      <ChartShell title="Workshop fill rate" subtitle="Registered vs capacity" height={240}>
        <Empty height={240} message="No upcoming workshops with a seat cap." />
      </ChartShell>
    );
  }
  const rows = data.map((w) => ({
    name: w.name.length > 22 ? `${w.name.slice(0, 21)}…` : w.name,
    Registered: w.registered,
    Remaining: w.remaining
  }));
  return (
    <ChartShell title="Workshop fill rate" subtitle="Registered vs free seats" height={240}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--line)" }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={46} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} />
          <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
          <Legend verticalAlign="top" height={26}
            formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="Registered" stackId="a" fill="color-mix(in srgb, var(--accent) 72%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Remaining" stackId="a" fill="color-mix(in srgb, var(--line) 55%, transparent)" radius={[0, 0, 6, 6]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* 4 — Did people actually show up? Registered vs attended on past events. */
export function TurnoutBars({ data, turnoutPct }) {
  if (!data?.length) {
    return (
      <ChartShell title="Turnout on past events" subtitle="Registered vs attended" height={240}>
        <Empty height={240} message="No completed events in your departments yet." />
      </ChartShell>
    );
  }
  const rows = data.map((t) => ({
    name: t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name,
    Registered: t.registered,
    Attended: t.attended
  }));
  return (
    <ChartShell title="Turnout on past events"
      subtitle={turnoutPct == null ? "Registered vs attended" : `${turnoutPct}% of all registrations attended`} height={240}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--line)" }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={46} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} />
          <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
          <Legend verticalAlign="top" height={26}
            formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="Registered" fill="color-mix(in srgb, var(--info) 55%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="Attended" fill="color-mix(in srgb, var(--success) 72%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* 5 — Membership growth over six months. The trend a lead is actually judged on. */
export function GrowthLine({ data }) {
  if (!data?.length || data.length < 2) {
    return (
      <ChartShell title="Membership growth" subtitle="New joins, last 6 months" height={220}>
        <Empty height={220} message={data?.length ? "One month of history so far." : "No join history yet."} />
      </ChartShell>
    );
  }
  return (
    <ChartShell title="Membership growth" subtitle="New joins, last 6 months" height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.4} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} />
          <Tooltip content={<Tip />} />
          <Line type="monotone" dataKey="value" name="New members" stroke="var(--accent)" strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--accent)", strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}

/* 6 — Department health: headcount against ledger output. Surfaces a large
       department that is producing nothing. */
export function DeptHealthBars({ data }) {
  if (!data?.length) {
    return (
      <ChartShell title="Department health" subtitle="Members vs contributions" height={240}>
        <Empty height={240} message="No departments in your scope." />
      </ChartShell>
    );
  }
  return (
    <ChartShell title="Department health" subtitle="Members vs contributions logged" height={240}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.35} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--line)" }} tickLine={false} interval={0} angle={-18} textAnchor="end" height={46} />
          <YAxis allowDecimals={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} axisLine={{ stroke: "var(--line)" }} />
          <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
          <Legend verticalAlign="top" height={26}
            formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>} />
          <Bar dataKey="members" name="Members" fill="color-mix(in srgb, var(--info) 58%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="contributions" name="Contributions" fill="color-mix(in srgb, var(--accent) 70%, transparent)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartShell>
  );
}