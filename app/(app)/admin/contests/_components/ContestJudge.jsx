"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
  { value: "submitted", label: "In review" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "winner", label: "Winner" },
  { value: "rejected", label: "Not selected" }
];

// One submission's judgement form. Winner is the only status that writes
// `contest_top` evidence, and the API revokes it when a winner is moved back.
export function ContestJudge({ submission }) {
  const router = useRouter();
  const [status, setStatus] = useState(submission.status || "submitted");
  const [score, setScore] = useState(submission.score ?? "");
  const [feedback, setFeedback] = useState(submission.feedback || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const dirty =
    status !== (submission.status || "submitted") ||
    String(score) !== String(submission.score ?? "") ||
    feedback !== (submission.feedback || "");

  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/contests/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          status,
          score: score === "" ? null : Number(score),
          feedback
        })
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error?.message || "Could not save the judgement.");
        return;
      }
      setMessage(status === "winner" ? "Winner recorded — points will appear after recompute." : "Judgement saved.");
      router.refresh();
    } catch {
      setError("Network error — the judgement was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[8.5rem_5rem_1fr_auto] sm:items-end">
      <label className="aled-meta" style={{ display: "grid", gap: "0.2rem" }}>
        Outcome
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={busy}
          className="aled-select"
          style={{ padding: "0.3rem 0.4rem" }}
          aria-label={`Outcome for ${submission.student_name || submission.student_id}`}
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="aled-meta" style={{ display: "grid", gap: "0.2rem" }}>
        Score
        <input
          type="number"
          min="0"
          max="100"
          value={score}
          onChange={(e) => setScore(e.target.value)}
          disabled={busy}
          className="aled-select"
          style={{ padding: "0.3rem 0.4rem" }}
          aria-label="Score out of 100"
          placeholder="0-100"
        />
      </label>
      <label className="aled-meta" style={{ display: "grid", gap: "0.2rem" }}>
        Feedback to the student
        <input
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          disabled={busy}
          maxLength={2000}
          className="aled-select"
          style={{ padding: "0.3rem 0.4rem" }}
          aria-label="Feedback"
          placeholder="What was strong, what to improve"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy || !dirty} className="btn-ink !py-2 text-xs">
          {busy ? "Saving…" : "Save"}
        </button>
        {message && <span role="status" className="aled-meta" style={{ color: "var(--accent)" }}>{message}</span>}
        {error && <span role="alert" className="aled-meta" style={{ color: "var(--danger)" }}>{error}</span>}
      </div>
    </div>
  );
}
