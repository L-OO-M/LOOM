"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";

function weekLabel(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function PracticeCorrectionForm({ released, questions, members }) {
  const router = useRouter();
  const [weekId, setWeekId] = useState(released[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const weekQuestions = useMemo(
    () => questions.filter((question) => question.weekId === weekId),
    [questions, weekId]
  );

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const credited = data.get("credited") === "grant";
    const acceptedAt = String(data.get("acceptedAt") || "");
    if (credited && !acceptedAt) {
      setError("Accepted time is required when granting credit.");
      return;
    }
    setBusy(true);
    setMessage("");
    setError("");
    const result = await postJSON("/api/admin/practice/corrections", "POST", {
      userId: data.get("userId"),
      questionId: data.get("questionId"),
      credited,
      acceptedAt: acceptedAt ? `${acceptedAt}+05:30` : null,
      evidence: data.get("evidence"),
      reason: data.get("reason")
    });
    if (result.ok) {
      setMessage(result.data?.unchanged ? "That correction already matches." : "Correction saved.");
      form.reset();
      router.refresh();
    } else {
      setError(result.error?.message || "Could not save the correction.");
    }
    setBusy(false);
  }

  if (!released.length || !members.length) {
    return (
      <p className="narrative mt-4 text-sm">
        Add members and release a practice week before recording corrections.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Member">
          <select name="userId" required style={inputStyle}>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Released week">
          <select value={weekId} onChange={(event) => setWeekId(event.target.value)} style={inputStyle}>
            {released.map((week) => (
              <option key={week.id} value={week.id}>{weekLabel(week.startAt)} / {week.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Assigned question">
          <select name="questionId" required key={weekId} style={inputStyle}>
            {weekQuestions.map((question) => (
              <option key={question.id} value={question.id}>{question.position}. {question.title}</option>
            ))}
          </select>
        </Field>
        <Field label="Decision">
          <select name="credited" style={inputStyle}>
            <option value="grant">Grant credit</option>
            <option value="remove">Remove credit</option>
          </select>
        </Field>
        <Field label="Accepted time (IST)" hint="Required when granting. Must sit inside the assignment week.">
          <input type="datetime-local" step="1" name="acceptedAt" style={inputStyle} />
        </Field>
        <Field label="LeetCode evidence">
          <input type="url" name="evidence" required placeholder="https://leetcode.com/submissions/detail/..." style={inputStyle} />
        </Field>
      </div>
      <Field label="Reason">
        <textarea name="reason" required minLength={5} maxLength={500} rows={3} placeholder="What was verified or corrected?" style={inputStyle} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-ink inline-flex items-center gap-1.5" disabled={busy}>
          <ShieldCheck size={15} /> {busy ? "Saving..." : "Save correction"}
        </button>
        <ActionFeedback msg={message} error={error} />
      </div>
    </form>
  );
}
