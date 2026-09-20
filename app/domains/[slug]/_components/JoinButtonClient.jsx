"use client";

import { useState } from "react";

export function JoinButtonClient({ departmentId }) {
  const [state, setState] = useState("idle");
  const label =
    state === "joining" ? "Joining…" : state === "done" ? "You are a member ✓" : state === "error" ? "Join failed — try again" : "Join this department";
  async function onClick() {
    if (state === "joining" || state === "done") return;
    setState("joining");
    try {
      const r = await fetch(`/api/departments/${encodeURIComponent(departmentId)}/join`, { method: "POST" });
      if (r.status === 401) { window.location.href = "/register"; return; }
      const d = await r.json().catch(() => null);
      setState(d?.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <button type="button" onClick={onClick} disabled={state === "joining" || state === "done"} className="btn-ink !px-6 !py-3 !text-base disabled:opacity-60">
      {label}
    </button>
  );
}
