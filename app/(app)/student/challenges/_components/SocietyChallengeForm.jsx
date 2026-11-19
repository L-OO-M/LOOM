"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, GitFork, Send } from "lucide-react";
import { ActionFeedback, postJSON } from "@/components/loom/useAction";
import { Field, inputStyle } from "@/components/ui";
import { StatusPill } from "@/components/loom/primitives";

const VERIFICATION_TEXT = {
  verified: "Fork verified and waiting for a domain lead.",
  error: "GitHub could not complete the check. Your submission stays pending; try again shortly.",
  rejected: "This fork did not pass the automated check."
};

/**
 * Submit a fork of a society (or curated) repository for one domain.
 *
 * The form deliberately asks for the upstream repo first: the API refuses a
 * fork that is not a fork of a repo this domain actually points at, and showing
 * the choice makes that rule legible before the member pastes a URL.
 */
export function SocietyChallengeForm({ domain, choices = [], submissions = [], repo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [repoFullName, setRepoFullName] = useState(choices[0]?.fullName || repo);

  const latest = submissions[0] || null;
  const approved = submissions.find((item) => item.status === "approved") || null;

  async function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError("");
    const result = await postJSON("/api/challenges/oss", "POST", {
      domain,
      repoFullName,
      forkUrl: String(data.get("forkUrl") || ""),
      note: String(data.get("note") || "")
    });
    if (result.ok) {
      setMessage(result.data?.message || "Submission saved.");
      router.refresh();
    } else {
      setError(result.error?.message || "Could not submit this fork.");
    }
    setBusy(false);
  }

  return (
    <div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--bg-elevated)" }}
      >
        <Field
          label="Challenge repository"
          hint="The fork must be a fork of this repository, so the reviewer can compare against it."
        >
          <select
            value={repoFullName}
            onChange={(event) => setRepoFullName(event.target.value)}
            style={inputStyle}
            aria-label="Challenge repository"
          >
            {choices.map((choice) => (
              <option key={choice.fullName} value={choice.fullName}>
                {choice.fullName}{choice.source === "society" ? " (society)" : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Your fork URL"
          hint="Public GitHub fork owned by your linked account, with at least one commit from you."
        >
          <input
            type="url"
            name="forkUrl"
            required
            maxLength={500}
            defaultValue={latest?.forkUrl || ""}
            placeholder="https://github.com/you/buggy"
            style={inputStyle}
          />
        </Field>

        <Field label="What did you fix?" hint="One or two lines. This is what the reviewer reads first.">
          <textarea
            name="note"
            rows={3}
            maxLength={1000}
            defaultValue={latest?.note || ""}
            placeholder="Fixed the stale cart total in campusquest/Checkout.jsx by recomputing on quantity change."
            style={{ ...inputStyle, minHeight: "4.5rem" }}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-ink inline-flex items-center gap-1.5" disabled={busy}>
            <Send size={14} /> {busy ? "Checking your fork…" : latest ? "Resubmit fork" : "Submit fork"}
          </button>
          <a
            href={repo}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            style={{ color: "var(--accent)" }}
          >
            <ExternalLink size={12} /> Open the repository
          </a>
        </div>
        <ActionFeedback msg={message} error={error} />
      </form>

      <aside
        className="rounded-2xl border p-5"
        style={{ borderColor: "var(--line)", background: "var(--bg)" }}
      >
        <p className="meta inline-flex items-center gap-1.5"><GitFork size={12} /> Your submission</p>
        {!latest ? (
          <p className="narrative mt-2 text-sm leading-6">
            Nothing submitted yet. Fork the repository, fix one bug, commit, then paste the fork link.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill>{latest.status}</StatusPill>
              <StatusPill>{latest.verificationStatus.replaceAll("_", " ")}</StatusPill>
            </div>
            <div>
              <p className="meta">Upstream</p>
              <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{latest.repoFullName}</p>
            </div>
            <a
              href={latest.forkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
              style={{ color: "var(--accent)" }}
            >
              <ExternalLink size={12} /> Open your fork
            </a>
            {latest.verificationReason ? (
              <p
                className="text-xs leading-5"
                style={{
                  color:
                    latest.verificationStatus === "rejected" ? "var(--danger)" : "var(--text-muted)"
                }}
              >
                {latest.verificationReason}
              </p>
            ) : (
              <p className="narrative text-xs leading-5">
                {VERIFICATION_TEXT[latest.verificationStatus] || ""}
              </p>
            )}
            {latest.reviewFeedback ? (
              <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
                <p className="meta">Lead feedback</p>
                <p className="narrative mt-1 text-xs leading-5">{latest.reviewFeedback}</p>
              </div>
            ) : null}
          </div>
        )}
        {approved ? (
          <p className="mt-4 border-t pt-3 text-xs font-semibold" style={{ borderColor: "var(--line)", color: "var(--accent)" }}>
            Approved: this work is on your chapter standing.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
