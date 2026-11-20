import { DAY_MS, IST_OFFSET_MS } from "@/lib/practice-domain";

const LEVELS = ["Easy", "Medium", "Hard"];

const STATUS = {
  notStarted: "not_started",
  attempted: "attempted",
  solved: "solved"
};

function toMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) return new Date(value).getTime();
  return NaN;
}

function maxFinite(...values) {
  let result = null;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    if (result === null || value > result) result = value;
  }
  return result;
}

function istDayIndex(value) {
  return Math.floor((value + IST_OFFSET_MS) / DAY_MS);
}

function dayLabel(index) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short"
  }).format(index * DAY_MS - IST_OFFSET_MS + 12 * 3_600_000);
}

function normalizeQuestion(row) {
  return {
    id: String(row.id),
    title: row.title || "Practice problem",
    difficulty: row.difficulty || "",
    topic: row.topic || ""
  };
}

function normalizeSolve(row) {
  return {
    questionId: String(row.questionId ?? row.question_id),
    acceptedAt: toMs(row.acceptedAt ?? row.accepted_at)
  };
}

function normalizeCorrection(row) {
  return {
    questionId: String(row.questionId ?? row.question_id),
    credited: row.credited === true,
    acceptedAt: toMs(row.acceptedAt ?? row.accepted_at)
  };
}

function normalizeAttempt(row) {
  const sessionId = row.sessionId ?? row.session_id;
  return {
    id: String(row.id),
    questionId: String(row.questionId ?? row.question_id),
    sessionId: sessionId ? String(sessionId) : null,
    outcome: row.outcome === "solved" ? "solved" : "attempted",
    source: row.source === "leetcode" ? "leetcode" : "self",
    createdAt: toMs(row.createdAt ?? row.created_at)
  };
}

function normalizeSession(row) {
  return {
    id: String(row.id),
    startedAt: toMs(row.startedAt ?? row.started_at),
    completedAt: toMs(row.completedAt ?? row.completed_at)
  };
}

export function streakDays(timestamps = [], now = Date.now()) {
  const days = new Set();
  for (const value of timestamps) {
    const at = toMs(value);
    if (Number.isFinite(at)) days.add(istDayIndex(at));
  }
  if (!days.size) return 0;
  let cursor = istDayIndex(now);
  if (!days.has(cursor)) cursor -= 1;
  let count = 0;
  while (days.has(cursor)) {
    count += 1;
    cursor -= 1;
  }
  return count;
}

