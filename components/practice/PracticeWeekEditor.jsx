"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LockKeyhole, Pencil, Plus, Save } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";
import { StatusPill } from "@/components/loom/primitives";

const EMPTY = { title: "", url: "", difficulty: "Easy", topic: "" };

function localDate(value) {
  return new Date(value + 330 * 60_000).toISOString().slice(0, 10);
}

function localRange(start, end) {
  return `${localDate(start)} - ${localDate(end - 1)}`;
}

function newQuestions() {
  return Array.from({ length: 7 }, () => ({ ...EMPTY }));
}

export function PracticeWeekEditor({ weeks, questions, now, currentWeekStart }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [items, setItems] = useState(newQuestions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function open(week = null) {
    setMessage("");
    setError("");
    setEditing(true);
    setDraft(
      week
        ? { id: week.id, title: week.title, date: localDate(week.startAt) }
        : { id: null, title: "", date: localDate(currentWeekStart) }
    );
    setItems(
      week
        ? Array.from({ length: 7 }, (_, index) => {
            const question = questions.find((item) => item.weekId === week.id && item.position === index + 1);
            return question
              ? {
                  title: question.title,
                  url: `https://leetcode.com/problems/${question.slug}/`,
                  difficulty: question.difficulty,
                  topic: question.topic
                }
              : { ...EMPTY };
          })
        : newQuestions()
    );
  }

  function update(index, key, value) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  }

  async function save(status) {
    setMessage("");
    setError("");
    const questionsPayload = status === "draft"
      ? items.filter((item) => item.title.trim() || item.url.trim() || item.topic.trim())
      : items;
    if (status === "scheduled" && questionsPayload.some((item) => !item.title.trim() || !item.url.trim())) {
      setError("A scheduled week needs seven complete questions.");
      return;
    }
    setBusy(true);
    const result = await postJSON("/api/admin/practice/weeks", "POST", {
      id: draft.id || undefined,
      title: draft.title,
      date: draft.date,
      status,
      questions: questionsPayload
    });
    if (result.ok) {
      setMessage(status === "scheduled" ? "Week scheduled." : "Draft saved.");
      setEditing(false);
      router.refresh();
    } else {
      setError(result.error?.message || "Could not save this week.");
    }
    setBusy(false);
  }

  if (editing) {
    return (
      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{draft.id ? "Edit week" : "New week"}</p>
            <p className="meta mt-1">Released weeks lock automatically. Use a correction after release.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Week title">
            <input
              value={draft.title}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="e.g. Arrays and two pointers"
              style={inputStyle}
            />
          </Field>
          <Field label="Week starting (Monday, IST)">
            <input
              type="date"
              value={draft.date}
              min={localDate(currentWeekStart)}
              onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              style={inputStyle}
            />
          </Field>
        </div>
        <div className="mt-5 grid gap-3">
          {items.map((item, index) => (
            <fieldset key={index} className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
              <legend className="mono-tag px-1">Question {String(index + 1).padStart(2, "0")}</legend>
              <div className="grid gap-3 lg:grid-cols-[1.1fr_1.5fr_120px_1fr]">
                <Field label="Title">
                  <input value={item.title} maxLength={160} onChange={(event) => update(index, "title", event.target.value)} style={inputStyle} />
                </Field>
                <Field label="LeetCode problem URL">
                  <input type="url" value={item.url} onChange={(event) => update(index, "url", event.target.value)} placeholder="https://leetcode.com/problems/..." style={inputStyle} />
                </Field>
                <Field label="Difficulty">
                  <select value={item.difficulty} onChange={(event) => update(index, "difficulty", event.target.value)} style={inputStyle}>
                    <option>Easy</option>
                    <option>Medium</option>
                    <option>Hard</option>
                  </select>
                </Field>
                <Field label="Topic (optional)">
                  <input value={item.topic} maxLength={80} onChange={(event) => update(index, "topic", event.target.value)} style={inputStyle} />
                </Field>
              </div>
            </fieldset>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost inline-flex items-center gap-1.5" disabled={busy} onClick={() => save("draft")}>
            <Save size={14} /> Save draft
          </button>
          <button type="button" className="btn-ink inline-flex items-center gap-1.5" disabled={busy} onClick={() => save("scheduled")}>
            <CalendarDays size={14} /> {busy ? "Saving..." : "Schedule / publish week"}
          </button>
          <ActionFeedback msg={message} error={error} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="meta">{weeks.length} weeks / {weeks.filter((week) => week.status === "draft").length} drafts</p>
        <button type="button" className="btn-ink inline-flex items-center gap-1.5" onClick={() => open()}>
          <Plus size={14} /> New week
        </button>
      </div>
      {message ? <p className="mt-3 text-xs" style={{ color: "var(--accent)" }}>{message}</p> : null}
      {error ? <p role="alert" className="mt-3 text-xs" style={{ color: "var(--danger)" }}>{error}</p> : null}
      {weeks.length === 0 ? (
        <div className="mt-4 rounded-2xl border p-6 text-center" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>No practice week exists yet.</p>
          <p className="narrative mt-2 text-xs">Create the first Monday set. Students see it only when it is scheduled.</p>
        </div>
      ) : (
        <ul className="mt-4 grid gap-2">
          {weeks.map((week) => {
            const locked = week.status === "scheduled" && week.startAt <= now;
            const count = questions.filter((question) => question.weekId === week.id).length;
            return (
              <li key={week.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium" style={{ color: "var(--text)" }}>{week.title}</span>
                    <StatusPill>{locked ? "released" : week.status}</StatusPill>
                  </span>
                  <span className="meta mt-1 block">{localRange(week.startAt, week.endAt)} / {count} of 7 questions</span>
                </span>
                {locked ? (
                  <span className="meta inline-flex items-center gap-1"><LockKeyhole size={12} /> locked after release</span>
                ) : (
                  <button type="button" className="btn-ghost inline-flex items-center gap-1.5" onClick={() => open(week)}>
                    <Pencil size={13} /> Edit
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
