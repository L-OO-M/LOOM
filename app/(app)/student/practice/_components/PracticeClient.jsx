"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, CircleDot, Clock3, ExternalLink, Play, RefreshCw, UserRound } from "lucide-react";
import { ActionLink, Meta, SegControl, StatusPill } from "@/components/loom/primitives";
import { Heatmap } from "@/components/loom/Heatmap";
import { StatTile } from "@/components/loom/StatTiles";
import { WorkspaceEmpty, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { Field, inputStyle } from "@/components/ui";
import { postJSON } from "@/components/loom/useAction";
import { STARTER_PROBLEMS } from "@/lib/practice-starters";
import { isVerifiedSource, sourceLabel, trackFor } from "@/lib/practice-catalog";
import { PracticeOverview } from "./PracticeOverview";
import { PracticeAnalytics } from "./PracticeAnalytics";
import { PracticeScorecard } from "./PracticeScorecard";

function date(value, options = {}) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...options
  }).format(value);
}

function range(start, end) {
  if (!start || !end) return "";
  return `${date(start)} - ${date(end - 1)}`;
}

function ago(value, now) {
  if (!value) return "Not checked yet";
  const minutes = Math.max(0, Math.floor((now - value) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}

function initials(name) {
  return String(name || "Member")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function humanizeSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function QuestionRow({
  question,
  credit,
  solvedAt,
  showSeen = false,
  status = "not_started",
  attemptInfo = null,
  sessionActive = false,
  onAttempt,
  onSolved,
  busy = false
}) {
  const solved = status === "solved" || Boolean(credit);
  const attempted = !solved && status === "attempted";
  const canLog = sessionActive && Boolean(onAttempt) && Boolean(question.id);
  const statusLabel = solved ? "Solved" : attempted ? "Attempted" : "Not started";
  const accent = solved ? "var(--accent)" : attempted ? "var(--warn)" : "var(--line)";
  // The link travels with the question now: a Kaggle competition or a
  // Frontend Mentor challenge opens on its own host instead of a made-up
  // LeetCode slug.
  const href = question.url || `https://leetcode.com/problems/${question.slug}/`;
  const source = question.source || "leetcode";
  const provider = sourceLabel(source);
  const autoVerified = isVerifiedSource(source);
  return (
    <li
      className="rounded-xl border transition hover:shadow-sm"
      style={{ borderColor: accent, background: "var(--bg-elevated)" }}
    >
      <div className="flex items-start gap-3 p-3.5">
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
          style={{
            borderColor: accent,
            color: solved ? "var(--accent)" : attempted ? "var(--warn)" : "var(--text-muted)"
          }}
          aria-hidden="true"
        >
          {solved ? <Check size={14} /> : attempted ? <CircleDot size={14} /> : String(question.position).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium hover:underline"
            style={{ color: "var(--text)" }}
          >
            {question.title}
          </a>
          <span className="meta mt-1 block">
            {question.topic || provider}
            <span className="dot-sep">{question.difficulty}</span>
            <span className="dot-sep">{provider}</span>
            {credit ? <span className="dot-sep">accepted {date(credit.acceptedAt)}</span> : null}
            {solvedAt ? <span className="dot-sep">solved {date(solvedAt)}</span> : null}
            {attemptInfo?.attempts ? (
              <span className="dot-sep">
                {attemptInfo.attempts} logged attempt{attemptInfo.attempts === 1 ? "" : "s"}
              </span>
            ) : null}
            {attemptInfo?.lastActivityAt ? (
              <span className="dot-sep">last activity {date(attemptInfo.lastActivityAt)}</span>
            ) : null}
            {showSeen && !credit && !solvedAt && !attempted ? <span className="dot-sep">not seen yet</span> : null}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusPill>{statusLabel}</StatusPill>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${question.title} on ${provider}`}
            style={{ color: "var(--text-muted)" }}
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
      {canLog ? (
        <div className="flex flex-wrap items-center gap-2 border-t px-3.5 py-2" style={{ borderColor: "var(--line)" }}>
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => onAttempt(question)} disabled={busy}>
            Log attempt
          </button>
          <button type="button" className="btn-ghost !py-1.5 text-xs" onClick={() => onSolved(question)} disabled={busy}>
            Mark solved here
          </button>
          <span className="meta">
            {autoVerified
              ? "self-reported, verified only after LeetCode sync"
              : `${provider} work is self-reported; a lead confirms it`}
          </span>
        </div>
      ) : null}
    </li>
  );
}

function RankPreview({ rows, currentUserId }) {
  const scored = rows.filter((member) => member.score > 0);
  if (!scored.length) {
    return (
      <WorkspaceEmpty
        title="The board starts when the first solve lands."
        body="This week's accepted submissions will appear here."
      />
    );
  }
  return (
    <ol className="mt-4 space-y-2">
      {scored.slice(0, 4).map((member) => (
        <li
          key={member.id}
          className="flex items-center gap-3 rounded-xl border p-3"
          style={{
            borderColor: member.id === currentUserId ? "var(--accent)" : "var(--line)",
            background: "var(--bg-elevated)"
          }}
        >
          <span className="mono-tag w-7 text-center">{String(member.rank).padStart(2, "0")}</span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold" style={{ borderColor: "var(--line)" }}>
            {initials(member.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium" style={{ color: "var(--text)" }}>
              {member.name}
              {member.id === currentUserId ? <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--accent)" }}>you</span> : null}
            </span>
            {member.username ? <span className="meta">@{member.username}</span> : null}
          </span>
          <span className="figure figure-mono text-base">{member.score}<span className="meta ml-1">pts</span></span>
        </li>
      ))}
    </ol>
  );
}

export function PracticeClient({ snapshot, userId, progress }) {
  const router = useRouter();
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [liveStats, setLiveStats] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const [linkError, setLinkError] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState(snapshot.history[0]?.id || "");
  const [statusFilter, setStatusFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [sessionOverride, setSessionOverride] = useState(null);
  const [scorecard, setScorecard] = useState(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [attemptBusyKey, setAttemptBusyKey] = useState("");
  const [sessionMessage, setSessionMessage] = useState("");
  const [sessionError, setSessionError] = useState("");

  const practiceProgress = progress || {
    totals: {
      total: 0,
      solved: 0,
      attempted: 0,
      notSolved: 0,
      inProgress: 0,
      notStarted: 0,
      accuracy: 0,
      completion: 0,
      sessions: 0,
      streak: 0
    },
    difficulty: [],
    timeline: [],
    activity: [],
    byQuestion: [],
    sessions: [],
    activeSession: null,
    lastScorecard: null
  };
  const progressByQuestion = new Map(
    (practiceProgress.byQuestion || []).map((row) => [row.questionId, row])
  );
  const activeSession = sessionOverride || practiceProgress.activeSession || null;

  const currentQuestions = snapshot.questions.filter(
    (question) => question.weekId === snapshot.current?.id
  );
  const currentCredits = snapshot.credits.filter(
    (credit) => credit.userId === userId && credit.weekId === snapshot.current?.id
  );
  const creditByQuestion = new Map(currentCredits.map((credit) => [credit.questionId, credit]));
  const selectedWeek = snapshot.history.find((week) => week.id === selectedWeekId) || snapshot.history[0] || null;
  const archiveQuestions = snapshot.questions.filter((question) => question.weekId === selectedWeek?.id);
  const archiveCredits = new Map(
    snapshot.credits
      .filter((credit) => credit.userId === userId && credit.weekId === selectedWeek?.id)
      .map((credit) => [credit.questionId, credit])
  );
  const weeklyRank = snapshot.current
    ? snapshot.weeklyRanking.find((member) => member.id === userId)
    : null;
  const connection = snapshot.connection;
  const stale = connection?.lastSyncAt && snapshot.now - connection.lastSyncAt > snapshot.staleAfterMs;
  const leetcodeStats = liveStats || connection?.leetcodeStats || null;
  const submissionCalendar =
    leetcodeStats?.calendar && typeof leetcodeStats.calendar === "object"
      ? Object.entries(leetcodeStats.calendar)
          .map(([day, count]) => ({ day, count: Number(count) || 0 }))
          .filter((row) => row.count > 0)
      : [];
  const statsCheckedAt = liveStats
    ? snapshot.now
    : connection?.statsSyncedAt || connection?.lastSyncAt || null;
  const mySolves = snapshot.mySolves || [];
  const solveByQuestion = new Map(mySolves.map((solve) => [solve.questionId, solve]));
  const solveBySlug = new Map();
  for (const solve of mySolves) {
    if (!solveBySlug.has(solve.slug)) solveBySlug.set(solve.slug, solve);
  }

  const myCredits = snapshot.credits.filter((credit) => credit.userId === userId);
  const monthCredits = myCredits.filter(
    (credit) => credit.acceptedAt >= snapshot.monthStart && credit.acceptedAt < snapshot.monthEnd
  );
  const weekCreditCounts = new Map();
  for (const credit of myCredits) {
    weekCreditCounts.set(credit.weekId, (weekCreditCounts.get(credit.weekId) || 0) + 1);
  }
  const bestWeek = Math.max(0, ...weekCreditCounts.values());
  const activeWeeks = weekCreditCounts.size;
  const questionById = new Map(snapshot.questions.map((question) => [question.id, question]));
  const titleBySlug = new Map(snapshot.questions.map((question) => [question.slug, question.title]));
  const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
  for (const credit of myCredits) {
    const level = questionById.get(credit.questionId)?.difficulty;
    if (level && difficulty[level] !== undefined) difficulty[level] += 1;
  }

  function statusOf(question) {
    const row = progressByQuestion.get(String(question.id));
    if (row) return row.status;
    if (solveByQuestion.get(String(question.id)) || solveBySlug.get(question.slug)) return "solved";
    return "not_started";
  }

  function attemptInfoOf(question) {
    return progressByQuestion.get(String(question.id)) || null;
  }

  const statusCounts = { all: currentQuestions.length, solved: 0, attempted: 0, not_started: 0 };
  for (const question of currentQuestions) {
    const status = statusOf(question);
    if (statusCounts[status] !== undefined) statusCounts[status] += 1;
  }
  const filteredQuestions = currentQuestions.filter((question) => {
    if (statusFilter !== "all" && statusOf(question) !== statusFilter) return false;
    if (difficultyFilter !== "all" && question.difficulty !== difficultyFilter) return false;
    return true;
  });
  const statusOptions = [
    { value: "all", label: `All ${statusCounts.all}` },
    { value: "solved", label: `Solved ${statusCounts.solved}` },
    { value: "attempted", label: `Attempted ${statusCounts.attempted}` },
    { value: "not_started", label: `Not started ${statusCounts.not_started}` }
  ];

  async function refresh() {
    setRefreshBusy(true);
    setRefreshMessage("");
    setRefreshError("");
    const result = await postJSON("/api/practice/refresh", "POST", {});
    if (result.ok) {
      if (result.data?.stats) setLiveStats(result.data.stats);
      const solved = result.data?.solved;
      setRefreshMessage(
        typeof solved === "number"
          ? `Checked LeetCode: ${solved} solved in total, ${result.data.credited || 0} credited from this check.`
          : result.data?.message || "Recent accepted submissions checked."
      );
      router.refresh();
    } else {
      setRefreshError(result.error?.message || "Sync unavailable. Recorded progress is preserved.");
    }
    setRefreshBusy(false);
  }

  async function link(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLinkBusy(true);
    setLinkMessage("");
    setLinkError("");
    const result = await postJSON("/api/practice/connection", "POST", {
      username: String(data.get("username") || "")
    });
    if (result.ok) {
      if (result.data?.stats) setLiveStats(result.data.stats);
      setLinkMessage(`Linked @${result.data.username}.`);
      setEditingHandle(false);
      form.reset();
      router.refresh();
    } else {
      setLinkError(result.error?.message || "Could not link that username.");
    }
    setLinkBusy(false);
  }

  async function startSession() {
    setSessionBusy(true);
    setSessionMessage("");
    setSessionError("");
    const result = await postJSON("/api/practice/session", "POST", { action: "start" });
    if (result.ok && result.data?.session) {
      setSessionOverride(result.data.session);
      setSessionMessage(
        result.data.resumed
          ? "Your practice session is still open. Log problems as you work."
          : "Practice session started. Log each problem as you go, then finish for a scorecard."
      );
      router.refresh();
    } else {
      setSessionError(result.error?.message || "Could not start a practice session.");
    }
    setSessionBusy(false);
  }

  async function logAttempt(question, outcome) {
    const key = `${question.id}:${outcome}`;
    setAttemptBusyKey(key);
    setSessionMessage("");
    setSessionError("");
    const result = await postJSON("/api/practice/session", "POST", {
      action: "attempt",
      questionId: question.id,
      outcome,
      ...(activeSession?.id ? { sessionId: activeSession.id } : {})
    });
    if (result.ok && result.data?.session) {
      setSessionOverride(result.data.session);
      setSessionMessage(
        outcome === "solved"
          ? "Marked solved here. LeetCode sync is what makes it verified."
          : "Attempt logged. Keep going or finish the session for a scorecard."
      );
      router.refresh();
    } else {
      setSessionError(result.error?.message || "Could not record that attempt.");
    }
    setAttemptBusyKey("");
  }

  async function finishSession() {
    if (!activeSession?.id) return;
    setSessionBusy(true);
    setSessionMessage("");
    setSessionError("");
    const result = await postJSON("/api/practice/session", "POST", {
      action: "complete",
      sessionId: activeSession.id
    });
    if (result.ok) {
      if (result.data?.scorecard) setScorecard(result.data.scorecard);
      setSessionOverride(null);
      router.refresh();
    } else {
      setSessionError(result.error?.message || "Could not finish that practice session.");
    }
    setSessionBusy(false);
  }

  function showAttemptedProblems() {
    setStatusFilter("attempted");
    setDifficultyFilter("all");
    setScorecard(null);
    requestAnimationFrame(() => {
      document.getElementById("practice-problem-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function continuePracticing() {
    setScorecard(null);
    await startSession();
  }

  return (
    <>
      <WorkspaceSection
        index="01"
        title="This week's practice"
        note="Seven assigned items from your department's track. One verified submission inside the week is one point."
        action={
          <span className="meta inline-flex items-center gap-1.5">
            <Clock3 size={13} /> {snapshot.current ? range(snapshot.current.startAt, snapshot.current.endAt) : "Awaiting release"}
            {snapshot.current ? ` / ${trackFor(snapshot.current.track)?.label || snapshot.current.track}` : ""}
          </span>
        }
      >
        {!connection || editingHandle ? (
          <div className="mt-4 grid gap-4 rounded-2xl border p-5 lg:grid-cols-[1fr_360px]" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                {connection ? "Update your LeetCode username" : "Link your LeetCode username"}
              </p>
              <p className="narrative mt-1 text-xs leading-5">
                {connection
                  ? "A mistyped handle can be corrected until the first accepted submission is recorded."
                  : "We check recent public accepted submissions. Recorded progress is never removed when LeetCode is unavailable."}
              </p>
            </div>
            <form onSubmit={link} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label="LeetCode username">
                  <input name="username" required maxLength={30} autoComplete="off" defaultValue={connection?.username || ""} placeholder="your-handle" style={inputStyle} />
                </Field>
              </div>
              <button type="submit" className="btn-ink" disabled={linkBusy}>
                {linkBusy ? "Saving..." : connection ? "Update" : "Link"}
              </button>
              {connection ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={linkBusy}
                  onClick={() => {
                    setEditingHandle(false);
                    setLinkError("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </form>
            {linkError ? <p role="alert" className="text-xs lg:col-span-2" style={{ color: "var(--danger)" }}>{linkError}</p> : null}
            {linkMessage ? <p className="text-xs lg:col-span-2" style={{ color: "var(--accent)" }}>{linkMessage}</p> : null}
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: "var(--line)" }}>
                <UserRound size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>@{connection.username}</p>
                <p className="meta">Last checked {ago(connection.lastSyncAt, snapshot.now)}</p>
              </div>
              {connection.syncState === "error" ? <StatusPill>needs attention</StatusPill> : null}
              {stale ? <StatusPill>may be stale</StatusPill> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {snapshot.canRelink ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={refreshBusy}
                  onClick={() => {
                    setEditingHandle(true);
                    setLinkMessage("");
                    setLinkError("");
                  }}
                >
                  Change handle
                </button>
              ) : null}
              <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={refreshBusy} onClick={refresh}>
                <RefreshCw size={14} className={refreshBusy ? "animate-spin" : ""} />
                {refreshBusy ? "Checking LeetCode..." : "Refresh my progress"}
              </button>
            </div>
          </div>
        )}
        {connection?.syncError ? (
          <p className="narrative mt-2 text-xs" style={{ color: "var(--danger)" }}>{connection.syncError}</p>
        ) : null}
        {refreshError ? <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{refreshError}</p> : null}
        {refreshMessage ? <p className="mt-2 text-xs" style={{ color: "var(--accent)" }}>{refreshMessage}</p> : null}

        {currentQuestions.length > 0 ? (
          <div
            className="mt-4 rounded-2xl border p-4"
            style={{ borderColor: activeSession ? "var(--accent)" : "var(--line)", background: "var(--bg-elevated)" }}
          >
            {activeSession ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full border"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    <CircleDot size={15} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                      Practice session in progress
                    </p>
                    <p className="meta mt-0.5">
                      Started {ago(activeSession.startedAt, snapshot.now)} / finish for a scorecard
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-ink"
                  onClick={finishSession}
                  disabled={sessionBusy}
                >
                  {sessionBusy ? "Finishing..." : "Finish session"}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                    Track this practice session
                  </p>
                  <p className="narrative mt-1 text-xs leading-5">
                    Start a session, log attempts against this week&apos;s problems, and finish for a
                    scorecard. Self-reported entries are labelled and never count as verified.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {practiceProgress.lastScorecard ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setScorecard(practiceProgress.lastScorecard)}
                    >
                      Last scorecard
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ink inline-flex items-center gap-1.5"
                    onClick={startSession}
                    disabled={sessionBusy}
                  >
                    <Play size={14} />
                    {sessionBusy ? "Starting..." : "Start practice session"}
                  </button>
                </div>
              </div>
            )}
            {sessionError ? (
              <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{sessionError}</p>
            ) : null}
            {sessionMessage ? (
              <p className="mt-2 text-xs" style={{ color: "var(--accent)" }}>{sessionMessage}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            {!snapshot.current ? (
              <div>
                <WorkspaceEmpty
                  title="No set published yet."
                  body="Your DSA team has not released this week's questions. The previous weeks stay open for practice."
                />
                <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Starter practice</p>
                    <StatusPill>not scored</StatusPill>
                  </div>
                  <p className="narrative mt-1 text-xs leading-5">
                    Seven real LeetCode problems to keep the habit going until your team publishes a week. These do not affect practice points.
                  </p>
                  <ol className="mt-3 grid gap-2">
                    {STARTER_PROBLEMS.map((question) => (
                      <QuestionRow
                        key={question.slug}
                        question={question}
                        credit={null}
                        solvedAt={solveBySlug.get(question.slug)?.acceptedAt}
                        status={solveBySlug.get(question.slug) ? "solved" : "not_started"}
                      />
                    ))}
                  </ol>
                </div>
              </div>
            ) : currentQuestions.length === 0 ? (
              <WorkspaceEmpty
                title="This week is published without questions."
                body="Ask the DSA team to repair the set. Nothing is counted until the questions exist."
              />
            ) : (
              <div id="practice-problem-list">
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <SegControl
                    label="Filter problems by progress"
                    options={statusOptions}
                    value={statusFilter}
                    onChange={setStatusFilter}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {["all", "Easy", "Medium", "Hard"].map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDifficultyFilter(level)}
                        aria-pressed={difficultyFilter === level}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          borderColor: difficultyFilter === level ? "var(--accent)" : "var(--line)",
                          color: difficultyFilter === level ? "var(--accent)" : "var(--text-muted)",
                          background: difficultyFilter === level ? "var(--wash)" : "transparent"
                        }}
                      >
                        {level === "all" ? "All levels" : level}
                      </button>
                    ))}
                  </div>
                </div>
                {filteredQuestions.length === 0 ? (
                  <div className="mt-4">
                    <WorkspaceEmpty
                      title="No problems match this filter."
                      body="Change the progress or difficulty filter to see the rest of this week's set."
                    />
                    <button
                      type="button"
                      className="btn-ghost mt-3"
                      onClick={() => {
                        setStatusFilter("all");
                        setDifficultyFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <ol className="mt-4 grid gap-2">
                    {filteredQuestions.map((question) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        credit={creditByQuestion.get(question.id)}
                        solvedAt={solveByQuestion.get(question.id)?.acceptedAt}
                        showSeen
                        status={statusOf(question)}
                        attemptInfo={attemptInfoOf(question)}
                        sessionActive={Boolean(activeSession)}
                        onAttempt={(item) => logAttempt(item, "attempted")}
                        onSolved={(item) => logAttempt(item, "solved")}
                        busy={
                          attemptBusyKey === `${question.id}:attempted` ||
                          attemptBusyKey === `${question.id}:solved`
                        }
                      />
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
          <aside className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <Meta>Your weekly rhythm</Meta>
            <p className="figure figure-mono mt-3 text-4xl">{currentCredits.length}<span className="meta ml-2">/ {snapshot.current ? currentQuestions.length : 0}</span></p>
            <p className="narrative mt-2 text-xs leading-5">questions recorded</p>
            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <p className="meta">Weekly rank</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{weeklyRank ? `#${weeklyRank.rank}` : "Not ranked yet"}</p>
              <p className="meta mt-3">Last checked</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{connection ? ago(statsCheckedAt, snapshot.now) : "LeetCode not linked"}</p>
            </div>
            <p className="narrative mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              LeetCode exposes public submissions only. A solve outside the practice window is recorded on this page but never scored, and LOOM never asks for a LeetCode password or session cookie.
            </p>
          </aside>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        index="02"
        title="Your practice progress"
        note="Only recorded activity counts: accepted LeetCode solves and attempts you log in this room."
        action={<StatusPill>verified + self-reported</StatusPill>}
      >
        <PracticeOverview progress={practiceProgress} />
        <PracticeAnalytics progress={practiceProgress} />
      </WorkspaceSection>

      <WorkspaceSection
        index="03"
        title="LeetCode progress"
        note="Your overall LeetCode account, separate from LOOM weekly scoring. Read from public data only."
        action={<StatusPill>not LOOM scoring</StatusPill>}
      >
        {!connection ? (
          <WorkspaceEmpty
            title="Link your LeetCode handle to see your real solved counts."
            body="Once linked, your accepted totals, Easy / Medium / Hard split, ranking and streak come straight from LeetCode."
          />
        ) : !leetcodeStats ? (
          <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No LeetCode snapshot yet.</p>
            <p className="narrative mt-1 text-xs leading-5">
              We have not received a progress snapshot for @{connection.username}. Use Refresh my progress to check the account now.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                value={leetcodeStats.total ?? "—"}
                label="problems solved, all difficulties"
              />
              <StatTile
                value={leetcodeStats.easy ?? "—"}
                label="Easy problems solved"
              />
              <StatTile
                value={leetcodeStats.medium ?? "—"}
                label="Medium problems solved"
              />
              <StatTile
                value={leetcodeStats.hard ?? "—"}
                label="Hard problems solved"
              />
            </div>
            <div className="mt-3 grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
              <div>
                <Meta>Global ranking</Meta>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {Number(leetcodeStats.ranking) > 0 ? `#${leetcodeStats.ranking}` : "—"}
                </p>
              </div>
              <div>
                <Meta>Current streak</Meta>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {Number(leetcodeStats.streak) > 0 ? `${leetcodeStats.streak} day${Number(leetcodeStats.streak) === 1 ? "" : "s"}` : "—"}
                </p>
              </div>
              <div>
                <Meta>Active days</Meta>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {Number(leetcodeStats.activeDays) > 0 ? leetcodeStats.activeDays : "—"}
                </p>
              </div>
              <div>
                <Meta>Last checked</Meta>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{ago(statsCheckedAt, snapshot.now)}</p>
              </div>
            </div>
            {submissionCalendar.length > 0 ? (
              <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Submission calendar</p>
                  <p className="meta">public LeetCode activity</p>
                </div>
                <p className="narrative mt-1 text-xs leading-5">
                  Each square is one day of accepted submissions on @{connection.username}, read from your public
                  LeetCode profile. No session cookie or password is ever used.
                </p>
                <div className="mt-3 overflow-x-auto pb-1">
                  <div className="min-w-[240px]">
                    <Heatmap rows={submissionCalendar} weeks={20} valueField="count" unit="submission" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No accepted submissions in the last 20 weeks.</p>
                <p className="narrative mt-1 text-xs leading-5">
                  LeetCode carries a day in the public calendar only when it has an accepted submission, so there is nothing to draw yet.
                </p>
              </div>
            )}
            <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recent accepted solves</p>
                <p className="meta">{mySolves.length ? `${mySolves.length} recorded` : "none recorded yet"}</p>
              </div>
              {mySolves.length === 0 ? (
                <p className="narrative mt-2 text-xs leading-5">
                  No accepted submissions have been seen yet. Solve a problem on LeetCode and press Refresh my progress.
                </p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {mySolves.slice(0, 6).map((solve) => (
                    <li key={`${solve.questionId}:${solve.externalId}`}>
                      <a
                        href={`https://leetcode.com/problems/${solve.slug}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2"
                        style={{ borderColor: "var(--line)" }}
                      >
                        <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>
                          {titleBySlug.get(solve.slug) || humanizeSlug(solve.slug)}
                        </span>
                        <span className="meta shrink-0">{date(solve.acceptedAt)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </WorkspaceSection>

      <WorkspaceSection
        index="04"
        title="Your practice record"
        note="Only credited solves in the published window are counted."
      >
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            value={myCredits.length}
            label={`credited solve${myCredits.length === 1 ? "" : "s"} in released weeks`}
          />
          <StatTile
            value={monthCredits.length}
            label="credited solves this month"
          />
          <StatTile
            value={bestWeek}
            label="best single week"
          />
          <StatTile
            value={activeWeeks}
            label={`week${activeWeeks === 1 ? "" : "s"} with at least one solve`}
          />
        </div>
        <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Difficulty mix</p>
            <p className="meta">{myCredits.length} credited solve{myCredits.length === 1 ? "" : "s"}</p>
          </div>
          {myCredits.length === 0 ? (
            <p className="narrative mt-2 text-xs leading-5">Difficulty appears after your first credited solve.</p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Object.entries(difficulty).map(([level, count]) => (
                <div key={level} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--line)" }}>
                  <p className="meta">{level}</p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: "var(--text)" }}>{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        index="05"
        title="This week's board"
        note="Practice points are a weekly habit board. Chapter standing is a separate score."
        action={<ActionLink href="/student/practice/leaderboard">Weekly and monthly board</ActionLink>}
      >
        <RankPreview rows={snapshot.weeklyRanking} currentUserId={userId} />
      </WorkspaceSection>

      <WorkspaceSection
        index="06"
        title="Archive"
        note="Practice stays open; scoring is closed."
      >
        {snapshot.history.length === 0 ? (
          <WorkspaceEmpty
            title="No past weeks yet."
            body="Released weeks will archive here after their Monday."
          />
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="grid gap-2">
              {snapshot.history.map((week) => (
                <button
                  key={week.id}
                  type="button"
                  onClick={() => setSelectedWeekId(week.id)}
                  className="rounded-xl border p-3 text-left"
                  aria-pressed={selectedWeek?.id === week.id}
                  style={{
                    borderColor: selectedWeek?.id === week.id ? "var(--accent)" : "var(--line)",
                    background: "var(--bg-elevated)"
                  }}
                >
                  <span className="meta flex items-center gap-1.5"><CalendarDays size={12} /> {range(week.startAt, week.endAt)}</span>
                  <span className="mt-1 block text-xs font-semibold" style={{ color: "var(--text)" }}>{week.title}</span>
                </button>
              ))}
            </div>
            <div>
              {selectedWeek ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{selectedWeek.title}</p>
                      <p className="meta">{range(selectedWeek.startAt, selectedWeek.endAt)}</p>
                    </div>
                    <StatusPill>practice only</StatusPill>
                  </div>
                  <ol className="mt-4 grid gap-2">
                    {archiveQuestions.map((question) => (
                      <QuestionRow
                        key={question.id}
                        question={question}
                        credit={archiveCredits.get(question.id)}
                        solvedAt={solveByQuestion.get(question.id)?.acceptedAt}
                        status={statusOf(question)}
                        attemptInfo={attemptInfoOf(question)}
                      />
                    ))}
                  </ol>
                </>
              ) : null}
            </div>
          </div>
        )}
      </WorkspaceSection>

      <PracticeScorecard
        scorecard={scorecard}
        onClose={() => setScorecard(null)}
        onReview={showAttemptedProblems}
        onRetry={showAttemptedProblems}
        onContinue={continuePracticing}
      />
    </>
  );
}