function computeSessionScorecard({ session, attempts, solves, corrections, questions, now }) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const scoped = attempts.filter((attempt) => attempt.sessionId === session.id);
  const attemptedIds = new Set(scoped.map((attempt) => attempt.questionId));
  const solvedIds = new Set(
    scoped.filter((attempt) => attempt.outcome === "solved").map((attempt) => attempt.questionId)
  );
  const verifiedIds = new Set();
  const end = Number.isFinite(session.completedAt) ? session.completedAt : now;

  for (const solve of solves) {
    if (!attemptedIds.has(solve.questionId)) continue;
    if (!Number.isFinite(solve.acceptedAt)) continue;
    if (solve.acceptedAt < session.startedAt || solve.acceptedAt > end) continue;
    solvedIds.add(solve.questionId);
    verifiedIds.add(solve.questionId);
  }
  for (const correction of corrections) {
    if (!correction.credited || !attemptedIds.has(correction.questionId)) continue;
    if (!Number.isFinite(correction.acceptedAt)) continue;
    if (correction.acceptedAt < session.startedAt || correction.acceptedAt > end) continue;
    solvedIds.add(correction.questionId);
    verifiedIds.add(correction.questionId);
  }

  const problemsAttempted = attemptedIds.size;
  const problemsSolved = solvedIds.size;
  const unsolvedProblems = problemsAttempted - problemsSolved;
  const accuracy = problemsAttempted
    ? Math.round((problemsSolved / problemsAttempted) * 100)
    : 0;
  const durationMs = Number.isFinite(session.completedAt)
    ? Math.max(0, session.completedAt - session.startedAt)
    : null;
  const unsuccessfulAttempts = scoped.filter(
    (attempt) => !solvedIds.has(attempt.questionId)
  ).length;
  const selfSolvedProblems = new Set(
    scoped
      .filter((attempt) => attempt.outcome === "solved")
      .map((attempt) => attempt.questionId)
  ).size;

  const difficulty = LEVELS.map((level) => ({ level, attempted: 0, solved: 0, accuracy: 0 }));
  const difficultyByLevel = new Map(difficulty.map((row) => [row.level, row]));
  for (const questionId of attemptedIds) {
    const question = questionById.get(questionId);
    const row = question ? difficultyByLevel.get(question.difficulty) : null;
    if (!row) continue;
    row.attempted += 1;
    if (solvedIds.has(questionId)) row.solved += 1;
  }
  for (const row of difficulty) {
    row.accuracy = row.attempted ? Math.round((row.solved / row.attempted) * 100) : 0;
  }

  const improvements = [];
  if (problemsAttempted > 0) {
    const weakest = difficulty
      .filter((row) => row.attempted > 0 && row.solved < row.attempted)
      .sort((left, right) => left.accuracy - right.accuracy)[0];
    if (weakest) {
      improvements.push(
        `Revisit ${weakest.level.toLowerCase()} problems: ${weakest.solved} of ${weakest.attempted} attempted are recorded as solved.`
      );
    }
    for (const questionId of attemptedIds) {
      if (solvedIds.has(questionId)) continue;
      const question = questionById.get(questionId);
      if (!question) continue;
      improvements.push(`${question.title} (${question.difficulty}) is still unsolved in this session.`);
      if (improvements.length >= 4) break;
    }
  }

  const badges = [];
  if (problemsSolved > 0) {
    badges.push({
      key: "on-the-board",
      label: "On the board",
      detail: `${problemsSolved} problem${problemsSolved === 1 ? "" : "s"} recorded as solved.`
    });
  }
  if (verifiedIds.size > 0) {
    badges.push({
      key: "verified",
      label: "LeetCode verified",
      detail: `${verifiedIds.size} solve${verifiedIds.size === 1 ? "" : "s"} backed by an accepted submission.`
    });
  }
  if (problemsAttempted > 0 && unsolvedProblems === 0) {
    badges.push({
      key: "clean-sweep",
      label: "Clean sweep",
      detail: "Every problem attempted in this session is solved."
    });
  }
  if (problemsSolved >= 3) {
    badges.push({
      key: "momentum",
      label: "Momentum",
      detail: "Three or more problems solved in one session."
    });
  }
  if (unsolvedProblems > 0 && problemsSolved > 0) {
    badges.push({
      key: "kept-going",
      label: "Kept going",
      detail: "You recorded solves and left problems to revisit."
    });
  }

  let summary;
  if (problemsAttempted === 0) {
    summary = "No problems were logged in this session, so there is no score to report.";
  } else if (unsolvedProblems === 0) {
    summary = "Every problem logged in this session is recorded as solved.";
  } else if (accuracy >= 70) {
    summary = "Most of the problems you logged converted into solves. Revisit the rest before the next session.";
  } else if (accuracy >= 40) {
    summary = "A balanced session. Revisit the unsolved problems while the approach is still fresh.";
  } else {
    summary = "This session has more unsolved than solved problems. Retry the unsolved set before moving on.";
  }

  return {
    sessionId: session.id,
    startedAt: session.startedAt,
    completedAt: Number.isFinite(session.completedAt) ? session.completedAt : null,
    durationMs,
    hasActivity: problemsAttempted > 0,
    score: accuracy,
    accuracy,
    attemptsLogged: scoped.length,
    problemsAttempted,
    problemsSolved,
    unsolvedProblems,
    unsuccessfulAttempts,
    verifiedSolved: verifiedIds.size,
    selfSolved: selfSolvedProblems,
    difficulty,
    badges,
    summary,
    improvements
  };
}

