"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, GitFork, Send } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";
import { StatusPill } from "@/components/loom/primitives";

const VERIFICATION = {
  verified: "Fork verified and waiting for a domain lead.",
  error: "GitHub could not complete the check. Your submission stays pending; try again shortly.",
  rejected: "This fork did not pass the automated check."
};

export function DebugSubmissionForm({ challenge, submission }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    setError("");
    const result = await postJSON("/api/debug/submissions", "POST", {
      challengeId: challenge.id,
      forkUrl: String(data.get("forkUrl") || ""),
      prUrl: String(data.get("prUrl") || "") || null
    });
    if (result.ok) {
      setMessage(result.data?.message || "Submission saved.");
      router.refresh();
    } else {
      setError(result.error?.message || "Could not submit this fork.");
    }
    setBusy(false);
  }

  if (submission?.reviewStatus === "approved") {
    return (
      <div className="mt-4 rounded-2xl border p-5" style={{ borderColor: "var(--accent)", background: "var(--bg-elevated)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Approved debug fix</p>
          <StatusPill>approved</StatusPill>
        </div>
        <p className="narrative mt-2 text-sm leading-6">{submission.reviewFeedback || "Your fix was accepted by the reviewing lead."}</p>
        <a href={submission.forkUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: "var(--accent)" }}>
          <ExternalLink size={12} /> Open your fork
        </a>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_320px]">
      <form onSubmit={submit} className="grid gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}>
        <Field label="Your fork URL" hint="Public GitHub fork owned by your linked account.">
          <input
            type="url"
            name="forkUrl"
            required
            maxLength={500}
            defaultValue={submission?.forkUrl || ""}
            placeholder={`https://github.com/you/${challenge.repoPath.split("/").at(-1) || "challenge"}`}
            style={inputStyle}
          />
        </Field>
        <Field label="Pull request URL (optional)" hint="Only if the challenge brief asks for a PR.">
          <input type="url" name="prUrl" maxLength={500} defaultValue={submission?.prUrl || ""} placeholder="https://github.com/L-OO-M/buggy/pull/..." style={inputStyle} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-ink inline-flex items-center gap-1.5" disabled={busy}>
            <Send size={14} /> {busy ? "Checking fork..." : submission ? "Resubmit fork" : "Submit fork"}
          </button>
          <ActionFeedback msg={message} error={error} />
        </div>
      </form>
      <aside className="rounded-2xl border p-5" style={{ borderColor: "var(--line)", background: "var(--bg)" }}>
        <MetaRow label="Fork check" value={submission?.verificationStatus || "not started"} />
        <MetaRow label="Review" value={submission?.reviewStatus || "not submitted"} />
        {submission?.verificationReason ? (
          <p className="mt-3 text-xs leading-5" style={{ color: submission.verificationStatus === "rejected" ? "var(--danger)" : "var(--text-muted)" }}>
            {submission.verificationReason}
          </p>
        ) : submission?.verificationStatus ? (
          <p className="narrative mt-3 text-xs leading-5">{VERIFICATION[submission.verificationStatus] || ""}</p>
        ) : null}
        {submission?.reviewFeedback && submission.reviewStatus !== "approved" ? (
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--line)" }}>
            <p className="meta">Review feedback</p>
            <p className="narrative mt-1 text-xs leading-5">{submission.reviewFeedback}</p>
          </div>
        ) : null}
        <p className="meta mt-4 inline-flex items-center gap-1.5"><GitFork size={12} /> Fork after the challenge was published.</p>
      </aside>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div className="mt-2 first:mt-0">
      <p className="meta">{label}</p>
      <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{String(value).replaceAll("_", " ")}</p>
    </div>
  );
}
