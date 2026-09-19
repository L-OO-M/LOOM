"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function postJSON(url, body) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  } catch {
    // Never throw: every caller renders {ok:false} as an inline message
    // instead of wedging its button in a busy state.
    return { ok: false, error: { message: "Couldn't reach the server. Try again." } };
  }
}

export function MarkCompleteButton({ nodeId, completed }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/roadmap/progress", { nodeId, status: "completed" });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }
  if (completed) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Completed ✓</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Saving…" : "Mark complete"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function ResourceCompleteButton({ resourceId, completed }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/resources", { resourceId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Couldn't save. Try again.");
      return;
    }
    router.refresh();
  }
  if (completed) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Done ✓</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="rounded-lg border px-3 py-1.5 text-xs font-semibold transition active:scale-[0.97] disabled:opacity-50" style={{ borderColor: "var(--line)", color: "var(--text)" }}>
        {busy ? "Saving…" : "Mark done"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function ContestRegisterButton({ contestId, registered, open }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/contests", { contestId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }
  if (registered) return <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>Registered ✓</span>;
  if (!open) return <span className="text-xs" style={{ color: "var(--text-muted)" }}>Not open</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Registering…" : "Register"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function MentorRequestButton({ mentorId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function run() {
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/mentorship", { mentorId });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    setMsg("Requested ✓");
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={run} disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Requesting…" : "Request session"}
      </button>
      {msg && <span className="text-xs" style={{ color: msg.includes("✓") ? "var(--accent)" : "var(--danger)" }}>{msg}</span>}
    </span>
  );
}

export function MarkNotificationRead({ id, read }) {
  const router = useRouter();
  if (read) return null;
  async function run() {
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    router.refresh();
  }
  return (
    <button onClick={run} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
      Mark read
    </button>
  );
}

export function GithubConnectForm({ initial = "", submitLabel = "Link GitHub" }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const data = await postJSON("/api/github", { githubUsername: username.trim() });
    setBusy(false);
    if (!data.ok) {
      setMsg(data.error?.message || "Failed");
      return;
    }
    router.refresh();
  }
  return (
    <form onSubmit={run} className="mt-4 flex flex-wrap items-center gap-2">
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="github-username" required pattern="[a-zA-Z0-9-]+" maxLength={39}
        style={{ borderRadius: 10, border: "1px solid var(--line)", background: "var(--bg-muted)", color: "var(--text)", padding: "8px 12px", fontSize: 14 }} />
      <button disabled={busy} className="btn-ink disabled:opacity-50">
        {busy ? "Linking…" : submitLabel}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--danger)" }}>{msg}</span>}
    </form>
  );
}
