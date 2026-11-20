"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { RotateCcw, Sparkles, Target, X } from "lucide-react";
import { ProgressRing } from "@/components/motion/ProgressRing";
import { StatusPill } from "@/components/loom/primitives";

function formatDuration(value) {
  if (!Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function Metric({ value, label }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
      <p className="text-lg font-semibold leading-none" style={{ color: "var(--text)" }}>
        {value}
      </p>
      <p className="meta mt-1 leading-4">{label}</p>
    </div>
  );
}

export function PracticeScorecard({ scorecard, onClose, onReview, onRetry, onContinue }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!scorecard) return;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scorecard, onClose]);

  return (
    <AnimatePresence>
      {scorecard ? (
        <motion.div
          key="practice-scorecard"
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <div
            className="absolute inset-0"
            style={{ background: "rgba(0, 0, 0, 0.55)" }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-scorecard-title"
            className="relative z-10 my-auto w-full max-w-2xl rounded-3xl border p-5 sm:p-7"
            style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="meta">Practice session</p>
                <h2
                  id="practice-scorecard-title"
                  className="mt-1 text-xl font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  {scorecard.hasActivity ? "Session scorecard" : "Session recorded"}
                </h2>
                <p className="meta mt-1">
                  {scorecard.hasActivity
                    ? "Built from the attempts logged in this session and any accepted LeetCode solve in the same window."
                    : "No attempts were logged before you finished this session."}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost !p-2"
                aria-label="Close scorecard"
              >
                <X size={16} />
              </button>
            </div>

            {scorecard.hasActivity ? (
              <>
                <div className="mt-5 grid items-center gap-5 sm:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="flex flex-col items-center">
                    <ProgressRing value={scorecard.score} label="accuracy" />
                    <p className="meta mt-2">score out of 100</p>
                  </div>
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <StatusPill>{scorecard.problemsSolved} solved</StatusPill>
                      <StatusPill>{scorecard.problemsAttempted} attempted</StatusPill>
                      {scorecard.verifiedSolved > 0 ? (
                        <StatusPill>{scorecard.verifiedSolved} verified</StatusPill>
                      ) : null}
                    </div>
                    <p className="narrative mt-3 text-sm leading-6">{scorecard.summary}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <Metric value={scorecard.problemsAttempted} label="problems attempted" />
                      <Metric value={scorecard.problemsSolved} label="problems solved" />
                      <Metric value={scorecard.unsolvedProblems} label="still unsolved" />
                      <Metric value={scorecard.unsuccessfulAttempts} label="unsuccessful attempts" />
                      <Metric value={scorecard.attemptsLogged} label="attempts logged" />
                      <Metric value={formatDuration(scorecard.durationMs)} label="session duration" />
                    </div>
                  </div>
                </div>

                <div
                  className="mt-4 rounded-2xl border p-4"
                  style={{ borderColor: "var(--line)", background: "var(--bg)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                      Difficulty-wise performance
                    </p>
                    <p className="meta">attempted / solved</p>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {scorecard.difficulty.map((row) => (
                      <div key={row.level}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="meta">{row.level}</p>
                          <p className="meta">
                            {row.attempted} / {row.solved}
                          </p>
                        </div>
                        <div
                          className="mt-1.5 h-2 overflow-hidden rounded-full"
                          style={{ background: "var(--line)" }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${row.accuracy}%`, background: "var(--success)" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {scorecard.badges.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {scorecard.badges.map((badge) => (
                      <span
                        key={badge.key}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      >
                        <Sparkles size={13} />
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ) : null}

                {scorecard.improvements.length > 0 ? (
                  <div
                    className="mt-4 rounded-2xl border p-4"
                    style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
                  >
                    <div className="flex items-center gap-2">
                      <Target size={15} style={{ color: "var(--warn)" }} />
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                        Where to improve
                      </p>
                    </div>
                    <ul className="narrative mt-2 space-y-1.5 text-xs leading-5">
                      {scorecard.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : (
              <div
                className="mt-5 rounded-2xl border p-5"
                style={{ borderColor: "var(--line)", background: "var(--bg)" }}
              >
                <p className="narrative text-sm leading-6">
                  This session has no score because no attempts were logged. Start another session
                  and use “Log attempt” or “Mark solved here” on a problem, or link LeetCode and
                  refresh so accepted submissions are verified.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {scorecard.hasActivity ? (
                <>
                  <button type="button" className="btn-ink" onClick={onReview}>
                    Review attempted
                  </button>
                  <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={onRetry}>
                    <RotateCcw size={14} /> Retry unsolved
                  </button>
                  <button type="button" className="btn-ghost" onClick={onContinue}>
                    Continue practicing
                  </button>
                </>
              ) : (
                <button type="button" className="btn-ink" onClick={onContinue}>
                  Start another session
                </button>
              )}
              <button type="button" className="btn-ghost ml-auto" onClick={onClose}>
                Return to practice
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
