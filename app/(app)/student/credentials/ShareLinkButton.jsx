"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ShareLinkButton({ achievementId, existingUrl }) {
  const router = useRouter();
  const [url, setUrl] = useState(existingUrl || "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function issue() {
    setBusy(true);
    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ achievementId })
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      setUrl(data.data.url);
      router.refresh();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  if (!url) {
    return (
      <button disabled={busy} onClick={issue} className="btn-ink disabled:opacity-50">
        {busy ? "Issuing…" : "Create share link"}
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <code className="max-w-44 truncate rounded-lg border px-2 py-1 font-mono text-xs" style={{ borderColor: "var(--line)", background: "var(--bg-muted)", color: "var(--text-muted)" }}>{url}</code>
      <button onClick={copy} className="shrink-0 text-xs font-medium" style={{ color: "var(--accent)" }}>{copied ? "Copied ✓" : "Copy"}</button>
    </span>
  );
}
