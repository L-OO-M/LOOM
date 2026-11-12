"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock3, ExternalLink, RefreshCw, Trophy, UserRound } from "lucide-react";
import { ActionLink, Meta, StatusPill } from "@/components/loom/primitives";
import { WorkspaceEmpty, WorkspaceSection } from "@/components/loom/WorkspaceMasthead";
import { Field, inputStyle } from "@/components/ui";
import { postJSON } from "@/components/loom/useAction";

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

function QuestionRow({ question, credit }) {
  return (
    <li>
      <a
        href={`https://leetcode.com/problems/${question.slug}/`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 rounded-xl border p-3.5 transition hover:shadow-sm"
        style={{ borderColor: credit ? "var(--accent)" : "var(--line)", background: "var(--bg-elevated)" }}
      >
        <span
          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
          style={{
            borderColor: credit ? "var(--accent)" : "var(--line)",
            color: credit ? "var(--accent)" : "var(--text-muted)"
          }}
        >
          {credit ? <Check size={14} /> : String(question.position).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" style={{ color: "var(--text)" }}>{question.title}</span>
          <span className="meta mt-1 block">
            {question.topic || "DSA practice"}
            <span className="dot-sep">{question.difficulty}</span>
            {credit ? <span className="dot-sep">accepted {date(credit.acceptedAt)}</span> : null}
          </span>
        </span>
        <ExternalLink size={14} className="mt-1 shrink-0" style={{ color: "var(--text-muted)" }} />
      </a>
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

export function PracticeClient({ snapshot, userId }) {
  const router = useRouter();
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkMessage, setLinkMessage] = useState("");
  const [linkError, setLinkError] = useState("");
  const [editingHandle, setEditingHandle] = useState(false);
  const [selectedWeekId, setSelectedWeekId] = useState(snapshot.history[0]?.id || "");

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

  async function refresh() {
    setRefreshBusy(true);
    setRefreshMessage("");
    setRefreshError("");
    const result = await postJSON("/api/practice/refresh", "POST", {});
    if (result.ok) {
      setRefreshMessage(result.data?.message || "Recent accepted submissions checked.");
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
      setLinkMessage(`Linked @${result.data.username}.`);
      setEditingHandle(false);
      form.reset();
      router.refresh();
    } else {
      setLinkError(result.error?.message || "Could not link that username.");
    }
    setLinkBusy(false);
  }

  return (
    <>
      <WorkspaceSection
        index="01"
        title="This week's practice"
        note="Seven assigned questions. One accepted submission inside the week is one point."
        action={
          <span className="meta inline-flex items-center gap-1.5">
            <Clock3 size={13} /> {snapshot.current ? range(snapshot.current.startAt, snapshot.current.endAt) : "Awaiting release"}
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

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div>
            {!snapshot.current ? (
              <WorkspaceEmpty
                title="No set published yet."
                body="Your DSA team has not released this week's questions. The previous weeks stay open for practice."
              />
            ) : currentQuestions.length === 0 ? (
              <WorkspaceEmpty
                title="This week is published without questions."
                body="Ask the DSA team to repair the set. Nothing is counted until the questions exist."
              />
            ) : (
              <ol className="grid gap-2">
                {currentQuestions.map((question) => (
                  <QuestionRow key={question.id} question={question} credit={creditByQuestion.get(question.id)} />
                ))}
              </ol>
            )}
          </div>
          <aside className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
            <Meta>Your weekly rhythm</Meta>
            <p className="figure figure-mono mt-3 text-4xl">{currentCredits.length}<span className="meta ml-2">/ {snapshot.current ? currentQuestions.length || 7 : 0}</span></p>
            <p className="narrative mt-2 text-xs leading-5">questions recorded</p>
            <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
              <p className="meta">Weekly rank</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{weeklyRank ? `#${weeklyRank.rank}` : "Not ranked yet"}</p>
              <p className="meta mt-3">Last checked</p>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text)" }}>{connection ? ago(connection.lastSyncAt, snapshot.now) : "LeetCode not linked"}</p>
            </div>
            <p className="narrative mt-4 text-xs leading-5" style={{ color: "var(--text-muted)" }}>
              LeetCode exposes recent public submissions. If a solve is missing, ask an admin for a correction.
            </p>
          </aside>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        index="02"
        title="This week's board"
        note="Practice points are a weekly habit board. Chapter standing is a separate score."
        action={<ActionLink href="/student/practice/leaderboard">Weekly and monthly board</ActionLink>}
      >
        <RankPreview rows={snapshot.weeklyRanking} currentUserId={userId} />
      </WorkspaceSection>

      <WorkspaceSection
        index="03"
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
                      <QuestionRow key={question.id} question={question} credit={archiveCredits.get(question.id)} />
                    ))}
                  </ol>
                </>
              ) : null}
            </div>
          </div>
        )}
      </WorkspaceSection>
    </>
  );
}
