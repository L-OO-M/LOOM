"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshRepoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/github/sync", { method: "POST" });
      const data = await res.json();
      if (!data?.ok) {
        setMsg(data?.error?.message || "Could not refresh from GitHub.");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Network error — nothing was refreshed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" onClick={refresh} disabled={busy} className="text-xs font-semibold hover:underline disabled:opacity-50" style={{ color: "var(--accent)" }}>
        {busy ? "Refreshing…" : "Refresh from GitHub →"}
      </button>
      {msg && <span role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}
