import { describe, expect, it } from "vitest";
import {
  buildPracticeProgress,
  buildSessionScorecard,
  streakDays
} from "@/lib/practice-progress";
import { DAY_MS } from "@/lib/practice-domain";

const NOW = new Date("2026-11-20T10:00:00+05:30").getTime();
const HOUR = 3_600_000;

const QUESTIONS = [
  { id: "q1", title: "Two Sum", difficulty: "Easy", topic: "Arrays" },
  { id: "q2", title: "Number of Islands", difficulty: "Medium", topic: "Graphs" },
  { id: "q3", title: "Word Ladder", difficulty: "Hard", topic: "Graphs" }
];

function attempt(id, questionId, outcome, createdAt, sessionId = "s1") {
  return { id, questionId, sessionId, outcome, source: "self", createdAt };
}

describe("practice progress", () => {
  it("derives status, totals and accuracy without duplicating solved problems", () => {
    const progress = buildPracticeProgress({
      questions: QUESTIONS,
      solves: [{ questionId: "q1", acceptedAt: NOW - 2 * DAY_MS }],
      attempts: [
        attempt("a1", "q2", "attempted", NOW - 3 * DAY_MS),
        attempt("a2", "q2", "attempted", NOW - 2 * DAY_MS),
        attempt("a3", "q2", "solved", NOW - DAY_MS)
      ],
      now: NOW
    });

    expect(progress.totals).toMatchObject({
      total: 3,
      solved: 2,
      attempted: 2,
      inProgress: 0,
      notStarted: 1,
      accuracy: 100,
      completion: 67
    });
    expect(progress.byQuestion.find((row) => row.questionId === "q2")).toMatchObject({
      status: "solved",
      attempts: 3,
      verifiedSolveAt: null
    });
    expect(progress.byQuestion.find((row) => row.questionId === "q3")?.status).toBe("not_started");
  });

  it("keeps attempted-but-unsolved problems in progress", () => {
    const progress = buildPracticeProgress({
      questions: QUESTIONS,
      attempts: [attempt("a1", "q2", "attempted", NOW - HOUR)],
      now: NOW
    });

    expect(progress.totals).toMatchObject({
      total: 3,
      solved: 0,
      attempted: 1,
      inProgress: 1,
      notStarted: 2,
      accuracy: 0,
      completion: 0
    });
  });

  it("counts verified LeetCode solves and admin credit as solved", () => {
    const progress = buildPracticeProgress({
      questions: QUESTIONS,
      solves: [{ questionId: "q1", acceptedAt: NOW - HOUR }],
      corrections: [{ questionId: "q3", credited: true, acceptedAt: NOW - 2 * HOUR }],
      now: NOW
    });

    expect(progress.totals.solved).toBe(2);
    expect(progress.byQuestion.find((row) => row.questionId === "q1")?.verifiedSolveAt).toBe(NOW - HOUR);
    expect(progress.byQuestion.find((row) => row.questionId === "q3")?.verifiedSolveAt).toBe(NOW - 2 * HOUR);
  });

  it("builds a real difficulty split and fourteen-day timeline", () => {
    const progress = buildPracticeProgress({
      questions: QUESTIONS,
      solves: [{ questionId: "q1", acceptedAt: NOW - HOUR }],
      attempts: [attempt("a1", "q2", "attempted", NOW - HOUR)],
      now: NOW
    });

    expect(progress.difficulty).toEqual([
      { level: "Easy", total: 1, attempted: 1, solved: 1, accuracy: 100 },
      { level: "Medium", total: 1, attempted: 1, solved: 0, accuracy: 0 },
      { level: "Hard", total: 1, attempted: 0, solved: 0, accuracy: 0 }
    ]);
    expect(progress.timeline).toHaveLength(14);
    expect(progress.timeline.at(-1).solved).toBe(1);
    expect(progress.timeline.at(-1).activity).toBe(2);
  });
});

describe("practice streaks", () => {
  it("counts consecutive IST days and allows today to be empty", () => {
    expect(streakDays([NOW, NOW - DAY_MS, NOW - 2 * DAY_MS], NOW)).toBe(3);
    expect(streakDays([NOW - DAY_MS, NOW - 2 * DAY_MS], NOW)).toBe(2);
    expect(streakDays([], NOW)).toBe(0);
  });

  it("stops at a gap", () => {
    expect(streakDays([NOW, NOW - 2 * DAY_MS], NOW)).toBe(1);
  });
});

describe("practice session scorecard", () => {
  const session = {
    id: "s1",
    startedAt: NOW - 45 * 60_000,
    completedAt: NOW
  };

  it("counts unique problems, repeated attempts and verified solves", () => {
    const scorecard = buildSessionScorecard({
      session,
      questions: QUESTIONS,
      attempts: [
        attempt("a1", "q1", "attempted", NOW - 40 * 60_000),
        attempt("a2", "q1", "attempted", NOW - 30 * 60_000),
        attempt("a3", "q2", "solved", NOW - 20 * 60_000)
      ],
      solves: [{ questionId: "q1", acceptedAt: NOW - 10 * 60_000 }],
      now: NOW
    });

    expect(scorecard).toMatchObject({
      hasActivity: true,
      problemsAttempted: 2,
      problemsSolved: 2,
      unsolvedProblems: 0,
      accuracy: 100,
      score: 100,
      attemptsLogged: 3,
      unsuccessfulAttempts: 0,
      verifiedSolved: 1,
      selfSolved: 1
    });
    expect(scorecard.durationMs).toBe(45 * 60_000);
    expect(scorecard.badges.map((badge) => badge.key)).toContain("clean-sweep");
  });

  it("does not claim a solve that happened outside the session window", () => {
    const scorecard = buildSessionScorecard({
      session,
      questions: QUESTIONS,
      attempts: [attempt("a1", "q1", "attempted", NOW - 20 * 60_000)],
      solves: [{ questionId: "q1", acceptedAt: NOW - 2 * HOUR }],
      now: NOW
    });

    expect(scorecard).toMatchObject({
      hasActivity: true,
      problemsAttempted: 1,
      problemsSolved: 0,
      unsolvedProblems: 1,
      accuracy: 0,
      verifiedSolved: 0
    });
    expect(scorecard.improvements.length).toBeGreaterThan(0);
  });

  it("uses only attempts linked to the session", () => {
    const scorecard = buildSessionScorecard({
      session,
      questions: QUESTIONS,
      attempts: [
        attempt("a1", "q1", "attempted", NOW - 20 * 60_000),
        attempt("a2", "q2", "solved", NOW - 20 * 60_000, "other-session")
      ],
      now: NOW
    });

    expect(scorecard.problemsAttempted).toBe(1);
    expect(scorecard.problemsSolved).toBe(0);
  });

  it("reports no score when nothing was attempted", () => {
    const scorecard = buildSessionScorecard({
      session,
      questions: QUESTIONS,
      attempts: [],
      now: NOW
    });

    expect(scorecard.hasActivity).toBe(false);
    expect(scorecard.score).toBe(0);
    expect(scorecard.summary).toMatch(/no score/i);
    expect(scorecard.improvements).toEqual([]);
  });
});
