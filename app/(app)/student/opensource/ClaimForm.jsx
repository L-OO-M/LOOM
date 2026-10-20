"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { inputStyle, Field } from "@/components/ui";

const TYPES = [
  { value: "pr", label: "Pull request" },
  { value: "issue", label: "Issue" },
  { value: "review", label: "Review" }
];

export default function ClaimForm({ initialRepo = "" }) {
  const router = useRouter();
  const [prUrl, setPrUrl] = useState("");
  const [contributionType, setContributionType] = useState("pr");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    let data;
    try {
      const res = await fetch("/api/opensource/contributions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prUrl, title, contributionType })
      });
      data = await res.json();
    } catch {
      data = null;
    }
    setBusy(false);
    if (!data?.ok) {
      setError(data?.error?.message || "Could not claim this contribution. Check the URL and try again.");
      return;
    }
    setPrUrl("");
    setTitle("");
    setContributionType("pr");
    setSuccess("Contribution claimed. It will be marked verified when the contribution is confirmed.");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <Field label="Contribution URL" hint="Must link a pull request, issue, or review in a tracked repository above.">
        <input
          value={prUrl}
          onChange={(e) => {
            const next = e.target.value;
            setPrUrl(next);
            if (/\/issues\/\d+/i.test(next)) setContributionType("issue");
            else if (/\/pull\/\d+/i.test(next) && contributionType === "issue") setContributionType("pr");
          }}
          required
          type="url"
          placeholder={initialRepo ? `https://github.com/${initialRepo}/pull/123` : "https://github.com/owner/repo/pull/123"}
          style={inputStyle}
          aria-label="Contribution URL"
        />
      </Field>
      {initialRepo && (
        <p className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>
          Claiming in <span className="font-mono font-semibold" style={{ color: "var(--text)" }}>{initialRepo}</span>. The URL must be a PR or issue in this repository.
        </p>
      )}
      <Field label="Contribution type" hint="The URL decides PR vs issue. Choose Review only when you reviewed someone else's pull request.">
        <select value={contributionType} onChange={(e) => setContributionType(e.target.value)} style={inputStyle} aria-label="Contribution type">
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </Field>
      <Field label="Title (optional)">
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Fix login redirect on mobile" style={inputStyle} aria-label="Contribution title (optional)" />
      </Field>
      {error && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      {success && <p role="status" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{success}</p>}
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Claiming…" : "Claim contribution"}
      </button>
    </form>
  );
}
