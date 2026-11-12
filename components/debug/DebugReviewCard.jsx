"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, RotateCcw } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";
import { Meta, StatusPill } from "@/components/loom/primitives";

function when(value) {
  return value
    ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "not checked";
}

export function DebugReviewCard({ submission }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const decision = data.get("decision");
    setBusy(true);
    setMessage("");
    setError("");
    const result = await postJSON("/api/lead/debug", "POST", {
      submissionId: submission.id,
      decision,
      feedback: String(data.get("feedback") || "")
    });
    if (result.ok) {
      setMessage(result.data?.unchanged ? "Review already matches." : "Review saved.");
      router.refresh();
    } else {
      setError(result.error?.message || "Could not save the review.");
    }
    setBusy(false);
  }

  return (
    <li className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{submission.challengeTitle}</p>
          <p className="meta mt-1">{submission.studentName} / {submission.domain} / submitted {when(submission.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill>{submission.verificationStatus}</StatusPill>
          <StatusPill>{submission.reviewStatus}</StatusPill>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        <a href={submission.forkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          <ExternalLink size={12} /> Fork
        </a>
        {submission.prUrl ? (
          <a href={submission.prUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:underline" style={{ color: "var(--accent)" }}>
            <ExternalLink size={12} /> Pull request
          </a>
        ) : null}
        <span className="meta">fork checked {when(submission.lastCheckedAt)}</span>
      </div>

      {submission.verificationReason ? (
        <p className="mt-2 text-xs leading-5" style={{ color: "var(--danger)" }}>{submission.verificationReason}</p>
      ) : null}

      <form onSubmit={submit} className="mt-4 grid gap-3 border-t pt-4" style={{ borderColor: "var(--line)" }}>
        <Field label="Review feedback" hint="The member sees this immediately.">
          <textarea
            name="feedback"
            required
            minLength={5}
            maxLength={2000}
            rows={3}
            defaultValue={submission.reviewFeedback || ""}
            placeholder="What is correct, what is missing, and what should change?"
            style={inputStyle}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            name="decision"
            value="approved"
            className="btn-ink inline-flex items-center gap-1.5"
            disabled={busy || submission.verificationStatus !== "verified"}
            title={submission.verificationStatus !== "verified" ? "The fork must pass GitHub verification first." : undefined}
          >
            <Check size={14} /> Approve fix
          </button>
          <button type="submit" name="decision" value="rejected" className="btn-ghost inline-flex items-center gap-1.5" disabled={busy}>
            <RotateCcw size={14} /> Return for changes
          </button>
          <ActionFeedback msg={message} error={error} />
        </div>
        {submission.verificationStatus !== "verified" ? (
          <Meta>Approval stays disabled until the automated fork check passes.</Meta>
        ) : null}
      </form>
    </li>
  );
}
