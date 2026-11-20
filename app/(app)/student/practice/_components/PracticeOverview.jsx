"use client";

import { ProgressRing } from "@/components/motion/ProgressRing";
import { StatTile } from "@/components/loom/StatTiles";

export function PracticeOverview({ progress }) {
  const { totals, byQuestion } = progress;
  const verified = byQuestion.filter((question) => question.verifiedSolveAt).length;
  const selfOnly = byQuestion.filter(
    (question) => !question.verifiedSolveAt && question.selfSolvedAt
  ).length;
  const attemptedPct = totals.total
    ? Math.round((totals.attempted / totals.total) * 100)
    : 0;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div
        className="flex flex-col items-center justify-center rounded-2xl border p-5 text-center"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <ProgressRing value={totals.completion} label="complete" />
        <p className="mt-3 text-sm font-semibold" style={{ color: "var(--text)" }}>
          {totals.solved} of {totals.total} solved
        </p>
        <p className="meta mt-1">
          {verified} verified / {selfOnly} self-reported
        </p>
        <p className="narrative mt-2 text-xs leading-5">
          Verified counts come from accepted LeetCode submissions. Self-reported solves are kept
          separate and never score chapter standing.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile
          value={totals.attempted}
          label="problems attempted, including solved"
          pct={attemptedPct}
        />
        <StatTile value={totals.inProgress} label="attempted and still unsolved" />
        <StatTile value={totals.notStarted} label="not started yet" />
        <StatTile
          value={`${totals.accuracy}%`}
          label="accuracy across attempted problems"
          pct={totals.accuracy}
        />
        <StatTile
          value={totals.sessions}
          label={`completed practice session${totals.sessions === 1 ? "" : "s"}`}
        />
        <StatTile
          value={totals.streak ? `${totals.streak} day${totals.streak === 1 ? "" : "s"}` : "—"}
          label="recorded activity streak in IST"
        />
      </div>
    </div>
  );
}