export function buildSessionScorecard({
  session,
  attempts = [],
  solves = [],
  corrections = [],
  questions = [],
  now = Date.now()
} = {}) {
  if (!session) return null;
  const normalizedSession = normalizeSession(session);
  if (!Number.isFinite(normalizedSession.startedAt)) return null;
  const normalizedQuestions = questions
    .map(normalizeQuestion)
    .filter((question) => question.id);
  return computeSessionScorecard({
    session: normalizedSession,
    attempts: attempts.map(normalizeAttempt).filter((attempt) => Number.isFinite(attempt.createdAt)),
    solves: solves.map(normalizeSolve).filter((solve) => Number.isFinite(solve.acceptedAt)),
    corrections: corrections.map(normalizeCorrection).filter((correction) => correction.credited),
    questions: normalizedQuestions,
    now
  });
}

export function buildPracticeProgress({
  questions = [],
  solves = [],
  corrections = [],
  attempts = [],
  sessions = [],
  now = Date.now()
} = {}) {
  const questionList = [];
  const questionIds = new Set();
  for (const row of questions) {
    const question = normalizeQuestion(row);
    if (!question.id || questionIds.has(question.id)) continue;
    questionIds.add(question.id);
    questionList.push(question);
  }

  const solveRows = solves
    .map(normalizeSolve)
    .filter((solve) => questionIds.has(solve.questionId) && Number.isFinite(solve.acceptedAt) && solve.acceptedAt <= now);
  const correctionRows = corrections
    .map(normalizeCorrection)
    .filter(
      (correction) =>
        correction.credited &&
        questionIds.has(correction.questionId) &&
        Number.isFinite(correction.acceptedAt) &&
        correction.acceptedAt <= now
    );
  const attemptRows = attempts
    .map(normalizeAttempt)
    .filter((attempt) => questionIds.has(attempt.questionId) && Number.isFinite(attempt.createdAt) && attempt.createdAt <= now);

  const verifiedByQuestion = new Map();
  for (const solve of solveRows) {
    const prior = verifiedByQuestion.get(solve.questionId);
    if (prior === undefined || solve.acceptedAt < prior) {
      verifiedByQuestion.set(solve.questionId, solve.acceptedAt);
    }
  }
  for (const correction of correctionRows) {
    const prior = verifiedByQuestion.get(correction.questionId);
    if (prior === undefined || correction.acceptedAt < prior) {
      verifiedByQuestion.set(correction.questionId, correction.acceptedAt);
    }
  }

  const selfSolvedByQuestion = new Map();
  const attemptsByQuestion = new Map();
  const lastAttemptByQuestion = new Map();
  for (const attempt of attemptRows) {
    const list = attemptsByQuestion.get(attempt.questionId) || [];
    list.push(attempt);
    attemptsByQuestion.set(attempt.questionId, list);
    const priorLast = lastAttemptByQuestion.get(attempt.questionId);
    if (priorLast === undefined || attempt.createdAt > priorLast) {
      lastAttemptByQuestion.set(attempt.questionId, attempt.createdAt);
    }
    if (attempt.outcome === "solved") {
      const priorSolved = selfSolvedByQuestion.get(attempt.questionId);
      if (priorSolved === undefined || attempt.createdAt < priorSolved) {
        selfSolvedByQuestion.set(attempt.questionId, attempt.createdAt);
      }
    }
  }

  const solvedAtByQuestion = new Map();
  for (const question of questionList) {
    const solvedAt = maxFinite(
      verifiedByQuestion.get(question.id),
      selfSolvedByQuestion.get(question.id)
    );
    if (solvedAt !== null) solvedAtByQuestion.set(question.id, solvedAt);
  }

  const byQuestion = questionList.map((question) => {
    const solvedAt = solvedAtByQuestion.get(question.id);
    const attemptEvents = attemptsByQuestion.get(question.id) || [];
    const status =
      solvedAt !== undefined
        ? STATUS.solved
        : attemptEvents.length > 0
          ? STATUS.attempted
          : STATUS.notStarted;
    const lastAttemptAt = lastAttemptByQuestion.get(question.id);
    return {
      questionId: question.id,
      title: question.title,
      difficulty: question.difficulty,
      topic: question.topic,
      status,
      attempts: attemptEvents.length,
      lastAttemptAt: lastAttemptAt ?? null,
      lastActivityAt: maxFinite(lastAttemptAt, solvedAt),
      verifiedSolveAt: verifiedByQuestion.get(question.id) ?? null,
      selfSolvedAt: selfSolvedByQuestion.get(question.id) ?? null,
      firstSolvedAt: solvedAt ?? null
    };
  });

  const total = questionList.length;
  const solved = byQuestion.filter((question) => question.status === STATUS.solved).length;
  const attempted = byQuestion.filter((question) => question.status !== STATUS.notStarted).length;
  const inProgress = attempted - solved;
  const notStarted = total - attempted;
  const notSolved = total - solved;
  const accuracy = attempted ? Math.round((solved / attempted) * 100) : 0;
  const completion = total ? Math.round((solved / total) * 100) : 0;

  const difficulty = LEVELS.map((level) => ({ level, total: 0, attempted: 0, solved: 0, accuracy: 0 }));
  const difficultyByLevel = new Map(difficulty.map((row) => [row.level, row]));
  for (const question of byQuestion) {
    const row = difficultyByLevel.get(question.difficulty);
    if (!row) continue;
    row.total += 1;
    if (question.status !== STATUS.notStarted) row.attempted += 1;
    if (question.status === STATUS.solved) row.solved += 1;
  }
  for (const row of difficulty) {
    row.accuracy = row.attempted ? Math.round((row.solved / row.attempted) * 100) : 0;
  }

  const activity = [];
  for (const attempt of attemptRows) {
    activity.push({
      id: `attempt:${attempt.id}`,
      kind: attempt.outcome === "solved" ? "self_solved" : "attempt",
      source: attempt.source,
      questionId: attempt.questionId,
      at: attempt.createdAt
    });
  }
  for (const [questionId, at] of verifiedByQuestion) {
    activity.push({
      id: `verified:${questionId}`,
      kind: "verified_solve",
      source: "leetcode",
      questionId,
      at
    });
  }
  const questionById = new Map(questionList.map((question) => [question.id, question]));
  const recentActivity = activity
    .map((item) => {
      const question = questionById.get(item.questionId);
      return {
        ...item,
        title: question?.title || "Practice problem",
        difficulty: question?.difficulty || "",
        topic: question?.topic || ""
      };
    })
    .sort((left, right) => right.at - left.at || String(left.id).localeCompare(String(right.id)))
    .slice(0, 20);

  const todayIndex = istDayIndex(now);
  const solvedByDay = new Map();
  for (const at of solvedAtByQuestion.values()) {
    const index = istDayIndex(at);
    solvedByDay.set(index, (solvedByDay.get(index) || 0) + 1);
  }
  const activityByDay = new Map();
  for (const attempt of attemptRows) {
    const index = istDayIndex(attempt.createdAt);
    activityByDay.set(index, (activityByDay.get(index) || 0) + 1);
  }
  for (const at of verifiedByQuestion.values()) {
    const index = istDayIndex(at);
    activityByDay.set(index, (activityByDay.get(index) || 0) + 1);
  }
  const timeline = Array.from({ length: 14 }, (_, offset) => {
    const index = todayIndex - 13 + offset;
    return {
      dayIndex: index,
      label: dayLabel(index),
      solved: solvedByDay.get(index) || 0,
      activity: activityByDay.get(index) || 0
    };
  });

  const normalizedSessions = sessions
    .map(normalizeSession)
    .filter((session) => Number.isFinite(session.startedAt))
    .sort((left, right) => right.startedAt - left.startedAt);
  const completedSessions = normalizedSessions.filter((session) => Number.isFinite(session.completedAt));
  const activeSession = normalizedSessions.find((session) => !Number.isFinite(session.completedAt)) || null;

  const sessionScorecards = completedSessions.slice(0, 25).map((session) =>
    computeSessionScorecard({
      session,
      attempts: attemptRows,
      solves: solveRows,
      corrections: correctionRows,
      questions: questionList,
      now
    })
  );

  const activeTimestamps = [
    ...attemptRows.map((attempt) => attempt.createdAt),
    ...verifiedByQuestion.values()
  ];

  return {
    generatedAt: now,
    totals: {
      total,
      solved,
      attempted,
      notSolved,
      inProgress,
      notStarted,
      accuracy,
      completion,
      sessions: completedSessions.length,
      streak: streakDays(activeTimestamps, now)
    },
    difficulty,
    timeline,
    activity: recentActivity,
    byQuestion,
    sessions: sessionScorecards.map((scorecard) => ({
      id: scorecard.sessionId,
      startedAt: scorecard.startedAt,
      completedAt: scorecard.completedAt,
      durationMs: scorecard.durationMs,
      attempted: scorecard.problemsAttempted,
      solved: scorecard.problemsSolved,
      accuracy: scorecard.accuracy,
      score: scorecard.score,
      hasActivity: scorecard.hasActivity
    })),
    activeSession: activeSession
      ? { id: activeSession.id, startedAt: activeSession.startedAt, completedAt: null }
      : null,
    lastScorecard: sessionScorecards[0] || null
  };
}

