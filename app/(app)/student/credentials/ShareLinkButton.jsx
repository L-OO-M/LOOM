"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatShortDate } from "./proof-format";

// Signed-proof control for one achievement. Talks only to the existing
// POST /api/credentials endpoint (achievementId + expiresInDays 0–730).
// Every async outcome — loading, success, failure — is announced visibly
// and via a live region. Never swallows fetch errors.

const EXPIRY_OPTIONS = [
  { value: 0, label: "Never expires" },
  { value: 30, label: "30 days" },
  { value: 365, label: "1 year" },
  { value: 730, label: "2 years" }
];

function friendlyError(status, data) {
  const message = data?.error?.message || data?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (status === 404) return "That achievement isn't on your record, so no link can be issued.";
  if (status === 401) return "You're signed out. Sign in again to create a proof link.";
  if (!status) return "Couldn't reach the server. Check your connection and try again.";
  return `Issuing failed (error ${status}). Try again in a moment.`;
}

export default function ShareLinkButton({ achievementId, links: initialLinks = [], label = "achievement" }) {
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [showForm, setShowForm] = useState(initialLinks.length === 0);
  const [expiryDays, setExpiryDays] = useState(365);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copiedUrl, setCopiedUrl] = useState("");

  async function issue() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    let status = 0;
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ achievementId, expiresInDays: expiryDays })
      });
      status = res.status;
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(friendlyError(status, data));
      } else {
        const cred = data.data?.credential || {};
        setLinks((prev) => [
          ...prev,
          { url: data.data.url, issuedAt: cred.issued_at || null, expiresAt: cred.expires_at || null }
        ]);
        setNotice("Signed proof link created — anyone with the link can verify it, no account needed.");
        setShowForm(false);
        router.refresh();
      }
    } catch {
      setError(friendlyError(0, null));
    } finally {
      setBusy(false);
    }
  }

  async function copy(url) {
    setError("");
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setNotice("Link copied to clipboard.");
      setTimeout(() => setCopiedUrl((cur) => (cur === url ? "" : cur)), 2500);
    } catch {
      setError("Copy isn't available in this browser — long-press the link to copy it manually.");
    }
  }

  return (
    <div className="min-w-0">
      {links.length > 0 && (
        <ol className="space-y-2.5">
          {links.map((l) => (
            <li key={l.url} className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                <code
                  title={l.url}
                  aria-label={`Public proof link: ${l.url}`}
                  className="min-w-0 max-w-full truncate rounded-lg border px-2 py-1 font-mono text-xs"
                  style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text-muted)" }}
                >
                  {l.url}
                </code>
                <button
                  type="button"
                  onClick={() => copy(l.url)}
                  aria-label={`Copy public proof link for ${label}`}
                  className="shrink-0 text-xs font-semibold hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  {copiedUrl === l.url ? "Copied ✓" : "Copy"}
                </button>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open public proof for ${label} in a new tab`}
                  className="shrink-0 text-xs font-semibold hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Open proof ↗
                </a>
              </span>
              <span className="meta mt-1 block">
                {l.expiresAt ? `Expires ${formatShortDate(l.expiresAt) || "on its expiry date"}` : "Never expires"}
                {links.length > 1 ? ` · link ${links.indexOf(l) + 1} of ${links.length}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}

      {links.length > 0 && !showForm && (
        <button
          type="button"
          onClick={() => { setShowForm(true); setError(""); setNotice(""); }}
          className="mt-2 text-xs font-semibold hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          Issue another link…
        </button>
      )}

      {showForm && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <label className="meta shrink-0" htmlFor={`expiry-${achievementId}`}>
            Link validity
          </label>
          <select
            id={`expiry-${achievementId}`}
            value={expiryDays}
            onChange={(e) => setExpiryDays(Number(e.target.value))}
            disabled={busy}
            className="rounded-lg border px-2 py-1.5 text-xs disabled:opacity-50"
            style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text)" }}
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={issue}
            aria-label={`Create signed proof link for ${label}`}
            className="btn-ink !px-4 !py-1.5 !text-xs disabled:opacity-50"
          >
            {busy ? "Issuing…" : links.length > 0 ? "Issue link" : "Create signed proof"}
          </button>
        </div>
      )}

      <div aria-live="polite" className="min-w-0">
        {error && (
          <p role="alert" className="mt-2 max-w-md text-xs font-medium leading-5" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {!error && notice && (
          <p className="mt-2 max-w-md text-xs leading-5" style={{ color: "var(--text-muted)" }}>
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
