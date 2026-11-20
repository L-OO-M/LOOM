"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartShell, LegendDot } from "@/components/loom/ChartShell";
import { StatusPill } from "@/components/loom/primitives";

const KIND_LABEL = {
  verified_solve: "Verified solve",
  self_solved: "Marked solved here",
  attempt: "Attempt logged"
};

const KIND_COLOR = {
  verified_solve: "var(--success)",
  self_solved: "var(--warn)",
  attempt: "var(--info, #6b8db5)"
};

const STATUS_LABEL = {
  solved: "Solved",
  attempted: "Attempted",
  not_started: "Not started"
};

function formatWhen(value) {
  if (!value) return "No activity yet";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-xs shadow-lg"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--line)", color: "var(--text)" }}
    >
      <p className="font-semibold">{label ?? payload[0]?.name}</p>
      {payload.map((item) => (
        <p key={item.dataKey}>
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <p className="narrative text-xs leading-5">{children}</p>
    </div>
  );
}

export function PracticeAnalytics({ progress }) {
  const { totals, difficulty, timeline, activity, byQuestion } = progress;
  const distribution = [
    { name: "Solved", value: totals.solved, color: "var(--success)" },
    { name: "In progress", value: totals.inProgress, color: "var(--warn)" },
    { name: "Not started", value: totals.notStarted, color: "var(--line)" }
  ].filter((item) => item.value > 0);
  const difficultyData = difficulty.map((row) => ({
    level: row.level,
    solved: row.solved,
    inProgress: Math.max(0, row.attempted - row.solved)
  }));
  const recordedQuestions = byQuestion.filter((question) => question.status !== "not_started");

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <ChartShell
        title="Solved vs attempted"
        subtitle={`${totals.solved} solved / ${totals.attempted} attempted / ${totals.total} available`}
        height={220}
      >
        {distribution.length === 0 ? (
          <EmptyNote>No practice problem has been attempted yet.</EmptyNote>
        ) : (
          <PieChart>
            <Pie
              data={distribution}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={54}
              outerRadius={78}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {distribution.map((item) => (
                <Cell key={item.name} fill={item.color} stroke="var(--bg-elevated)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        )}
      </ChartShell>

      <ChartShell
        title="Difficulty-wise performance"
        subtitle="Attempted problems, split into solved and still open"
        height={220}
        right={
          <div className="flex flex-wrap justify-end gap-2">
            <LegendDot color="var(--success)" label="Solved" />
            <LegendDot color="var(--warn)" label="Open" />
          </div>
        }
      >
        <BarChart data={difficultyData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="level"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip content={<Tip />} cursor={{ fill: "color-mix(in srgb, var(--accent) 6%, transparent)" }} />
          <Bar dataKey="solved" name="Solved" stackId="difficulty" fill="var(--success)" radius={[0, 0, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="inProgress" name="Open" stackId="difficulty" fill="var(--warn)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartShell>

      <ChartShell
        title="Progress over time"
        subtitle="Last 14 days: first solves and logged activity"
        height={220}
        right={
          <div className="flex flex-wrap justify-end gap-2">
            <LegendDot color="var(--accent)" label="First solves" />
            <LegendDot color="var(--info, #6b8db5)" label="Activity" />
          </div>
        }
      >
        <ComposedChart data={timeline} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
            interval={2}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip content={<Tip />} />
          <Bar dataKey="activity" name="Activity" fill="var(--info, #6b8db5)" opacity={0.35} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line
            type="monotone"
            dataKey="solved"
            name="First solves"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartShell>

      <div
        className="rounded-2xl border p-4 sm:p-5"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Recent activity
            </p>
            <p className="meta mt-0.5 normal-case tracking-normal">Latest recorded attempts and solves</p>
          </div>
          <StatusPill>{activity.length ? `${activity.length} shown` : "none yet"}</StatusPill>
        </div>
        {activity.length === 0 ? (
          <p className="narrative mt-4 text-xs leading-5">
            No practice activity is recorded yet. Link LeetCode and refresh, or start a session and
            log an attempt.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {activity.slice(0, 7).map((item) => (
              <li key={item.id} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ background: KIND_COLOR[item.kind] || "var(--line)" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {item.title}
                  </span>
                  <span className="meta">
                    {KIND_LABEL[item.kind] || "Activity"}
                    {item.difficulty ? <span className="dot-sep">{item.difficulty}</span> : null}
                  </span>
                </span>
                <span className="meta shrink-0">{formatWhen(item.at)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div
        className="rounded-2xl border p-4 sm:p-5 lg:col-span-2"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
              Problem-wise record
            </p>
            <p className="meta mt-0.5 normal-case tracking-normal">
              Only problems with recorded activity appear here.
            </p>
          </div>
          <StatusPill>{recordedQuestions.length} recorded</StatusPill>
        </div>
        {recordedQuestions.length === 0 ? (
          <p className="narrative mt-4 text-xs leading-5">
            Every available problem is still not started.
          </p>
        ) : (
          <ul className="mt-3 divide-y" style={{ borderColor: "var(--line)" }}>
            {recordedQuestions.map((question) => (
              <li
                key={question.questionId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold" style={{ color: "var(--text)" }}>
                    {question.title}
                  </span>
                  <span className="meta">
                    {question.difficulty || "Practice"}
                    {question.topic ? <span className="dot-sep">{question.topic}</span> : null}
                    {question.attempts ? (
                      <span className="dot-sep">
                        {question.attempts} logged attempt{question.attempts === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span className="dot-sep">{formatWhen(question.lastActivityAt)}</span>
                  </span>
                </span>
                <span className="meta shrink-0">
                  {question.verifiedSolveAt
                    ? "verified solve"
                    : question.selfSolvedAt
                      ? "self-reported solve"
                      : "no solve yet"}
                </span>
                <StatusPill>{STATUS_LABEL[question.status] || "Not started"}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
