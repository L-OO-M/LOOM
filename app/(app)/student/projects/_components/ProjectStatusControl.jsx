"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS = [
  { value: "active", label: "Active", hint: "In progress" },
  { value: "completed", label: "Completed", hint: "Shipped & real" },
  { value: "archived", label: "Archived", hint: "Shelved" },
];

export default function ProjectStatusControl({ projectId, current }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function change(next) {
    if (next === current || busy) return;
    setBusy(next);
    setMsg("");
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!data.ok) {
        setMsg(data.error?.message || "Status update failed.");
        return;
      }
      router.refresh();
    } catch {
      setMsg("Network error — status was not changed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Change project status">
        {OPTIONS.map((o) => {
          const isCurrent = o.value === current;
          const isBusy = busy === o.value;
          return (
            <button
              key={o.value}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => change(o.value)}
              aria-pressed={isCurrent}
              title={o.hint}
              className="rounded-full px-4 py-1.5 text-sm font-medium transition active:scale-[0.97] disabled:opacity-50"
              style={isCurrent
                ? { background: "var(--text)", color: "var(--bg)" }
                : { background: "transparent", color: "var(--text-muted)", border: "1px solid var(--line)" }}
            >
              {isBusy ? "Saving…" : o.label}
            </button>
          );
        })}
      </div>
      {msg && <p role="alert" className="mt-2 text-xs" style={{ color: "var(--danger)" }}>{msg}</p>}
    </div>
  );
}