export async function loadPracticeProgress(sql, { tenantId, userId, questions = [], now = Date.now() }) {
  const solveRows = await sql`
    SELECT question_id, accepted_at
    FROM practice_solves
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND accepted_at <= ${new Date(now)}
    ORDER BY accepted_at DESC
    LIMIT 500
  `;
  const correctionRows = await sql`
    SELECT question_id, credited, accepted_at
    FROM practice_corrections
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND credited = true
    ORDER BY accepted_at DESC
    LIMIT 500
  `;
  const attemptRows = await sql`
    SELECT id, question_id, session_id, outcome, source, created_at
    FROM practice_attempts
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1000
  `;
  const sessionRows = await sql`
    SELECT id, started_at, completed_at
    FROM practice_sessions
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
    ORDER BY started_at DESC
    LIMIT 25
  `;
  return buildPracticeProgress({
    questions,
    solves: solveRows,
    corrections: correctionRows,
    attempts: attemptRows,
    sessions: sessionRows,
    now
  });
}

export async function loadSessionScorecard(sql, { tenantId, userId, sessionId, now = Date.now() }) {
  const [session] = await sql`
    SELECT id, started_at, completed_at
    FROM practice_sessions
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND id = ${sessionId}::uuid
    LIMIT 1
  `;
  if (!session) return null;
  const normalizedSession = normalizeSession(session);
  const questionRows = await sql`
    SELECT id, title, difficulty, topic
    FROM practice_questions
    WHERE tenant_id = ${tenantId}::uuid
    ORDER BY title ASC
  `;
  const attemptRows = await sql`
    SELECT id, question_id, session_id, outcome, source, created_at
    FROM practice_attempts
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND session_id = ${sessionId}::uuid
    ORDER BY created_at ASC
  `;
  const end = Number.isFinite(normalizedSession.completedAt) ? normalizedSession.completedAt : now;
  const solveRows = await sql`
    SELECT question_id, accepted_at
    FROM practice_solves
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND accepted_at >= ${new Date(normalizedSession.startedAt)}
      AND accepted_at <= ${new Date(end)}
    ORDER BY accepted_at ASC
  `;
  const correctionRows = await sql`
    SELECT question_id, credited, accepted_at
    FROM practice_corrections
    WHERE tenant_id = ${tenantId}::uuid
      AND user_id = ${userId}
      AND credited = true
      AND accepted_at >= ${new Date(normalizedSession.startedAt)}
      AND accepted_at <= ${new Date(end)}
    ORDER BY accepted_at ASC
  `;
  return buildSessionScorecard({
    session: normalizedSession,
    attempts: attemptRows,
    solves: solveRows,
    corrections: correctionRows,
    questions: questionRows,
    now
  });
}
